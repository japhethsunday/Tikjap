import { withHandler } from "@/server/handler";
import { handleListSessions } from "@/server/auth";

export async function GET() {
  return withHandler(() => handleListSessions());
}

export const dynamic = "force-dynamic";