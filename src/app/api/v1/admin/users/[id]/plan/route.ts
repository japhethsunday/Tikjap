import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireAdmin, readJson } from "@/server/http";
import { HttpError } from "@/server/errors";
import { setProfilePlan } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    await requireAdmin();
    const { id } = await context.params;
    const body = await readJson<{ plan?: string }>(request);
    const plan = body.plan;
    if (plan !== "free" && plan !== "pro" && plan !== "team") {
      throw new HttpError(400, "validation", "Plan must be one of: free, pro, team.");
    }
    await setProfilePlan(id, plan);
    return { ok: true, plan };
  });
}

export const dynamic = "force-dynamic";
