import { createServiceClient } from "./supabase";
import { isDemoMode, IS_PRODUCTION } from "@/lib/env";

export const SEED_ACCOUNTS = [
  { email: "demo@tikjap.dev", password: "demo1234", name: "Demo User", role: "user" as const },
  { email: "admin@tikjap.dev", password: "admin1234", name: "Admin", role: "admin" as const },
];

/**
 * True only where handing out shared demo logins is acceptable: a non-production
 * build explicitly running in demo mode.
 *
 * The mode flag alone is not enough. NEXT_PUBLIC_APP_MODE defaults to "demo",
 * so a deployment that simply never set it would create a real Supabase user
 * with the admin role and a password published by /api/v1/public/info. Requiring
 * a non-production build as well means one missing environment variable cannot
 * hand anyone administrator access.
 */
export const demoAccountsEnabled = isDemoMode && !IS_PRODUCTION;

/**
 * Creates the demo accounts as real Supabase users. Never runs in production.
 * The `on_auth_user_created` trigger creates each user's profile row.
 */
export async function seedIfEmpty(): Promise<void> {
  if (!demoAccountsEnabled) return;
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