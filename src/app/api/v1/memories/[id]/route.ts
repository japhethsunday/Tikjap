import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { deleteMemory } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    await deleteMemory(user.id, id);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
