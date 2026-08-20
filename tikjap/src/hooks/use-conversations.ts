"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api";

export function useConversations(searchQuery?: string) {
  const query = useQuery({
    queryKey: ["conversations", searchQuery ?? ""],
    queryFn: () => api.conversations.list(searchQuery),
    enabled: searchQuery === undefined,
  });

  const filtered = useQuery({
    queryKey: ["conversations-search", searchQuery],
    queryFn: () => api.conversations.list(searchQuery),
    enabled: Boolean(searchQuery?.trim()),
  });

  return {
    conversations: (searchQuery ? filtered.data?.conversations : query.data?.conversations) ?? [],
    isLoading: (searchQuery ? filtered.isLoading : query.isLoading),
    isError: (searchQuery ? filtered.isError : query.isError),
    refetch: searchQuery ? filtered.refetch : query.refetch,
  };
}

export function useConversation(conversationId: string) {
  return useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => api.conversations.get(conversationId),
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