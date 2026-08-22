import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { deleteMemory, updateMemory } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ priority?: number; status?: string }>(request);
    const memory = await updateMemory(user.id, id, {
      priority: body.priority,
      status: body.status,
    });
    return { memory };
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    await deleteMemory(user.id, id);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
