import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { handleForgotPassword } from "@/server/auth";
import { getClientIp, rateLimit } from "@/server/rate-limit";

export async function POST(request: NextRequest) {
  return withHandler(() => {
    const limit = rateLimit(`forgot:${getClientIp(request)}`, 5, 15 * 60_000);
    if (!limit.ok) {
      // Anti-enumeration: still report success even when throttled.
      return Response.json({ sent: true });
    }
    return handleForgotPassword(request);
  });
}

export const dynamic = "force-dynamic";
