import {
  AIProvider,
  ChatMessageInput,
  ProviderError,
  PROVIDER_DOWN_MESSAGE,
  UpstreamDelta,
  UpstreamPlanRequest,
  UpstreamPlanResult,
  UpstreamRequest,
  UpstreamToolCall,
} from "./types";

/**
 * OpenAI-compatible chat-completions provider backed by an internal inference
 * gateway. The base URL and API key live only in server-side environment
 * variables; upstream model ids are resolved from the internal routing table
 * and never exposed to clients.
 */
const BASE_URL = process.env.AI_GATEWAY_BASE_URL?.trim().replace(/\/+$/, "") || "https://integrate.api.nvidia.com/v1";

function apiKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.NVIDIA_API_KEY?.trim();
  if (!key) throw new ProviderError("auth", 500, PROVIDER_DOWN_MESSAGE, "Missing AI gateway API key");
  return key;
}

function mapHttpError(status: number, body: string): ProviderError {
  const detail = body.slice(0, 500);
  switch (true) {
    case status === 401 || status === 403:
      return new ProviderError("auth", status, PROVIDER_DOWN_MESSAGE, detail);
    case status === 429:
      return new ProviderError("rate_limit", status, "You're sending messages too quickly. Please wait a moment and try again.", detail);
    case status === 404:
      return new ProviderError("invalid_request", status, PROVIDER_DOWN_MESSAGE, `model unavailable: ${detail}`);
    case status === 400 && /context|length|token/i.test(body):
      return new ProviderError("context_length", status, "This conversation has grown too long for this model. Start a new chat or pick another model.", detail);
    case status >= 400 && status < 500:
      return new ProviderError("invalid_request", status, PROVIDER_DOWN_MESSAGE, detail);
    default:
      return new ProviderError("unavailable", status, PROVIDER_DOWN_MESSAGE, detail);
  }
}

function mapTransportError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/abort/i.test(message)) {
    return new ProviderError("timeout", 504, PROVIDER_DOWN_MESSAGE, message);
  }
  return new ProviderError("network", 502, PROVIDER_DOWN_MESSAGE, message);
}

async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<UpstreamDelta, void, unknown> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
        };
        const choice = parsed.choices?.[0];
        const delta = choice?.delta?.content ?? "";
        if (delta) yield { delta };
        if (choice?.finish_reason) yield { finishReason: choice.finish_reason };
      } catch {
        // Skip malformed keep-alive lines; never crash a stream on one bad frame.
      }
    }
  }
}

export const nimProvider: AIProvider = {
  id: "nim",
  async *streamChat(request: UpstreamRequest): AsyncGenerator<UpstreamDelta, void, unknown> {
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 120_000);
    const onAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const body: Record<string, unknown> = {
        model: request.model,
        messages: request.messages,
        temperature: request.temperature,
        top_p: request.topP,
        max_tokens: request.maxTokens,
        stream: true,
      };
      if (request.thinking) {
        body.chat_template_kwargs = { enable_thinking: true };
      }
      try {
        response = await fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${apiKey()}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        throw mapTransportError(error);
      }
      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => "");
        throw mapHttpError(response.status, text);
      }
      try {
        for await (const delta of parseSseStream(response.body)) {
          yield delta;
        }
      } catch (error) {
        throw mapTransportError(error);
      }
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", onAbort);
    }
  },
};

/**
 * Non-streaming completion used for the tool-planning step.
 *
 * Planning is a single short call whose only interesting output is the
 * `tool_calls` array, so streaming it would add complexity for no benefit. The
 * model may legitimately answer without calling anything — that is a valid plan
 * meaning "no tool needed", not an error.
 */
export async function planWithTools(request: UpstreamPlanRequest): Promise<UpstreamPlanResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 45_000);
  const onAbort = () => controller.abort();
  request.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey()}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          tools: request.tools,
          tool_choice: "auto",
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw mapTransportError(error);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw mapHttpError(response.status, text);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
    };

    const message = payload.choices?.[0]?.message;
    const toolCalls: UpstreamToolCall[] = [];

    for (const call of message?.tool_calls ?? []) {
      const name = call.function?.name;
      if (!name) continue;
      let args: Record<string, unknown> = {};
      // Models routinely emit slightly malformed argument JSON. A bad payload
      // should degrade to "call the tool with no arguments" rather than kill
      // the turn, since most tools can fall back to conversation context.
      try {
        const parsed: unknown = JSON.parse(call.function?.arguments || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = {};
      }
      toolCalls.push({ id: call.id || `call_${toolCalls.length}`, name, arguments: args });
    }

    return { toolCalls, content: message?.content ?? "" };
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Single-shot completion. Used by features that need a whole answer rather than
 * a stream — model comparison and scheduled prompts — so they run real
 * inference instead of fabricating text.
 */
export async function complete(request: {
  model: string;
  messages: ChatMessageInput[];
  maxTokens: number;
  temperature: number;
  topP?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? 90_000);
  const onAbort = () => controller.abort();
  request.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey()}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          top_p: request.topP ?? 0.95,
          max_tokens: request.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw mapTransportError(error);
    }

    if (!response.ok) {
      throw mapHttpError(response.status, await response.text().catch(() => ""));
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      throw new ProviderError("unavailable", 502, PROVIDER_DOWN_MESSAGE, "empty completion");
    }
    return content;
  } finally {
    clearTimeout(timeout);
    request.signal?.removeEventListener("abort", onAbort);
  }
}
