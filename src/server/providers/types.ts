export interface ImagePart {
  type: "image_url";
  image_url: { url: string };
}

export interface TextPart {
  type: "text";
  text: string;
}

export interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string | Array<TextPart | ImagePart>;
}

export interface UpstreamRequest {
  /** Internal upstream model id — resolved server-side, never sent by clients. */
  model: string;
  messages: ChatMessageInput[];
  maxTokens: number;
  temperature: number;
  topP: number;
  thinking?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Normalized provider output — the only shape Tikjap's pipeline understands. */
export interface UpstreamDelta {
  delta?: string;
  finishReason?: string;
}

export type ProviderErrorCode =
  | "auth"
  | "rate_limit"
  | "invalid_request"
  | "context_length"
  | "unavailable"
  | "timeout"
  | "network";

/**
 * Raised by providers on failure. `userMessage` is always a professional,
 * brand-safe message — raw provider responses never reach the client.
 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status: number;
  readonly userMessage: string;
  readonly detail?: string;

  constructor(code: ProviderErrorCode, status: number, userMessage: string, detail?: string) {
    super(`provider:${code}`);
    this.code = code;
    this.status = status;
    this.userMessage = userMessage;
    this.detail = detail;
  }
}

export const PROVIDER_DOWN_MESSAGE =
  "Tikjap is temporarily unable to process this request. Please try again.";

export interface AIProvider {
  readonly id: string;
  streamChat(request: UpstreamRequest): AsyncGenerator<UpstreamDelta, void, unknown>;
}
