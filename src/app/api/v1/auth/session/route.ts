import { withHandler } from "@/server/handler";
import { handleSession } from "@/server/auth";

export async function GET() {
  return withHandler(() => handleSession());
}

export const dynamic = "force-dynamic";