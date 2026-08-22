import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { rollbackAssistant } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ versionIndex?: number }>(request);
    const assistant = await rollbackAssistant(user.id, id, Math.max(0, Math.trunc(body.versionIndex ?? 0)));
    return { assistant };
  });
}

export const dynamic = "force-dynamic";
