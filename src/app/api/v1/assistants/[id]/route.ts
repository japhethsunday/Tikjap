import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { deleteAssistant, updateAssistant } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ name?: string; instructions?: string; model?: string }>(request);
    return { assistant: await updateAssistant(user.id, id, body) };
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    await deleteAssistant(user.id, id);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
