import { NextRequest, NextResponse } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { runProjectFile } from "@/server/code";

type RouteContext = { params: Promise<{ id: string; fileId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { user } = await requireUser();
  // Execution is the most expensive thing this API does — a WASM runtime per
  // call — so it gets a tighter budget than ordinary reads and writes.
  const limit = rateLimit(`code:run:${user.id}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: { code: "rate_limit", message: "Too many runs. Please wait a moment." } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }
  return withHandler(async () => {
    const { id, fileId } = await context.params;
    return { run: await runProjectFile(user.id, id, fileId, request.signal) };
  });
}

export const dynamic = "force-dynamic";
