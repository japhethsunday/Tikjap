import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { setMessageBookmark } from "@/server/store";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id, messageId } = await context.params;
    const body = await readJson<{ bookmarked?: boolean }>(request);
    const bookmarked = await setMessageBookmark(user.id, id, messageId, Boolean(body.bookmarked));
    return { bookmarked };
  });
}

export const dynamic = "force-dynamic";
