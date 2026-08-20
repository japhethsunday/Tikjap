import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { usageSummaryFor } from "@/server/usage";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    const usage = await usageSummaryFor(user.id);
    return { usage };
  });
}

export const dynamic = "force-dynamic";