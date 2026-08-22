import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { exportUserData } from "@/server/store";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    const bundle = await exportUserData(user.id);
    return bundle;
  });
}

export const dynamic = "force-dynamic";