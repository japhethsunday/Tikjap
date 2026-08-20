import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { listConversations, createConversation } from "@/server/chat";
import { readJson } from "@/server/http";

export async function GET(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const query = request.nextUrl.searchParams.get("q") ?? undefined;
    const conversations = await listConversations(user.id, query);
    return { conversations };
  });
}

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const body = await readJson<{ title?: string; modelId?: string }>(request);
    const conversation = await createConversation(user.id, body);
    return { conversation };
  });
}

export const dynamic = "force-dynamic";