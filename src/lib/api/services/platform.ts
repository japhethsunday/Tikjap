import type { ApiClient } from "../client";
import type { Assistant, Memory, Project, SavedPrompt } from "../../types";

export function createProjectsService(client: ApiClient) {
  return {
    list(): Promise<{ projects: Project[] }> {
      return client.get("/projects");
    },
    create(input: { name: string; description?: string; instructions?: string }): Promise<{ project: Project }> {
      return client.post("/projects", input);
    },
    get(id: string): Promise<{ project: Project }> {
      return client.get(`/projects/${id}`);
    },
    update(id: string, patch: { name?: string; description?: string; instructions?: string }): Promise<{ project: Project }> {
      return client.patch(`/projects/${id}`, patch);
    },
    remove(id: string): Promise<void> {
      return client.delete(`/projects/${id}`);
    },
  };
}

export function createMemoriesService(client: ApiClient) {
  return {
    list(): Promise<{ memories: Memory[] }> {
      return client.get("/memories");
    },
    create(content: string): Promise<{ memory: Memory }> {
      return client.post("/memories", { content });
    },
    remove(id: string): Promise<void> {
      return client.delete(`/memories/${id}`);
    },
  };
}

export function createAssistantsService(client: ApiClient) {
  return {
    list(): Promise<{ assistants: Assistant[] }> {
      return client.get("/assistants");
    },
    create(input: { name: string; instructions?: string; model?: string }): Promise<{ assistant: Assistant }> {
      return client.post("/assistants", input);
    },
    update(id: string, patch: { name?: string; instructions?: string; model?: string }): Promise<{ assistant: Assistant }> {
      return client.patch(`/assistants/${id}`, patch);
    },
    remove(id: string): Promise<void> {
      return client.delete(`/assistants/${id}`);
    },
  };
}

export function createPromptsService(client: ApiClient) {
  return {
    list(): Promise<{ prompts: SavedPrompt[] }> {
      return client.get("/prompts");
    },
    create(input: { title: string; body: string }): Promise<{ prompt: SavedPrompt }> {
      return client.post("/prompts", input);
    },
    remove(id: string): Promise<void> {
      return client.delete(`/prompts/${id}`);
    },
  };
}

export type ProjectsService = ReturnType<typeof createProjectsService>;
export type MemoriesService = ReturnType<typeof createMemoriesService>;
export type AssistantsService = ReturnType<typeof createAssistantsService>;
export type PromptsService = ReturnType<typeof createPromptsService>;
