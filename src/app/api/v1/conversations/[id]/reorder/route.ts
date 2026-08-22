import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { reorderConversation } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ direction?: "up" | "down" }>(request);
    const direction = body.direction === "down" ? "down" : "up";
    await reorderConversation(user.id, id, direction);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
