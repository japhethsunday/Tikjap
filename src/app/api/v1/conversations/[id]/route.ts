import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import {
  getConversation,
  renameConversation,
  updateConversationSettings,
  deleteConversation,
} from "@/server/chat";
import { updateConversationFields } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const conversation = await getConversation(user.id, id);
    return { conversation };
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{
      title?: string;
      pinned?: boolean;
      archived?: boolean;
      projectId?: string | null;
      tags?: string[];
      color?: string;
      incognito?: boolean;
      sortOrder?: number;
      summary?: string;
    }>(request);
    if (body.title !== undefined) {
      const conversation = await renameConversation(user.id, id, body.title ?? "");
      return { conversation };
    }
    const hasWave2Fields =
      body.tags !== undefined ||
      body.color !== undefined ||
      body.incognito !== undefined ||
      body.sortOrder !== undefined ||
      body.summary !== undefined;
    if (hasWave2Fields) {
      await updateConversationFields(user.id, id, {
        tags: body.tags,
        color: body.color,
        incognito: body.incognito,
        sortOrder: body.sortOrder,
        summary: body.summary,
      });
    }
    if (body.pinned !== undefined || body.archived !== undefined || body.projectId !== undefined) {
      await updateConversationSettings(user.id, id, {
        pinned: body.pinned,
        archived: body.archived,
        projectId: body.projectId,
      });
    }
    const conversation = await getConversation(user.id, id);
    return { conversation };
  });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    await deleteConversation(user.id, id);
    return { ok: true };
  });
}

export const dynamic = "force-dynamic";