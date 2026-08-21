import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { handleLogin } from "@/server/auth";
import { getClientIp, rateLimit } from "@/server/rate-limit";

export async function POST(request: NextRequest) {
  return withHandler(() => {
    const ip = getClientIp(request);
    const limit = rateLimit(`login:${ip}`, 15, 5 * 60_000);
    if (!limit.ok) {
      return Response.json(
        { error: { code: "rate_limit", message: "Too many sign-in attempts. Please try again later." } },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }
    return handleLogin(request);
  });
}

export const dynamic = "force-dynamic";
