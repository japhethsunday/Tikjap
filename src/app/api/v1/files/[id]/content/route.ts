import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/server/http";
import { readFileContent, shouldServeInline } from "@/server/files";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { user } = await requireUser();
    const { id } = await context.params;
    const { buffer, contentType, name } = await readFileContent(user.id, id);
    const disposition = shouldServeInline(contentType) ? "inline" : "attachment";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const { HttpError } = await import("@/server/errors");
    const { apiError } = await import("@/server/http");
    if (error instanceof HttpError) {
      return apiError(error.status, error.code, error.message);
    }
    return apiError(500, "internal", "Could not read the file.");
  }
}

export const dynamic = "force-dynamic";