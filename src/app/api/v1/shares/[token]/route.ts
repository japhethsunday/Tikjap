import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { revokeShare } from "@/server/store";

type RouteContext = { params: Promise<{ token: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { token } = await context.params;
    await revokeShare(user.id, token);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
