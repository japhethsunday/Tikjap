import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { MODEL_CATALOG } from "@/server/models";

export async function GET() {
  return withHandler(async () => {
    await requireUser();
    return { models: MODEL_CATALOG };
  });
}

export const dynamic = "force-dynamic";