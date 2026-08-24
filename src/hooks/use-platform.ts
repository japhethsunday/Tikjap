"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Assistant, Memory, Project, SavedPrompt } from "@/lib/types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
  });
}

export function useProjectSources(projectId: string) {
  return useQuery({
    queryKey: ["project-sources", projectId],
    queryFn: () => api.projects.sources(projectId),
    enabled: Boolean(projectId),
  });
}

export function useAddProjectSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      ...input
    }: { projectId: string } & { title?: string; url?: string; content?: string; fetchUrl?: boolean }) =>
      api.projects.addSource(projectId, input),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["project-sources", variables.projectId] });
    },
  });
}

export function useDeleteProjectSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, sourceId }: { projectId: string; sourceId: string }) =>
      api.projects.removeSource(projectId, sourceId),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["project-sources", variables.projectId] });
    },
  });
}

export function useProjectActivity(projectId: string) {
  return useQuery({
    queryKey: ["project-activity", projectId],
    queryFn: () => api.projects.activity(projectId),
    enabled: Boolean(projectId),
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
    mutationFn: (input: { content: string; priority?: number; status?: string }) => api.memories.create(input.content, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });
}

export function useReviewMemory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; priority?: number; status?: "approved" | "pending" }) =>
      api.memories.review(id, patch),
    onSuccess: (result: { memory: Memory }) => {
      void queryClient.invalidateQueries({ queryKey: ["memories"] });
      void queryClient.invalidateQueries({ queryKey: ["memory", result.memory.id] });
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
    mutationFn: ({
      id,
      ...patch
    }: { id: string; name?: string; instructions?: string; model?: string; avatar?: string; starters?: string[] }) =>
      api.assistants.update(id, patch),
    onSuccess: (result: { assistant: Assistant }) => {
      void queryClient.invalidateQueries({ queryKey: ["assistants"] });
      void queryClient.invalidateQueries({ queryKey: ["assistant", result.assistant.id] });
    },
  });
}

export function useRollbackAssistant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, versionIndex }: { id: string; versionIndex: number }) =>
      api.assistants.rollback(id, versionIndex),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["assistants"] });
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
    mutationFn: (input: { title: string; body: string; category?: string; tags?: string[] }) => api.prompts.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prompts"] });
    },
  });
}

export function useUpdateSavedPrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: { id: string; title?: string; body?: string; category?: string; tags?: string[] }) =>
      api.prompts.update(id, patch),
    onSuccess: (result: { prompt: SavedPrompt }) => {
      void queryClient.invalidateQueries({ queryKey: ["prompts"] });
      void queryClient.invalidateQueries({ queryKey: ["prompt", result.prompt.id] });
    },
  });
}

export function useRunPrompt() {
  return useMutation({
    mutationFn: (id: string) => api.prompts.run(id),
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

export function useSchedules() {
  return useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.schedules.list(),
  });
}

export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { promptId: string; cadence: string; modelId?: string; conversationId?: string | null }) =>
      api.schedules.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useToggleSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.schedules.setActive(id, active),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.schedules.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useStorageUsage() {
  return useQuery({
    queryKey: ["storage-usage"],
    queryFn: () => api.workspace.storageUsage(),
  });
}

/** The current user's uploaded files, newest first. */
export function useFiles() {
  return useQuery({
    queryKey: ["files"],
    queryFn: () => api.files.list(),
    staleTime: 30_000,
  });
}
