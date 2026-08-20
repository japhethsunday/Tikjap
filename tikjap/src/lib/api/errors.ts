export type ApiErrorCode =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limit"
  | "conflict"
  | "unsupported_file"
  | "file_too_large"
  | "internal"
  | "network"
  | "stream_error";

export interface ApiErrorBody {
  error?: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, string>;
  };
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, string>;
  readonly retryAfterSeconds?: number;

  constructor(status: number, code: ApiErrorCode, message: string, details?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    if (status === 429) this.retryAfterSeconds = 60;
  }

  isUnauthorized(): boolean {
    return this.status === 401 || this.code === "unauthorized";
  }
}

export class NetworkError extends ApiError {
  constructor(cause: unknown) {
    super(0, "network", "Could not reach the server. Check your connection and try again.");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

export function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  return new NetworkError(cause);
}

export function parseErrorBody(payload: ApiErrorBody, fallback: string): Pick<ApiError, "code" | "message" | "details"> {
  if (payload?.error?.message) {
    return {
      code: payload.error.code,
      message: payload.error.message,
      details: payload.error.details,
    };
  }
  if (payload?.message) {
    return { code: "internal", message: payload.message };
  }
  return { code: "internal", message: fallback };
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}