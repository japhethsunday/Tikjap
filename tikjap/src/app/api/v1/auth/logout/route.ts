import { withHandler } from "@/server/handler";
import { handleLogout } from "@/server/auth";

export async function POST() {
  return withHandler(() => handleLogout());
}

export const dynamic = "force-dynamic";