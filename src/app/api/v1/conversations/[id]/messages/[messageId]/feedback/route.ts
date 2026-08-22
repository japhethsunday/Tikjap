import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { setMessageFeedback } from "@/server/store";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id, messageId } = await context.params;
    const body = await readJson<{ rating?: number; reason?: string }>(request);
    const rating = body.rating === -1 ? -1 : 1;
    await setMessageFeedback(user.id, id, messageId, rating as -1 | 1, body.reason ?? "");
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
