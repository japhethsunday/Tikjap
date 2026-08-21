import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { HttpError } from "@/server/errors";
import { readJson, requireUser } from "@/server/http";
import { getProfilePrefs, updateProfilePrefs } from "@/server/store";
import { getModel } from "@/server/models";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    const preferences = await getProfilePrefs(user.id);
    return { preferences };
  });
}

export async function PUT(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const body = await readJson<{
      defaultModelId?: string | null;
      temperature?: number;
      markdown?: boolean;
      showTimestamps?: boolean;
      streamingEnabled?: boolean;
    }>(request);
    if (body.defaultModelId !== undefined && body.defaultModelId !== null && !getModel(body.defaultModelId)) {
      throw new HttpError(400, "validation", "Unknown model.", { defaultModelId: "Unknown model." });
    }
    if (body.temperature !== undefined && (body.temperature < 0 || body.temperature > 2)) {
      throw new HttpError(400, "validation", "Temperature must be between 0 and 2.", { temperature: "Temperature must be between 0 and 2." });
    }
    await updateProfilePrefs(user.id, body);
    const preferences = await getProfilePrefs(user.id);
    return { preferences };
  });
}

export const dynamic = "force-dynamic";