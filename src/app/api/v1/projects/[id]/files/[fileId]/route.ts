import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { deleteProjectFile, getProjectFile, renameProjectFile, writeProjectFile } from "@/server/code";

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id, fileId } = await context.params;
    return { file: await getProjectFile(user.id, id, fileId) };
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id, fileId } = await context.params;
    const body = await readJson<{ content?: string; path?: string }>(request);

    // A rename and a content write are distinct operations; a request carrying
    // only a path must not blank the file's contents.
    if (typeof body.path === "string" && body.content === undefined) {
      return { file: await renameProjectFile(user.id, id, fileId, body.path) };
    }
    const existing = await getProjectFile(user.id, id, fileId);
    const file = await writeProjectFile(user.id, id, {
      path: body.path ?? existing.path,
      content: body.content ?? existing.content,
    });
    return { file };
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id, fileId } = await context.params;
    await deleteProjectFile(user.id, id, fileId);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
