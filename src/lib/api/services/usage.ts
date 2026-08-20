import type { ApiClient } from "../client";
import type { UsageSummary } from "../../types";

export function createUsageService(client: ApiClient) {
  return {
    me(): Promise<{ usage: UsageSummary }> {
      return client.get("/usage/me");
    },
  };
}

export type UsageService = ReturnType<typeof createUsageService>;