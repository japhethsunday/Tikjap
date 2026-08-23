import type { ToolDefinition, ToolExecutionContext, ToolResult, ToolProgress } from "./types";
import { getTool } from "./registry";
import { v4 as uuidv4 } from "uuid";

export class ToolExecutor {
  private abortControllers = new Map<string, AbortController>();

  async execute<TInput, TOutput>(
    tool: ToolDefinition<TInput, TOutput>,
    input: TInput,
    context: ToolExecutionContext,
    onProgress?: (progress: ToolProgress) => void
  ): Promise<ToolResult<TOutput>> {
    const callId = uuidv4();
    const abortController = new AbortController();
    this.abortControllers.set(callId, abortController);

    const combinedSignal = AbortSignal.any([context.abortSignal, abortController.signal]);

    const executionContext: ToolExecutionContext = {
      ...context,
      abortSignal: combinedSignal,
      onProgress: (progress) => {
        onProgress?.(progress);
      },
    };

    try {
      const result = await tool.handler(input, executionContext);
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { success: false, error: "Tool execution aborted" };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Tool execution failed",
      };
    } finally {
      this.abortControllers.delete(callId);
    }
  }

  abort(callId: string): void {
    const controller = this.abortControllers.get(callId);
    if (controller) {
      controller.abort();
    }
  }

  abortAll(): void {
    for (const controller of this.abortControllers.values()) {
      controller.abort();
    }
    this.abortControllers.clear();
  }
}

export const toolExecutor = new ToolExecutor();

export async function executeTool<TInput, TOutput>(
  toolId: string,
  input: TInput,
  context: ToolExecutionContext,
  onProgress?: (progress: ToolProgress) => void
): Promise<ToolResult<TOutput>> {
  const tool = getTool<TInput, TOutput>(toolId);
  if (!tool) {
    return { success: false, error: `Tool ${toolId} not found` };
  }
  return toolExecutor.execute(tool, input, context, onProgress);
}