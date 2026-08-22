import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { listAuditForUser } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const activity = await listAuditForUser(user.id, { projectId: id, limit: 30 });
    return { activity };
  });
}

export const dynamic = "force-dynamic";
