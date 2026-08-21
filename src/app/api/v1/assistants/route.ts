import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { createAssistant, listAssistants } from "@/server/store";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    return { assistants: await listAssistants(user.id) };
  });
}

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const body = await readJson<{ name?: string; instructions?: string; model?: string }>(request);
    return { assistant: await createAssistant(user.id, body as { name: string }) };
  });
}

export const dynamic = "force-dynamic";
