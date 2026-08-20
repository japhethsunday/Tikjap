import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { handleChangePassword } from "@/server/auth";

export async function PUT(request: NextRequest) {
  return withHandler(() => handleChangePassword(request));
}

export const dynamic = "force-dynamic";