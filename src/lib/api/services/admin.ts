import type { ApiClient } from "../client";
import type { AdminStats } from "../../types";

export function createAdminService(client: ApiClient) {
  return {
    stats(): Promise<{ stats: AdminStats }> {
      return client.get("/admin/stats");
    },
    setPlan(userId: string, plan: "free" | "pro" | "team"): Promise<{ ok: boolean; plan: string }> {
      return client.patch(`/admin/users/${userId}/plan`, { plan });
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;