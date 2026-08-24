import { planWithTools } from "../providers/nim";
import type { ChatMessageInput, UpstreamTool } from "../providers/types";
import { ProviderError } from "../providers/types";
import {
  MAX_TOOL_CALLS_PER_TURN,
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
}

export interface OrchestrateParams {
  userId: string;
  conversationId: string;
  messageId: string;
  prompt: string;
  history: ChatMessageInput[];
  enabledTools: ToolPermission[];
  attachments: AttachmentRef[];
  upstreamModel: string;
  signal: AbortSignal;
  onToolStart: (call: { id: string; toolId: string; input: Record<string, unknown> }) => void;
  onToolProgress: (callId: string, progress: ToolProgressEvent) => void;
  onToolEnd: (record: ToolCallRecord) => void;
}

function toUpstreamTool(id: ToolPermission): UpstreamTool | null {
  const tool = getServerTool(id);
  if (!tool) return null;
  return {
    type: "function",
    function: {
      name: tool.id,
      description: tool.description,
      parameters: tool.parameters as unknown as Record<string, unknown>,
    },
  };
}

export async function orchestrate(params: OrchestrateParams): Promise<OrchestrationResult> {
  const empty: OrchestrationResult = { calls: [], observations: [] };

  // Only tools the user turned on AND this deployment can actually run.
  const enabled = params.enabledTools.filter((id) => isToolAvailable(id));
  if (enabled.length === 0) return empty;

  const tools = enabled.map(toUpstreamTool).filter((tool): tool is UpstreamTool => tool !== null);
  if (tools.length === 0) return empty;

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
        `You may make at most ${MAX_TOOL_CALLS_PER_TURN} tool calls.${attachmentNote}`,
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
    return empty;
  }

  const requested = plan.toolCalls
    // Drop hallucinated tool names and anything the user did not enable.
    .filter((call) => enabled.includes(call.name as ToolPermission))
    .slice(0, MAX_TOOL_CALLS_PER_TURN);

  if (requested.length === 0) return empty;

  const calls: ToolCallRecord[] = [];
  const observations: ChatMessageInput[] = [];

  for (const call of requested) {
    if (params.signal.aborted) break;

    const startedAt = Date.now();
    params.onToolStart({ id: call.id, toolId: call.name, input: call.arguments });

    const context: ToolRunContext = {
      userId: params.userId,
      conversationId: params.conversationId,
      messageId: params.messageId,
      attachments: params.attachments,
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
