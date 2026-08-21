import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { listConversations, createConversation } from "@/server/chat";

export async function GET(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const params = request.nextUrl.searchParams;
    const conversations = await listConversations(user.id, {
      query: params.get("q") ?? undefined,
      projectId: params.get("projectId") ?? undefined,
      pinnedOnly: params.get("filter") === "pinned",
      archivedOnly: params.get("filter") === "archived",
    });
    return { conversations };
  });
}

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const body = await readJson<{ title?: string; modelId?: string; projectId?: string }>(request);
    const conversation = await createConversation(user.id, body);
    return { conversation };
  });
}

export const dynamic = "force-dynamic";
