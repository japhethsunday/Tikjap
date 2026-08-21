import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { createMemory, listMemories } from "@/server/store";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    return { memories: await listMemories(user.id) };
  });
}

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const body = await readJson<{ content?: string }>(request);
    return { memory: await createMemory(user.id, body.content ?? "") };
  });
}

export const dynamic = "force-dynamic";
