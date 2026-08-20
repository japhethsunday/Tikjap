"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: () => api.models.list(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: () => api.messages.list(conversationId as string),
    enabled: Boolean(conversationId),
  });
}

export function useAiPreferences() {
  return useQuery({
    queryKey: ["ai-preferences"],
    queryFn: () => api.settings.preferences(),
  });
}