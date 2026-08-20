import type { ApiClient } from "../client";
import type { PublicInfo } from "../../types";

export function createPublicService(client: ApiClient) {
  return {
    info(): Promise<{ info: PublicInfo }> {
      return client.get("/public/info");
    },
  };
}

export type PublicService = ReturnType<typeof createPublicService>;