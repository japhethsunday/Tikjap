import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { getConversation, renameConversation, deleteConversation } from "@/server/chat";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const conversation = await getConversation(user.id, id);
    return { conversation };
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ title?: string }>(request);
    const conversation = await renameConversation(user.id, id, body.title ?? "");
    return { conversation };
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    await deleteConversation(user.id, id);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";