import type { AttachmentRef } from "@/lib/types";
import type { ToolPermission } from "@/lib/tools/types";

export interface ToolProgressEvent {
  stage: string;
  progress: number;
  message?: string;
  sources?: Array<{ title: string; url: string; snippet: string }>;
}

export interface ToolRunContext {
  userId: string;
  conversationId: string;
  messageId: string;
  attachments: AttachmentRef[];
  signal: AbortSignal;
  onProgress: (progress: ToolProgressEvent) => void;
}

export interface ToolRunResult {
  ok: boolean;
  /** Markdown observation fed back to the model as the tool's result. */
  summary: string;
  /** Structured payload for the client to render. */
  data?: Record<string, unknown>;
  sources?: Array<{ title: string; url: string; snippet: string }>;
}

export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, { type: string; description: string }>;
  required: string[];
}

export interface ServerToolDefinition {
  /** Matches the ToolPermission id so UI toggles map 1:1 onto implementations. */
  id: ToolPermission;
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  /** False when the deployment lacks the credentials this tool needs. */
  isAvailable?: () => boolean;
  unavailableReason?: () => string;
  run(input: Record<string, unknown>, context: ToolRunContext): Promise<ToolRunResult>;
}
