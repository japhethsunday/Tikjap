import { withHandler } from "@/server/handler";
import { requireAdmin } from "@/server/http";
import { feedbackSummary } from "@/server/store";

export async function GET() {
  return withHandler(async () => {
    await requireAdmin();
    const summary = await feedbackSummary();
    return {
      up: summary.up,
      down: summary.down,
      recent: summary.recent.map((row) => ({
        id: row.id,
        messageId: row.message_id,
        conversationId: row.conversation_id,
        rating: row.rating,
        reason: row.reason ?? "",
        createdAt: row.created_at,
      })),
    };
  });
}

export const dynamic = "force-dynamic";
