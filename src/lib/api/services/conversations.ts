import type { ApiClient } from "../client";
import type { Conversation } from "../../types";

export function createConversationsService(client: ApiClient) {
  return {
    list(query?: string): Promise<{ conversations: Conversation[] }> {
      return client.get(`/conversations${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    },
    create(input: { title?: string; modelId?: string }): Promise<{ conversation: Conversation }> {
      return client.post("/conversations", input);
    },
    get(id: string): Promise<{ conversation: Conversation }> {
      return client.get(`/conversations/${id}`);
    },
    rename(id: string, title: string): Promise<{ conversation: Conversation }> {
      return client.patch(`/conversations/${id}`, { title });
    },
    remove(id: string): Promise<void> {
      return client.delete(`/conversations/${id}`);
    },
  };
}

export type ConversationsService = ReturnType<typeof createConversationsService>;