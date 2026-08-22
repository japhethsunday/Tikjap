import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { mergeConversations } from "@/server/store";

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const body = await readJson<{ targetId?: string; otherId?: string }>(request);
    if (!body.targetId || !body.otherId) throw new Error("targetId and otherId are required.");
    const conversation = await mergeConversations(user.id, body.targetId, body.otherId);
    return { conversation };
  });
}

export const dynamic = "force-dynamic";
