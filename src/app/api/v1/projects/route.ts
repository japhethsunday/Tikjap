import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { createProject, listProjects } from "@/server/store";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    return { projects: await listProjects(user.id) };
  });
}

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const body = await readJson<{ name?: string; description?: string; instructions?: string }>(request);
    const project = await createProject(user.id, {
      name: body.name ?? "",
      description: body.description,
      instructions: body.instructions,
    });
    return { project };
  });
}

export const dynamic = "force-dynamic";
