import type { ApiClient } from "../client";
import type {
  ActivityEntry,
  Assistant,
  Memory,
  CodeRunResult,
  Project,
  ProjectFile,
  ProjectSource,
  SavedPrompt,
  Schedule,
  StorageUsage,
} from "../../types";

export function createProjectsService(client: ApiClient) {
  return {
    list(options: { includeArchived?: boolean } = {}): Promise<{ projects: Project[] }> {
      const qs = options.includeArchived ? "?includeArchived=1" : "";
      return client.get(`/projects${qs}`);
    },
    create(input: { name: string; description?: string; instructions?: string; icon?: string }): Promise<{ project: Project }> {
      return client.post("/projects", input);
    },
    get(id: string): Promise<{ project: Project }> {
      return client.get(`/projects/${id}`);
    },
    update(
      id: string,
      patch: {
        name?: string;
        description?: string;
        instructions?: string;
        icon?: string;
        archived?: boolean;
        defaultModelId?: string | null;
        memoryEnabled?: boolean;
        notes?: string;
      }
    ): Promise<{ project: Project }> {
      return client.patch(`/projects/${id}`, patch);
    },
    remove(id: string): Promise<void> {
      return client.delete(`/projects/${id}`);
    },
    sources(id: string): Promise<{ sources: ProjectSource[] }> {
      return client.get(`/projects/${id}/sources`);
    },
    addSource(
      id: string,
      input: { title?: string; url?: string; content?: string; fetchUrl?: boolean }
    ): Promise<{ source: ProjectSource }> {
      return client.post(`/projects/${id}/sources`, input);
    },
    removeSource(id: string, sourceId: string): Promise<void> {
      return client.delete(`/projects/${id}/sources/${sourceId}`);
    },
    activity(id: string): Promise<{ activity: ActivityEntry[] }> {
      return client.get(`/projects/${id}/activity`);
    },

    // ---- Code workspace files ------------------------------------------
    files(id: string): Promise<{ files: ProjectFile[] }> {
      return client.get(`/projects/${id}/files`);
    },
    writeFile(id: string, input: { path: string; content?: string }): Promise<{ file: ProjectFile }> {
      return client.post(`/projects/${id}/files`, input);
    },
    updateFile(
      id: string,
      fileId: string,
      patch: { content?: string; path?: string }
    ): Promise<{ file: ProjectFile }> {
      return client.patch(`/projects/${id}/files/${fileId}`, patch);
    },
    deleteFile(id: string, fileId: string): Promise<void> {
      return client.delete(`/projects/${id}/files/${fileId}`);
    },
    runFile(id: string, fileId: string): Promise<{ run: CodeRunResult }> {
      return client.post(`/projects/${id}/files/${fileId}/run`, {});
    },
  };
}

export function createMemoriesService(client: ApiClient) {
  return {
    list(): Promise<{ memories: Memory[] }> {
      return client.get("/memories");
    },
    create(content: string, options: { priority?: number; status?: string } = {}): Promise<{ memory: Memory }> {
      return client.post("/memories", { content, ...options });
    },
    review(id: string, patch: { priority?: number; status?: "approved" | "pending" }): Promise<{ memory: Memory }> {
      return client.patch(`/memories/${id}`, patch);
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
    create(input: {
      name: string;
      instructions?: string;
      model?: string;
      avatar?: string;
      starters?: string[];
    }): Promise<{ assistant: Assistant }> {
      return client.post("/assistants", input);
    },
    update(
      id: string,
      patch: { name?: string; instructions?: string; model?: string; avatar?: string; starters?: string[] }
    ): Promise<{ assistant: Assistant }> {
      return client.patch(`/assistants/${id}`, patch);
    },
    rollback(id: string, versionIndex: number): Promise<{ assistant: Assistant }> {
      return client.post(`/assistants/${id}/rollback`, { versionIndex });
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
    create(input: { title: string; body: string; category?: string; tags?: string[] }): Promise<{ prompt: SavedPrompt }> {
      return client.post("/prompts", input);
    },
    update(
      id: string,
      patch: { title?: string; body?: string; category?: string; tags?: string[] }
    ): Promise<{ prompt: SavedPrompt }> {
      return client.patch(`/prompts/${id}`, patch);
    },
    run(id: string): Promise<{ runs: number }> {
      return client.post(`/prompts/${id}`, {});
    },
    remove(id: string): Promise<void> {
      return client.delete(`/prompts/${id}`);
    },
  };
}

export function createSchedulesService(client: ApiClient) {
  return {
    list(): Promise<{ schedules: Schedule[] }> {
      return client.get("/schedules");
    },
    create(input: { promptId: string; cadence: string; modelId?: string; conversationId?: string | null }): Promise<{ schedule: Schedule }> {
      return client.post("/schedules", input);
    },
    setActive(id: string, active: boolean): Promise<{ schedule: Schedule }> {
      return client.patch(`/schedules/${id}`, { active });
    },
    remove(id: string): Promise<void> {
      return client.delete(`/schedules/${id}`);
    },
  };
}

export function createWorkspaceService(client: ApiClient) {
  return {
    storageUsage(): Promise<StorageUsage> {
      return client.get("/usage/storage");
    },
    exportAll(): Promise<Record<string, unknown>> {
      return client.get("/export");
    },
    importChatGPT(payload: unknown): Promise<{ imported: number }> {
      return client.post("/import/chatgpt", payload);
    },
  };
}

export type ProjectsService = ReturnType<typeof createProjectsService>;
export type MemoriesService = ReturnType<typeof createMemoriesService>;
export type AssistantsService = ReturnType<typeof createAssistantsService>;
export type PromptsService = ReturnType<typeof createPromptsService>;
export type SchedulesService = ReturnType<typeof createSchedulesService>;
export type WorkspaceService = ReturnType<typeof createWorkspaceService>;
