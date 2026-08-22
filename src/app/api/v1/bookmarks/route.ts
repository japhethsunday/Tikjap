import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { listBookmarks } from "@/server/store";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    const bookmarks = await listBookmarks(user.id, 50);
    return { bookmarks };
  });
}

export const dynamic = "force-dynamic";
