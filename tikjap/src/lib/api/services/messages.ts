import type { ApiClient } from "../client";
import { collectStream, openStream } from "../stream";
import type { ChatMessage, ChatRequest, StreamChunk } from "../../types";

export function createMessagesService(client: ApiClient) {
  return {
    list(conversationId: string): Promise<{ messages: ChatMessage[] }> {
      return client.get(`/conversations/${conversationId}/messages`);
    },

    async stream(
      conversationId: string,
      request: ChatRequest,
      onChunk: (chunk: StreamChunk) => void,
      options: { signal?: AbortSignal; onUnauthorized?: () => void } = {}
    ): Promise<void> {
      await collectStream(
        `/conversations/${conversationId}/messages`,
        request,
        (chunk) => {
          if (chunk.type === "error" && options.onUnauthorized && chunk.error === "unauthorized") {
            options.onUnauthorized();
          }
          onChunk(chunk);
        },
        { signal: options.signal }
      );
    },

    async start(
      conversationId: string,
      request: ChatRequest,
      options: { signal?: AbortSignal } = {}
    ): Promise<ReturnType<typeof openStream>> {
      return openStream(`/conversations/${conversationId}/messages`, request, options);
    },
  };
}

export type MessagesService = ReturnType<typeof createMessagesService>;