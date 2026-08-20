import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { handleLogin } from "@/server/auth";

export async function POST(request: NextRequest) {
  return withHandler(() => handleLogin(request));
}

export const dynamic = "force-dynamic";