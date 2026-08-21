import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { handleSignup } from "@/server/auth";
import { getClientIp, rateLimit } from "@/server/rate-limit";

export async function POST(request: NextRequest) {
  return withHandler(() => {
    const limit = rateLimit(`signup:${getClientIp(request)}`, 5, 15 * 60_000);
    if (!limit.ok) {
      return Response.json(
        { error: { code: "rate_limit", message: "Too many sign-up attempts. Please try again later." } },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    return handleSignup(request);
  });
}

export const dynamic = "force-dynamic";
