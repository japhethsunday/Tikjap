import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { duplicateConversation } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const conversation = await duplicateConversation(user.id, id);
    return { conversation };
  });
}

export const dynamic = "force-dynamic";
