import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { dueSchedules, markScheduleRan } from "@/server/store";
import { runScheduledPrompt } from "@/server/chat";
import { HttpError } from "@/server/errors";

export async function GET(request: NextRequest) {
  return withHandler(async () => {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
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
