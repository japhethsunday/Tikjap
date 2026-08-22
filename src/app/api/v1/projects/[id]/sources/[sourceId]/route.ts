import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { deleteProjectSource } from "@/server/store";

type RouteContext = { params: Promise<{ id: string; sourceId: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id, sourceId } = await context.params;
    await deleteProjectSource(user.id, id, sourceId);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
