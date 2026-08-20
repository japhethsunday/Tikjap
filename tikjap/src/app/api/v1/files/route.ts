import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { handleFileUpload, publicFile } from "@/server/files";

export async function POST(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const formData = await request.formData();
    const { file } = await handleFileUpload(user.id, formData);
    return { file: publicFile(file) };
  });
}

export const dynamic = "force-dynamic";