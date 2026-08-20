import type { ApiClient } from "../client";
import type { AiPreferences } from "../../types";

export function createSettingsService(client: ApiClient) {
  return {
    preferences(): Promise<{ preferences: AiPreferences }> {
      return client.get("/settings/ai-preferences");
    },
    updatePreferences(input: Partial<AiPreferences>): Promise<{ preferences: AiPreferences }> {
      return client.put("/settings/ai-preferences", input);
    },
  };
}

export type SettingsService = ReturnType<typeof createSettingsService>;