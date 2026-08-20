import { withHandler } from "@/server/handler";
import { handleLogoutOthers } from "@/server/auth";

export async function POST() {
  return withHandler(() => handleLogoutOthers());
}

export const dynamic = "force-dynamic";