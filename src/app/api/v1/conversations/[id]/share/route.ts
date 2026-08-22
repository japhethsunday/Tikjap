import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { createShare, listShares } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const shares = await listShares(user.id, id);
    return { shares };
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ expiresInHours?: number; password?: string | null }>(request);
    const expiresAt =
      body.expiresInHours && body.expiresInHours > 0
        ? new Date(Date.now() + Math.min(24 * 30, Math.round(body.expiresInHours)) * 3600_000).toISOString()
        : null;
    const password = body.password?.trim() || null;
    const share = await createShare(user.id, id, { expiresAt, password });
    return {
      share: {
        token: share.token,
        expiresAt: share.expires_at,
        protected: Boolean(password),
        createdAt: new Date().toISOString(),
      },
      url: `/share/${share.token}`,
    };
  });
}

export const dynamic = "force-dynamic";
