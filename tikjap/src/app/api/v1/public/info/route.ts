import { withHandler } from "@/server/handler";
import { seedIfEmpty, SEED_ACCOUNTS } from "@/server/seed";
import { isDemoMode, APP_NAME, BILLING_ENABLED } from "@/lib/env";
import { DEMO_PLANS } from "@/lib/constants";

export async function GET() {
  return withHandler(async () => {
    await seedIfEmpty();
    return {
      info: {
        appName: APP_NAME,
        mode: isDemoMode ? "demo" : "live",
        billingEnabled: BILLING_ENABLED,
        seedAccounts: isDemoMode
          ? SEED_ACCOUNTS.map(({ email, password, role }) => ({ email, password, role }))
          : [],
        plans: BILLING_ENABLED ? DEMO_PLANS : [],
      },
    };
  });
}

export const dynamic = "force-dynamic";