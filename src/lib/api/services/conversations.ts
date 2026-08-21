import type { ApiClient } from "../client";
import type { Conversation } from "../../types";

export interface ListConversationsParams {
  query?: string;
  projectId?: string;
  filter?: "pinned" | "archived";
}

export function createConversationsService(client: ApiClient) {
  return {
    list(params: ListConversationsParams = {}): Promise<{ conversations: Conversation[] }> {
      const search = new URLSearchParams();
      if (params.query) search.set("q", params.query);
      if (params.projectId) search.set("projectId", params.projectId);
      if (params.filter) search.set("filter", params.filter);
      const qs = search.toString();
      return client.get(`/conversations${qs ? `?${qs}` : ""}`);
    },
    create(input: { title?: string; modelId?: string; projectId?: string }): Promise<{ conversation: Conversation }> {
      return client.post("/conversations", input);
    },
    get(id: string): Promise<{ conversation: Conversation }> {
      return client.get(`/conversations/${id}`);
    },
    rename(id: string, title: string): Promise<{ conversation: Conversation }> {
      return client.patch(`/conversations/${id}`, { title });
    },
    update(
      id: string,
      patch: { pinned?: boolean; archived?: boolean; projectId?: string | null }
    ): Promise<{ conversation: Conversation }> {
      return client.patch(`/conversations/${id}`, patch);
    },
    remove(id: string): Promise<void> {
      return client.delete(`/conversations/${id}`);
    },
  };
}

export type ConversationsService = ReturnType<typeof createConversationsService>;
