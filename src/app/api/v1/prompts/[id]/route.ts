import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { deleteSavedPrompt, incrementPromptRuns, updateSavedPrompt } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ title?: string; body?: string; category?: string; tags?: string[] }>(request);
    const prompt = await updateSavedPrompt(user.id, id, {
      title: body.title,
      body: body.body,
      category: body.category,
      tags: body.tags,
    });
    return { prompt };
  });
}

export async function POST(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const runs = await incrementPromptRuns(user.id, id);
    return { runs };
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    await deleteSavedPrompt(user.id, id);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
