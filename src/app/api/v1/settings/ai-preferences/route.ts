import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { getData, persist, type PreferenceRecord } from "@/server/db";
import { getModel } from "@/server/models";
import { HttpError } from "@/server/http";

function toPublic(preference: PreferenceRecord) {
  return {
    defaultModelId: preference.defaultModelId,
    temperature: preference.temperature,
    markdown: preference.markdown,
    showTimestamps: preference.showTimestamps,
    streamingEnabled: preference.streamingEnabled,
  };
}

async function preferencesFor(userId: string): Promise<PreferenceRecord> {
  const store = await getData();
  let preference = store.preferences.find((p) => p.userId === userId);
  if (!preference) {
    preference = {
      userId,
      defaultModelId: null,
      temperature: 0.7,
      markdown: true,
      showTimestamps: true,
      streamingEnabled: true,
    };
    store.preferences.push(preference);
    await persist();
  }
  return preference;
}

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    const preference = await preferencesFor(user.id);
    return { preferences: toPublic(preference) };
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
    const preference = await preferencesFor(user.id);
    if (body.defaultModelId !== undefined) {
      if (body.defaultModelId !== null && !getModel(body.defaultModelId)) {
        throw new HttpError(400, "validation", "Unknown model.", { defaultModelId: "Unknown model." });
      }
      preference.defaultModelId = body.defaultModelId;
    }
    if (body.temperature !== undefined) {
      if (body.temperature < 0 || body.temperature > 2) {
        throw new HttpError(400, "validation", "Temperature must be between 0 and 2.", { temperature: "Temperature must be between 0 and 2." });
      }
      preference.temperature = body.temperature;
    }
    if (body.markdown !== undefined) preference.markdown = body.markdown;
    if (body.showTimestamps !== undefined) preference.showTimestamps = body.showTimestamps;
    if (body.streamingEnabled !== undefined) preference.streamingEnabled = body.streamingEnabled;
    await persist();
    return { preferences: toPublic(preference) };
  });
}

export const dynamic = "force-dynamic";