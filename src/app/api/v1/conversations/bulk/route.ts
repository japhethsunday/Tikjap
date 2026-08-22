import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { bulkUpdateConversations, bulkTagConversations } from "@/server/store";

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const body = await readJson<{
      ids?: string[];
      action?: "archive" | "unarchive" | "delete" | "pin" | "unpin";
      tag?: string;
      remove?: boolean;
    }>(request);
    const ids = (body.ids ?? []).slice(0, 100);
    if (!ids.length) throw new Error("Select at least one conversation.");
    if (body.tag !== undefined) {
      await bulkTagConversations(user.id, ids, body.tag ?? "", Boolean(body.remove));
      return { updated: ids.length };
    }
    if (!body.action) throw new Error("An action is required.");
    const updated = await bulkUpdateConversations(user.id, ids, body.action);
    return { updated };
  });
}

export const dynamic = "force-dynamic";
