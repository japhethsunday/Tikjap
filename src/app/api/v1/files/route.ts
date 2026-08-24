import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { HttpError } from "@/server/errors";
import { requireUser } from "@/server/http";
import { rateLimit } from "@/server/rate-limit";
import { handleFileUpload, listUserFiles, publicFile } from "@/server/files";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    const files = await listUserFiles(user.id);
    return { files: files.map(publicFile) };
  });
}

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const limit = rateLimit(`files:${user.id}`, 30, 60 * 60_000);
    if (!limit.ok) {
      throw new HttpError(429, "rate_limit", "Too many uploads. Please try again later.");
    }
    const formData = await request.formData();
    const { file } = await handleFileUpload(user.id, formData);
    return { file: publicFile(file) };
  });
}

export const dynamic = "force-dynamic";
