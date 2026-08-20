import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { getFileMeta, deleteFile, publicFile } from "@/server/files";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const file = await getFileMeta(user.id, id);
    return { file: publicFile(file) };
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    await deleteFile(user.id, id);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";