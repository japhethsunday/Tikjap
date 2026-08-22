import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { deleteSchedule, updateScheduleActive } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ active?: boolean }>(request);
    const schedule = await updateScheduleActive(user.id, id, Boolean(body.active));
    return { schedule };
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    await deleteSchedule(user.id, id);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
