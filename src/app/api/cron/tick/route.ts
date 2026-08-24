import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { dueSchedules, markScheduleRan } from "@/server/store";
import { runScheduledPrompt } from "@/server/chat";
import { HttpError } from "@/server/errors";
import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison so the secret cannot be recovered byte by byte. */
function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  return withHandler(async () => {
    // Fail closed. This endpoint runs scheduled prompts on behalf of every
    // user — it spends inference budget and writes into their conversations —
    // so an unset CRON_SECRET must disable it, not disable the check.
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) {
      throw new HttpError(503, "unavailable", "Scheduled runs are not configured.");
    }
    const provided = request.headers.get("authorization") ?? "";
    if (!timingSafeEqualString(provided, `Bearer ${secret}`)) {
      throw new HttpError(401, "unauthorized", "Invalid cron secret.");
    }
    const due = await dueSchedules(20);
    let ran = 0;
    for (const schedule of due) {
      if (!schedule.prompt_id || !schedule.user_id) continue;
      try {
        await runScheduledPrompt(schedule.user_id, schedule.prompt_id);
        await markScheduleRan(schedule);
        ran += 1;
      } catch (error) {
        console.error("[cron/tick]", error instanceof Error ? error.message : error);
      }
    }
    return { due: due.length, ran };
  });
}

export const dynamic = "force-dynamic";
