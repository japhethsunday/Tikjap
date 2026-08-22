import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { createSavedPrompt, listSavedPrompts } from "@/server/store";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    return { prompts: await listSavedPrompts(user.id) };
  });
}

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const body = await readJson<{ title?: string; body?: string; category?: string; tags?: string[] }>(request);
    return {
      prompt: await createSavedPrompt(user.id, {
        title: body.title ?? "",
        body: body.body ?? "",
        category: body.category,
        tags: body.tags,
      }),
    };
  });
}

export const dynamic = "force-dynamic";
