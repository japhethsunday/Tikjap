import type { ApiClient } from "../client";
import type { AIModel } from "../../types";

export function createModelsService(client: ApiClient) {
  return {
    list(): Promise<{ models: AIModel[] }> {
      return client.get("/models");
    },
  };
}

export type ModelsService = ReturnType<typeof createModelsService>;