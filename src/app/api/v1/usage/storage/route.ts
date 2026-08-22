import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { storageUsageFor } from "@/server/usage";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    const usage = await storageUsageFor(user.id);
    return usage;
  });
}

export const dynamic = "force-dynamic";
