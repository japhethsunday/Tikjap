import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { getConversationRow } from "@/server/store";
import { createServiceClient } from "@/server/supabase";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Cooperative generation stop: marks the conversation's streaming assistant
 * message as stopped so the in-flight generation loop can finalize it with
 * partial content. Transport-level aborts are unreliable on serverless.
 */
export async function POST(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    await getConversationRow(user.id, id);
    const db = createServiceClient();
    const { error } = await db
      .from("messages")
      .update({ status: "stopped" })
      .eq("conversation_id", id)
      .eq("role", "assistant")
      .eq("status", "streaming");
    if (error) throw new Error(`Failed to stop generation: ${error.message}`);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";
