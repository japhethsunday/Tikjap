import { safeFetch, UnsafeUrlError } from "./safe-fetch";

/**
 * Web search backend.
 *
 * Search needs a paid API. Rather than hard-wire one vendor, this resolves
 * whichever provider has credentials configured. If none is configured the
 * search tools report that honestly and fail — they never synthesize
 * plausible-looking results, because a fabricated citation is far worse than a
 * visible "search is not configured" error.
 */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export class SearchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchUnavailableError";
  }
}

export type SearchProviderId = "brave" | "tavily" | "serper" | "google" | "none";

/**
 * Reads the first non-empty of several names.
 *
 * An earlier iteration of this feature used BRAVE_API_KEY and SERP_API_KEY;
 * this one settled on BRAVE_SEARCH_API_KEY and SERPER_API_KEY. A deployment
 * configured against either spelling should work — silently ignoring a key
 * someone has already set is a miserable failure mode, because the tool just
 * reports itself unconfigured and there is nothing to see in the logs.
 */
function readEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export const BRAVE_KEY_NAMES = ["BRAVE_SEARCH_API_KEY", "BRAVE_API_KEY"];
export const TAVILY_KEY_NAMES = ["TAVILY_API_KEY"];
export const SERPER_KEY_NAMES = ["SERPER_API_KEY", "SERP_API_KEY"];
export const GOOGLE_KEY_NAMES = ["GOOGLE_SEARCH_API_KEY"];
export const GOOGLE_ENGINE_NAMES = ["GOOGLE_SEARCH_ENGINE_ID", "GOOGLE_CSE_ID"];

export function configuredSearchProvider(): SearchProviderId {
  if (readEnv(...BRAVE_KEY_NAMES)) return "brave";
  if (readEnv(...TAVILY_KEY_NAMES)) return "tavily";
  if (readEnv(...SERPER_KEY_NAMES)) return "serper";
  // Google's Custom Search needs both halves to be usable.
  if (readEnv(...GOOGLE_KEY_NAMES) && readEnv(...GOOGLE_ENGINE_NAMES)) return "google";
  return "none";
}

export function isSearchConfigured(): boolean {
  return configuredSearchProvider() !== "none";
}

const UNCONFIGURED_MESSAGE =
  "Web search is not configured on this deployment. Set BRAVE_SEARCH_API_KEY, TAVILY_API_KEY, SERPER_API_KEY, or GOOGLE_SEARCH_API_KEY with GOOGLE_SEARCH_ENGINE_ID.";

interface BraveResponse {
  web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
}
interface TavilyResponse {
  results?: Array<{ title?: string; url?: string; content?: string }>;
}
interface SerperResponse {
  organic?: Array<{ title?: string; link?: string; snippet?: string }>;
}
interface GoogleResponse {
  items?: Array<{ title?: string; link?: string; snippet?: string }>;
}

function clean(text: string | undefined): string {
  // Providers return highlight markup in snippets; strip tags and collapse space.
  return (text ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function webSearch(
  query: string,
  options: { count?: number; signal?: AbortSignal } = {}
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const count = Math.min(Math.max(options.count ?? 6, 1), 15);
  const provider = configuredSearchProvider();

  if (provider === "none") {
    throw new SearchUnavailableError(UNCONFIGURED_MESSAGE);
  }

  try {
    if (provider === "brave") {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", trimmed);
      url.searchParams.set("count", String(count));
      const response = await fetch(url, {
        signal: options.signal,
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": readEnv(...BRAVE_KEY_NAMES),
        },
      });
      if (!response.ok) throw new SearchUnavailableError(`Search provider returned ${response.status}.`);
      const data = (await response.json()) as BraveResponse;
      return (data.web?.results ?? [])
        .filter((hit) => hit.url)
        .slice(0, count)
        .map((hit) => ({ title: clean(hit.title) || hit.url!, url: hit.url!, snippet: clean(hit.description) }));
    }

    if (provider === "tavily") {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        signal: options.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: readEnv(...TAVILY_KEY_NAMES),
          query: trimmed,
          max_results: count,
          search_depth: "basic",
        }),
      });
      if (!response.ok) throw new SearchUnavailableError(`Search provider returned ${response.status}.`);
      const data = (await response.json()) as TavilyResponse;
      return (data.results ?? [])
        .filter((hit) => hit.url)
        .slice(0, count)
        .map((hit) => ({ title: clean(hit.title) || hit.url!, url: hit.url!, snippet: clean(hit.content) }));
    }

    if (provider === "serper") {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": readEnv(...SERPER_KEY_NAMES),
      },
      body: JSON.stringify({ q: trimmed, num: count }),
    });
    if (!response.ok) throw new SearchUnavailableError(`Search provider returned ${response.status}.`);
    const data = (await response.json()) as SerperResponse;
    return (data.organic ?? [])
      .filter((hit) => hit.link)
      .slice(0, count)
      .map((hit) => ({ title: clean(hit.title) || hit.link!, url: hit.link!, snippet: clean(hit.snippet) }));
    }

    // Google Programmable Search. Capped at 10 by the API itself.
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", readEnv(...GOOGLE_KEY_NAMES));
    url.searchParams.set("cx", readEnv(...GOOGLE_ENGINE_NAMES));
    url.searchParams.set("q", trimmed);
    url.searchParams.set("num", String(Math.min(count, 10)));
    const response = await fetch(url, { signal: options.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new SearchUnavailableError(`Search provider returned ${response.status}.`);
    const data = (await response.json()) as GoogleResponse;
    return (data.items ?? [])
      .filter((hit) => hit.link)
      .slice(0, count)
      .map((hit) => ({ title: clean(hit.title) || hit.link!, url: hit.link!, snippet: clean(hit.snippet) }));
  } catch (error) {
    if (error instanceof SearchUnavailableError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SearchUnavailableError("The search request was cancelled.");
    }
    throw new SearchUnavailableError("The search provider could not be reached.");
  }
}

/**
 * Pulls readable text out of an HTML document.
 *
 * Script and style bodies are removed first — otherwise their contents end up
 * in the model's context as noise, and inline JSON blobs can dominate the
 * extraction budget entirely.
 */
export function extractReadableText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = clean(titleMatch?.[1]).slice(0, 300);

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Keep block boundaries as newlines so paragraphs do not run together.
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  return { title, text };
}

/** Fetches a page and returns its readable text, or throws UnsafeUrlError. */
export async function fetchReadable(
  url: string,
  options: { maxChars?: number; signal?: AbortSignal } = {}
): Promise<{ url: string; title: string; text: string; truncated: boolean }> {
  const maxChars = options.maxChars ?? 12_000;
  const response = await safeFetch(url, { signal: options.signal });

  const contentType = response.contentType.toLowerCase();
  if (contentType.includes("application/json")) {
    const text = response.body.slice(0, maxChars);
    return { url: response.url, title: response.url, text, truncated: response.body.length > maxChars };
  }
  if (
    !contentType.includes("text/html") &&
    !contentType.includes("text/plain") &&
    !contentType.includes("xml") &&
    !contentType.includes("text/markdown")
  ) {
    throw new UnsafeUrlError(`That URL returned ${contentType.split(";")[0]}, which cannot be read as text.`);
  }

  const { title, text } = contentType.includes("text/html")
    ? extractReadableText(response.body)
    : { title: response.url, text: response.body };

  return {
    url: response.url,
    title: title || response.url,
    text: text.slice(0, maxChars),
    truncated: response.truncated || text.length > maxChars,
  };
}
