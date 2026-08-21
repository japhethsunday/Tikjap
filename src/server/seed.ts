import { createServiceClient } from "./supabase";
import { isDemoMode } from "@/lib/env";

export const SEED_ACCOUNTS = [
  { email: "demo@tikjap.dev", password: "demo1234", name: "Demo User", role: "user" as const },
  { email: "admin@tikjap.dev", password: "admin1234", name: "Admin", role: "admin" as const },
];

/**
 * Creates the demo accounts as real Supabase users. Only runs in demo mode.
 * The `on_auth_user_created` trigger creates each user's profile row.
 */
export async function seedIfEmpty(): Promise<void> {
  if (!isDemoMode) return;
  const admin = createServiceClient();
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = new Set((data?.users ?? []).map((user) => user.email?.toLowerCase()));
  for (const account of SEED_ACCOUNTS) {
    if (existing.has(account.email)) continue;
    const { error } = await admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { name: account.name, role: account.role },
    });
    if (error) {
      console.error(`[seed] could not create ${account.email}: ${error.message}`);
    }
  }
}