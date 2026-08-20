import type { ApiClient } from "../client";
import type { LoginInput, SignupInput, SessionInfo, User } from "../../types";

export function createAuthService(client: ApiClient) {
  return {
    signup(input: SignupInput): Promise<{ user: User }> {
      return client.post("/auth/signup", input);
    },
    login(input: LoginInput): Promise<{ user: User }> {
      return client.post("/auth/login", input);
    },
    logout(): Promise<void> {
      return client.post("/auth/logout");
    },
    session(): Promise<{ user: User | null }> {
      return client.get("/auth/session");
    },
    listSessions(): Promise<{ sessions: SessionInfo[] }> {
      return client.get("/auth/sessions");
    },
    logoutOthers(): Promise<{ sessions: SessionInfo[] }> {
      return client.post("/auth/logout-others");
    },
    forgotPassword(email: string): Promise<{ sent: boolean; demoResetToken?: string }> {
      return client.post("/auth/forgot-password", { email });
    },
    resetPassword(token: string, password: string): Promise<{ ok: true }> {
      return client.post("/auth/reset-password", { token, password });
    },
    changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
      return client.put("/auth/password", { currentPassword, newPassword });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;