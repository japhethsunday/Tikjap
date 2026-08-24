import { NextRequest, NextResponse } from "next/server";
import { requireUser, readJson } from "@/server/http";
import { HttpError } from "@/server/errors";
import { withHandler } from "@/server/handler";
import { rateLimit } from "@/server/rate-limit";
import { listMessages, startGeneration } from "@/server/chat";
import type { ChatRequest } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const messages = await listMessages(user.id, id);
    return { messages };
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { user } = await requireUser();
    const burst = rateLimit(`chat:${user.id}`, 20, 60_000);
    if (!burst.ok) {
      return NextResponse.json(
        { error: { code: "rate_limit", message: "You are sending messages too quickly. Please slow down." } },
        { status: 429, headers: { "Retry-After": String(burst.retryAfterSeconds) } }
      );
    }
    const { id } = await context.params;
    const body = await readJson<ChatRequest>(request);
    const generation = startGeneration({
      user,
      conversationId: id,
      content: body.content ?? "",
      modelId: body.modelId ?? "",
      attachmentIds: body.attachments,
      regenerateMessageId: body.regenerate ? body.regenerateMessageId : undefined,
      continueFromMessageId: body.continue ? body.continueMessageId : undefined,
      removeFromMessageId: body.removeFromMessageId,
      assistantId: body.assistantId,
      enabledTools: body.enabledTools,
      signal: request.signal,
    });
    return new NextResponse(generation.stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    // Errors raised before streaming begins are returned as JSON.
    if (error instanceof HttpError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error("[api/messages]", error);
    return NextResponse.json({ error: { code: "internal", message: "Something went wrong." } }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";