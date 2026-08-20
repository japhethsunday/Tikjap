import { ApiClient, type ClientConfig } from "./client";
import { createAuthService } from "./services/auth";
import { createUsersService } from "./services/users";
import { createConversationsService } from "./services/conversations";
import { createMessagesService } from "./services/messages";
import { createModelsService } from "./services/models";
import { createFilesService } from "./services/files";
import { createUsageService } from "./services/usage";
import { createAdminService } from "./services/admin";
import { createSettingsService } from "./services/settings";
import { createPublicService } from "./services/public";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "/api/v1";

let apiClient: ApiClient | undefined;

export function configureApiClient(config: Partial<ClientConfig> = {}) {
  const existing = apiClient;
  if (existing) {
    if (config.onUnauthorized) existing.setOnUnauthorized(config.onUnauthorized);
    return existing;
  }
  apiClient = new ApiClient({ baseUrl: API_BASE_URL, ...config });
  return apiClient;
}

export function getApiClient(): ApiClient {
  if (!apiClient) {
    apiClient = new ApiClient({ baseUrl: API_BASE_URL });
  }
  return apiClient;
}

export const api = {
  auth: createAuthService(getApiClient()),
  users: createUsersService(getApiClient()),
  conversations: createConversationsService(getApiClient()),
  messages: createMessagesService(getApiClient()),
  models: createModelsService(getApiClient()),
  files: createFilesService(getApiClient()),
  usage: createUsageService(getApiClient()),
  admin: createAdminService(getApiClient()),
  settings: createSettingsService(getApiClient()),
  public: createPublicService(getApiClient()),
};

export type Api = typeof api;
export { ApiClient };
export type { ClientConfig };
export * from "./errors";