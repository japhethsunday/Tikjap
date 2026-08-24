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
  /**
   * Set only when the turn originates in the Code workspace. The file tools
   * are scoped to it, so a chat outside a project cannot reach project files
   * at all — the tools are not even offered to the planner.
   */
  projectId?: string;
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
  /** Requires a project in context; hidden from ordinary chat turns. */
  requiresProject?: boolean;
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
