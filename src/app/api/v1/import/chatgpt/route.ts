import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { importChatGPTExport } from "@/server/store";

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const payload = await request.json().catch(() => null);
    if (!payload) throw new Error("Invalid JSON file.");
    const result = await importChatGPTExport(user.id, payload);
    return result;
  });
}

export const dynamic = "force-dynamic";
