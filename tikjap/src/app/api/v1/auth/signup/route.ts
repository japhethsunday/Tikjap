import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { handleSignup } from "@/server/auth";

export async function POST(request: NextRequest) {
  return withHandler(() => handleSignup(request));
}

export const dynamic = "force-dynamic";