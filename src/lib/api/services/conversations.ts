import type { ApiClient } from "../client";
import type {
  ComparisonResult,
  Conversation,
  ContextStats,
  SearchHit,
  ShareLink,
} from "../../types";

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
      patch: {
        pinned?: boolean;
        archived?: boolean;
        projectId?: string | null;
        tags?: string[];
        color?: string;
        incognito?: boolean;
        sortOrder?: number;
        summary?: string;
      }
    ): Promise<{ conversation: Conversation }> {
      return client.patch(`/conversations/${id}`, patch);
    },
    remove(id: string): Promise<void> {
      return client.delete(`/conversations/${id}`);
    },
    bulk(action: "archive" | "unarchive" | "delete" | "pin" | "unpin", ids: string[]): Promise<{ updated: number }> {
      return client.post("/conversations/bulk", { ids, action });
    },
    tag(ids: string[], tag: string, remove = false): Promise<{ updated: number }> {
      return client.post("/conversations/bulk", { ids, tag, remove });
    },
    merge(targetId: string, otherId: string): Promise<{ conversation: Conversation }> {
      return client.post("/conversations/merge", { targetId, otherId });
    },
    duplicate(id: string): Promise<{ conversation: Conversation }> {
      return client.post(`/conversations/${id}/duplicate`, {});
    },
    reorder(id: string, direction: "up" | "down"): Promise<{ ok: true }> {
      return client.post(`/conversations/${id}/reorder`, { direction });
    },
    contextPreview(id: string): Promise<{ stats: ContextStats }> {
      return client.get(`/conversations/${id}/context`);
    },
    compare(id: string, content: string, modelIds: string[]): Promise<{ results: ComparisonResult[] }> {
      return client.post(`/conversations/${id}/compare`, { content, modelIds });
    },
    shares(id: string): Promise<{ shares: ShareLink[] }> {
      return client.get(`/conversations/${id}/share`);
    },
    createShare(
      id: string,
      options: { expiresInHours?: number; password?: string } = {}
    ): Promise<{ share: ShareLink; url: string }> {
      return client.post(`/conversations/${id}/share`, options);
    },
    revokeShare(token: string): Promise<void> {
      return client.delete(`/shares/${token}`);
    },
    setMessageBookmark(conversationId: string, messageId: string, bookmarked: boolean): Promise<{ bookmarked: boolean }> {
      return client.patch(`/conversations/${conversationId}/messages/${messageId}`, { bookmarked });
    },
    sendMessageFeedback(
      conversationId: string,
      messageId: string,
      rating: 1 | -1,
      reason = ""
    ): Promise<void> {
      return client.post(`/conversations/${conversationId}/messages/${messageId}/feedback`, { rating, reason });
    },
    bookmarks(): Promise<{ bookmarks: SearchHit[] }> {
      return client.get("/bookmarks");
    },
    search(query: string): Promise<{ results: SearchHit[] }> {
      return client.get(`/search?q=${encodeURIComponent(query)}`);
    },
  };
}

export type ConversationsService = ReturnType<typeof createConversationsService>;
