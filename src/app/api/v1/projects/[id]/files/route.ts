import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { listProjectFiles, writeProjectFile } from "@/server/code";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    return { files: await listProjectFiles(user.id, id) };
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ path?: string; content?: string }>(request);
    const file = await writeProjectFile(user.id, id, { path: body.path ?? "", content: body.content });
    return { file };
  });
}

export const dynamic = "force-dynamic";
