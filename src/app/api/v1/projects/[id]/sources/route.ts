import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson } from "@/server/http";
import { createProjectSource, listProjectSources } from "@/server/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const sources = await listProjectSources(user.id, id);
    return { sources };
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const { id } = await context.params;
    const body = await readJson<{ title?: string; url?: string; content?: string; fetchUrl?: boolean }>(request);
    let content = (body.content ?? "").toString();
    let title = (body.title ?? "").trim();
    let url: string | null = null;

    if (body.fetchUrl) {
      const target = (body.url ?? "").trim();
      if (!/^https?:\/\//i.test(target)) throw new Error("Only http(s) URLs are supported.");
      url = target.slice(0, 500);
      if (!title) title = new URL(target).hostname;
      try {
        const response = await fetch(target, {
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "TikjapBot/1.0 (+project-knowledge-import)" },
          redirect: "follow",
        });
        if (!response.ok) throw new Error(`Fetch failed (${response.status}).`);
        const html = (await response.text()).slice(0, 400_000);
        content = stripHtml(html);
      } catch (error) {
        throw new Error(
          `Could not fetch that URL${error instanceof Error ? `: ${error.message}` : ""}. Paste the text instead.`
        );
      }
    }

    if (!content.trim()) throw new Error("Source content cannot be empty.");
    const source = await createProjectSource(user.id, id, { title, url, content });
    return { source };
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200_000);
}

export const dynamic = "force-dynamic";
