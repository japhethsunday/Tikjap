import { rateLimit } from "../rate-limit";
import { ALL_TOOLS } from "./definitions";
import type { ServerToolDefinition, ToolRunContext, ToolRunResult } from "./types";
import type { ToolPermission } from "@/lib/tools/types";

export type { ServerToolDefinition, ToolRunContext, ToolRunResult, ToolProgressEvent } from "./types";
export { ALL_TOOLS } from "./definitions";

const BY_ID = new Map<string, ServerToolDefinition>(ALL_TOOLS.map((tool) => [tool.id, tool]));

export function getServerTool(id: string): ServerToolDefinition | undefined {
  return BY_ID.get(id);
}

/** Tools this deployment can actually run, given the configured credentials. */
export function availableTools(): ServerToolDefinition[] {
  return ALL_TOOLS.filter((tool) => tool.isAvailable?.() ?? true);
}

export function isToolAvailable(id: string): boolean {
  const tool = BY_ID.get(id);
  if (!tool) return false;
  return tool.isAvailable?.() ?? true;
}

/**
 * Per-tool, per-user rate limits.
 *
 * Tools are far more expensive than a plain completion — deep research fans out
 * into a dozen outbound requests, code execution spins up a WASM runtime, image
 * generation costs real money — so each gets its own budget rather than
 * sharing the chat limit.
 */
const TOOL_LIMITS: Record<ToolPermission, { limit: number; windowMs: number }> = {
  web_search: { limit: 30, windowMs: 60_000 },
  url_analysis: { limit: 20, windowMs: 60_000 },
  file_analysis: { limit: 30, windowMs: 60_000 },
  data_analysis: { limit: 20, windowMs: 60_000 },
  code_execution: { limit: 20, windowMs: 60_000 },
  image_generation: { limit: 5, windowMs: 60_000 },
  deep_research: { limit: 3, windowMs: 300_000 },
};

export function checkToolRateLimit(userId: string, toolId: ToolPermission) {
  const config = TOOL_LIMITS[toolId] ?? { limit: 20, windowMs: 60_000 };
  return rateLimit(`tool:${toolId}:${userId}`, config.limit, config.windowMs);
}

/** Hard ceiling on total tool calls per assistant turn, to bound cost and latency. */
export const MAX_TOOL_CALLS_PER_TURN = 4;

/**
 * Runs a tool with its rate limit, availability and error handling applied.
 * Never throws — a failed tool becomes an observation the model can respond to.
 */
export async function runTool(
  toolId: string,
  input: Record<string, unknown>,
  context: ToolRunContext
): Promise<ToolRunResult> {
  const tool = BY_ID.get(toolId);
  if (!tool) {
    return { ok: false, summary: `Unknown tool "${toolId}".` };
  }
  if (tool.isAvailable && !tool.isAvailable()) {
    return { ok: false, summary: tool.unavailableReason?.() ?? `${tool.name} is not available.` };
  }

  const limit = checkToolRateLimit(context.userId, tool.id);
  if (!limit.ok) {
    return {
      ok: false,
      summary: `${tool.name} is rate limited. Try again in ${limit.retryAfterSeconds} seconds.`,
    };
  }

  try {
    return await tool.run(input, context);
  } catch (error) {
    // Log the detail server-side; return something brand-safe to the model.
    console.error(
      "[tools]",
      JSON.stringify({ tool: tool.id, detail: (error instanceof Error ? error.message : String(error)).slice(0, 300) })
    );
    return { ok: false, summary: `${tool.name} failed to complete.` };
  }
}
