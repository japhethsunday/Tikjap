import type { ApiClient } from "../client";
import type { ToolAvailability, AIModel } from "../../types";

export function createModelsService(client: ApiClient) {
  return {
    list(): Promise<{ models: AIModel[]; tools?: ToolAvailability[] }> {
      return client.get("/models");
    },
  };
}

export type ModelsService = ReturnType<typeof createModelsService>;