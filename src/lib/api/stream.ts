import { ApiError } from "./errors";
import type { StreamChunk } from "../types";

export interface StreamResult {
  initialResponse: Response;
  reader: ReadableStreamDefaultReader<Uint8Array>;
  cancel: () => Promise<void>;
}

export interface StreamClient {
  buildUrl(path: string): string;
}

/**
 * Starts a streaming request. The body is sent as JSON; the response body is
 * expected to be an SSE stream (`text/event-stream`) with `data:` lines
 * containing JSON payloads.
 */
export async function openStream(
  urlOrPath: string,
  body: unknown,
  options: { signal?: AbortSignal; client?: StreamClient } = {}
): Promise<StreamResult> {
  const url = options.client ? options.client.buildUrl(urlOrPath) : urlOrPath;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
    signal: options.signal,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const payload = (await response.json()) as {
        error?: { message?: string; code?: string };
        message?: string;
      };
      message = payload.error?.message ?? payload.message ?? message;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(response.status, mapStatusToCode(response.status), message);
  }

  if (!response.body) {
    throw new ApiError(0, "stream_error", "The server did not return a stream.");
  }

  const reader = response.body.getReader();
  return {
    initialResponse: response,
    reader,
    cancel: async () => {
      try {
        await reader.cancel();
      } catch {
        // already closed
      }
    },
  };
}

function mapStatusToCode(status: number): "unauthorized" | "forbidden" | "not_found" | "rate_limit" | "internal" {
  switch (status) {
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 429:
      return "rate_limit";
    default:
      return "internal";
  }
}

/**
 * Parses an SSE stream and yields decoded JSON `data:` payloads. Multi-line
 * chunks and comments are handled. Never emits duplicate payloads for the same
 * event because each event is yielded exactly once.
 */
export async function* readSseEvents(reader: ReadableStreamDefaultReader<Uint8Array>, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseEvent(rawEvent);
        if (event) yield event;
      }
    }
    // Flush remaining buffer (some streams may not end with a blank line)
    if (buffer.trim()) {
      const event = parseEvent(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseEvent(raw: string): StreamChunk | null {
  let data = "";
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      data += (data ? "\n" : "") + line.slice(5).replace(/^ /, "");
    }
    // Comments and other event fields are ignored.
  }
  if (!data.trim()) return null;
  try {
    return JSON.parse(data) as StreamChunk;
  } catch {
    return null;
  }
}

export async function collectStream(
  url: string,
  body: unknown,
  onChunk: (chunk: StreamChunk) => void,
  options: { signal?: AbortSignal; client?: StreamClient } = {}
): Promise<void> {
  const { reader } = await openStream(url, body, options);
  try {
    for await (const chunk of readSseEvents(reader, options.signal)) {
      onChunk(chunk);
    }
  } catch (error) {
    if (!options.signal?.aborted) throw error;
  }
}