import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { getConversationContextPreview } from "@/server/chat";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const preview = await getConversationContextPreview(user.id, id);
    return preview;
  });
}

export const dynamic = "force-dynamic";
