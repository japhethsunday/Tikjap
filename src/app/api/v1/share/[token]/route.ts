import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { resolveShare } from "@/server/store";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { token } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { password?: string };
    const shared = await resolveShare(token, body.password);
    return shared;
  });
}

export const dynamic = "force-dynamic";
