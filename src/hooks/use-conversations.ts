"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api";
import type { ListConversationsParams } from "@/lib/api/services/conversations";

export function useConversations(params: ListConversationsParams | string = {}) {
  const normalized: ListConversationsParams = typeof params === "string" ? { query: params } : params;
  const key = JSON.stringify(normalized);
  const query = useQuery({
    queryKey: ["conversations", key],
    queryFn: () => api.conversations.list(normalized),
    enabled: !normalized.query,
  });

  const filtered = useQuery({
    queryKey: ["conversations-search", key],
    queryFn: () => api.conversations.list(normalized),
    enabled: Boolean(normalized.query?.trim()),
  });

  return {
    conversations: (normalized.query ? filtered.data?.conversations : query.data?.conversations) ?? [],
    isLoading: (normalized.query ? filtered.isLoading : query.isLoading),
    isError: (normalized.query ? filtered.isError : query.isError),
    refetch: normalized.query ? filtered.refetch : query.refetch,
  };
}

export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => api.conversations.get(conversationId),
    enabled: Boolean(conversationId),
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; modelId?: string }) => api.conversations.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.conversations.rename(id, title),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["conversation", result.conversation.id] });
    },
  });
}

export function useUpdateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; pinned?: boolean; archived?: boolean; projectId?: string | null }) =>
      api.conversations.update(id, patch),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["conversation", result.conversation.id] });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.conversations.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}