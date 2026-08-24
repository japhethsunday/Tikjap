import { planWithTools } from "../providers/nim";
import type { ChatMessageInput, ToolDefinition } from "../providers/types";
import { ProviderError } from "../providers/types";
import {
  MAX_TOOL_CALLS_PER_TURN,
  PROJECT_TOOL_IDS,
  getServerTool,
  isToolAvailable,
  runTool,
  type ToolProgressEvent,
} from "./index";
import type { ToolRunContext } from "./types";
import type { AttachmentRef } from "@/lib/types";
import type { ToolPermission } from "@/lib/tools/types";

/**
 * The AI orchestrator.
 *
 *   User → Tikjap API → orchestrator → tool → tool result → AI response
 *
 * Given the tools the user enabled for this turn, ask the model which (if any)
 * to call, execute them, and hand the observations back so the streaming
 * answer is grounded in real results. When the model asks for nothing, the turn
 * proceeds exactly as it did before tools existed — the orchestrator is
 * transparent in that case.
 */

export interface ToolCallRecord {
  id: string;
  toolId: string;
  input: Record<string, unknown>;
  ok: boolean;
  summary: string;
  data?: Record<string, unknown>;
  sources?: Array<{ title: string; url: string; snippet: string }>;
  durationMs: number;
}

export interface OrchestrationResult {
  calls: ToolCallRecord[];
  /** System-role observations to append to the generation context. */
  observations: ChatMessageInput[];
  /**
   * User-facing explanation when tools were requested but did not run. Without
   * this a swallowed planning failure is indistinguishable from a tool that
   * simply chose not to fire, and the whole feature looks dead.
   */
  notice?: string;
}

export interface OrchestrateParams {
  userId: string;
  conversationId: string;
  messageId: string;
  prompt: string;
  history: ChatMessageInput[];
  enabledTools: ToolPermission[];
  attachments: AttachmentRef[];
  /** Set for Code workspace turns; unlocks the project file tools. */
  projectId?: string;
  upstreamModel: string;
  signal: AbortSignal;
  onToolStart: (call: { id: string; toolId: string; input: Record<string, unknown> }) => void;
  onToolProgress: (callId: string, progress: ToolProgressEvent) => void;
  onToolEnd: (record: ToolCallRecord) => void;
}

function toToolDefinition(id: ToolPermission): ToolDefinition | null {
  const tool = getServerTool(id);
  if (!tool) return null;
  return {
    type: "function",
    function: {
      name: tool.id,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

export async function orchestrate(params: OrchestrateParams): Promise<OrchestrationResult> {
  const empty: OrchestrationResult = { calls: [], observations: [] };
  if (params.enabledTools.length === 0 && !params.projectId) return empty;

  // Project tools are implicit in the Code workspace: the user opened a
  // project, which is the consent. They are never available elsewhere.
  const requested = params.projectId
    ? [...new Set([...params.enabledTools, ...PROJECT_TOOL_IDS])]
    : params.enabledTools.filter((id) => !PROJECT_TOOL_IDS.includes(id));

  // Only tools this deployment can actually run.
  const enabled = requested.filter((id) => isToolAvailable(id));
  if (enabled.length === 0) {
    const names = requested
      .map((id) => getServerTool(id)?.name ?? id)
      .join(", ");
    return {
      ...empty,
      notice: `${names} is not configured on this deployment, so it was skipped.`,
    };
  }

  const tools = enabled.map(toToolDefinition).filter((tool): tool is ToolDefinition => tool !== null);
  if (tools.length === 0) return empty;

  // A coding turn is a sequence — list, read, write, run — so it needs more
  // room than a single retrieval call.
  const maxCalls = params.projectId ? 8 : MAX_TOOL_CALLS_PER_TURN;

  const attachmentNote = params.attachments.length
    ? `\nFiles attached to this message: ${params.attachments
        .map((attachment) => `${attachment.name} (id: ${attachment.fileId})`)
        .join(", ")}`
    : "";

  const planMessages: ChatMessageInput[] = [
    {
      role: "system",
      content: [
        "You are Tikjap's tool planner. Decide which tools, if any, are needed to answer the user's latest message.",
        "Call a tool only when it genuinely improves the answer. For general knowledge, opinions, writing tasks or chit-chat, call nothing.",
        "Prefer one well-chosen tool. Use deep_research only for open-ended questions that a single search cannot settle.",
        params.projectId
          ? "You are in the Code workspace with a project open. Understand before you change: list the files, read the ones you will touch, then write complete file contents — never a fragment or a patch, since a write replaces the whole file. Run a JavaScript file afterwards to verify. Do not touch files the request does not concern."
          : "",
        `You may make at most ${maxCalls} tool calls.${attachmentNote}`,
      ].join(" "),
    },
    ...params.history.slice(-6),
    { role: "user", content: params.prompt || "(no message text)" },
  ];

  let plan;
  try {
    plan = await planWithTools({
      model: params.upstreamModel,
      messages: planMessages,
      tools,
      maxTokens: 512,
      temperature: 0,
      signal: params.signal,
    });
  } catch (error) {
    // Planning is best-effort. If the model or gateway cannot plan, fall back
    // to a normal untooled answer rather than failing the user's turn.
    console.error(
      "[tools/plan]",
      JSON.stringify({
        code: error instanceof ProviderError ? error.code : "unknown",
        detail: (error instanceof Error ? error.message : String(error)).slice(0, 200),
      })
    );
    // Tell the user rather than answering as though no tool was ever asked for.
    return {
      ...empty,
      notice:
        "Tools could not run for this message — the model could not be reached for tool planning. The answer below was written without them.",
    };
  }

  const wanted = plan.toolCalls
    // Drop hallucinated tool names and anything the user did not enable.
    .filter((call) => enabled.includes(call.name as ToolPermission))
    .slice(0, maxCalls);

  if (wanted.length === 0) return empty;

  const calls: ToolCallRecord[] = [];
  const observations: ChatMessageInput[] = [];

  for (const call of wanted) {
    if (params.signal.aborted) break;

    const startedAt = Date.now();
    params.onToolStart({ id: call.id, toolId: call.name, input: call.arguments });

    const context: ToolRunContext = {
      userId: params.userId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      attachments: params.attachments,
      projectId: params.projectId,
      signal: params.signal,
      onProgress: (progress) => params.onToolProgress(call.id, progress),
    };

    const result = await runTool(call.name, call.arguments, context);

    const record: ToolCallRecord = {
      id: call.id,
      toolId: call.name,
      input: call.arguments,
      ok: result.ok,
      summary: result.summary,
      data: result.data,
      sources: result.sources,
      durationMs: Date.now() - startedAt,
    };
    calls.push(record);
    params.onToolEnd(record);

    const tool = getServerTool(call.name);
    observations.push({
      role: "system",
      content: [
        `[Tool result — ${tool?.name ?? call.name}${result.ok ? "" : " (failed)"}]`,
        result.summary,
      ].join("\n"),
    });
  }

  if (observations.length) {
    observations.push({
      role: "system",
      content:
        "The tool results above are authoritative for this turn. Base your answer on them, cite source URLs where you used them, and state plainly if a tool failed or returned nothing useful. Never invent results a tool did not return.",
    });
  }

  return { calls, observations };
}
