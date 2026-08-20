import { ApiError, NetworkError, parseErrorBody, type ApiErrorBody } from "./errors";

export interface ClientConfig {
  baseUrl: string;
  fetch?: typeof fetch;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  credentials?: RequestCredentials;
}

const DEFAULT_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
};

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessToken?: () => string | null;
  private readonly onUnauthorized?: () => void;

  constructor(config: ClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.getAccessToken = config.getAccessToken;
    this.onUnauthorized = config.onUnauthorized;
  }

  setOnUnauthorized(handler?: () => void) {
    (this as unknown as { onUnauthorized?: () => void }).onUnauthorized = handler;
  }

  private buildUrl(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${normalized}`;
  }

  private buildHeaders(options: RequestOptions): Headers {
    const headers = new Headers(options.headers ?? {});
    for (const [key, value] of Object.entries(DEFAULT_HEADERS)) {
      if (!headers.has(key)) headers.set(key, value);
    }
    const token = this.getAccessToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, signal } = options;
    const headers = this.buildHeaders(options);
    const hasBody = body !== undefined && method !== "GET";

    let response: Response;
    try {
      response = await this.fetchImpl(this.buildUrl(path), {
        method,
        headers,
        body: hasBody ? JSON.stringify(body) : undefined,
        signal,
        credentials: options.credentials ?? "include",
      });
    } catch (error) {
      if (signal?.aborted) {
        throw new ApiError(0, "network", "Request aborted.");
      }
      throw new NetworkError(error);
    }

    if (response.status === 401 && this.onUnauthorized) {
      this.onUnauthorized();
    }

    if (!response.ok) {
      let payload: ApiErrorBody = {};
      try {
        payload = (await response.json()) as ApiErrorBody;
      } catch {
        // non-JSON error body
      }
      const { code, message, details } = parseErrorBody(payload, `Request failed (${response.status}).`);
      throw new ApiError(response.status, code, message, details);
    }

    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }
    return (await response.text()) as T;
  }

  get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body });
  }

  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(path, { ...options, method: "PATCH", body });
  }

  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(path, { ...options, method: "PUT", body });
  }

  delete<T>(path: string, options?: Omit<RequestOptions, "method">): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }

  async upload<T>(path: string, file: File, options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {}): Promise<T> {
    const { onProgress, signal } = options;
    const url = this.buildUrl(path);
    const headers = new Headers();
    const token = this.getAccessToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const xhr = new XMLHttpRequest();
    const result = await new Promise<T>((resolve, reject) => {
        xhr.open("POST", url);
        xhr.withCredentials = true;
        for (const [key, value] of headers.entries()) xhr.setRequestHeader(key, value);
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText) as T);
            } catch {
              resolve(xhr.responseText as T);
            }
          } else {
            let payload: ApiErrorBody = {};
            try {
              payload = JSON.parse(xhr.responseText) as ApiErrorBody;
            } catch {
              // ignore
            }
            const { code, message, details } = parseErrorBody(payload, `Upload failed (${xhr.status}).`);
            reject(new ApiError(xhr.status, code, message, details));
          }
        });
        xhr.addEventListener("error", () => reject(new NetworkError(new Error("upload network error"))));
        xhr.addEventListener("abort", () => reject(new ApiError(0, "network", "Upload aborted.")));
        if (signal) {
          signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }
        const form = new FormData();
        form.append("file", file);
        xhr.send(form);
      });
      return result;
  }
}