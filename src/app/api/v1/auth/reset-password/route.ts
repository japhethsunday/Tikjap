import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { handleResetPassword } from "@/server/auth";

export async function POST(request: NextRequest) {
  return withHandler(() => handleResetPassword(request));
}

export const dynamic = "force-dynamic";