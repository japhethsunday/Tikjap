import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { runComparison } from "@/server/chat";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ content?: string; modelIds?: string[] }>(request);
    const content = (body.content ?? "").trim();
    if (!content) throw new Error("Message cannot be empty.");
    const results = await runComparison(user.id, id, content, body.modelIds ?? []);
    return { results };
  });
}

export const dynamic = "force-dynamic";
