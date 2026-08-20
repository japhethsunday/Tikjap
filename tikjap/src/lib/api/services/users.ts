import type { ApiClient } from "../client";
import type { AccountSettingsInput, User } from "../../types";

export function createUsersService(client: ApiClient) {
  return {
    me(): Promise<{ user: User }> {
      return client.get("/users/me");
    },
    update(input: AccountSettingsInput): Promise<{ user: User }> {
      return client.patch("/users/me", input);
    },
  };
}

export type UsersService = ReturnType<typeof createUsersService>;