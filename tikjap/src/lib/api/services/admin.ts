import type { ApiClient } from "../client";
import type { AdminStats } from "../../types";

export function createAdminService(client: ApiClient) {
  return {
    stats(): Promise<{ stats: AdminStats }> {
      return client.get("/admin/stats");
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;