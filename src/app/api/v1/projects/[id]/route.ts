import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { deleteProject, getProject, updateProject } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const row = await getProject(user.id, id);
    return {
      project: {
        id: row.id,
        name: row.name,
        description: row.description,
        instructions: row.instructions,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ name?: string; description?: string; instructions?: string }>(request);
    return { project: await updateProject(user.id, id, body) };
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    await deleteProject(user.id, id);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
