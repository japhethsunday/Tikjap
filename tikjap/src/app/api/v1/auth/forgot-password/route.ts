import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { handleForgotPassword } from "@/server/auth";

export async function POST(request: NextRequest) {
  return withHandler(() => handleForgotPassword(request));
}

export const dynamic = "force-dynamic";