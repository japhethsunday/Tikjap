import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { searchMessages } from "@/server/store";

export async function GET(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (!query) return { results: [] };
    const results = await searchMessages(user.id, query, 30);
    return { results };
  });
}

export const dynamic = "force-dynamic";
