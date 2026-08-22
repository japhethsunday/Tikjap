import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { createSchedule, listSchedules } from "@/server/store";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    const schedules = await listSchedules(user.id);
    return { schedules };
  });
}

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const body = await readJson<{ promptId?: string; cadence?: string; modelId?: string; conversationId?: string | null }>(request);
    if (!body.promptId) throw new Error("A saved prompt is required.");
    if (!body.cadence) throw new Error("A cadence is required.");
    const schedule = await createSchedule(user.id, {
      promptId: body.promptId,
      cadence: body.cadence,
      modelId: body.modelId || undefined,
      conversationId: body.conversationId ?? null,
    });
    return { schedule };
  });
}

export const dynamic = "force-dynamic";
