"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Assistant, Project } from "@/lib/types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string; instructions?: string }) => api.projects.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; description?: string; instructions?: string }) =>
      api.projects.update(id, patch),
    onSuccess: (result: { project: Project }) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["project", result.project.id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useMemories() {
  return useQuery({
    queryKey: ["memories"],
    queryFn: () => api.memories.list(),
  });
}

export function useCreateMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => api.memories.create(content),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.memories.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });
}

export function useAssistants() {
  return useQuery({
    queryKey: ["assistants"],
    queryFn: () => api.assistants.list(),
  });
}

export function useCreateAssistant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; instructions?: string; model?: string }) => api.assistants.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assistants"] });
    },
  });
}

export function useUpdateAssistant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; instructions?: string; model?: string }) =>
      api.assistants.update(id, patch),
    onSuccess: (result: { assistant: Assistant }) => {
      void queryClient.invalidateQueries({ queryKey: ["assistants"] });
      void queryClient.invalidateQueries({ queryKey: ["assistant", result.assistant.id] });
    },
  });
}

export function useDeleteAssistant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.assistants.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assistants"] });
    },
  });
}

export function useSavedPrompts() {
  return useQuery({
    queryKey: ["prompts"],
    queryFn: () => api.prompts.list(),
  });
}

export function useCreateSavedPrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; body: string }) => api.prompts.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

export function useDeleteSavedPrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.prompts.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}
