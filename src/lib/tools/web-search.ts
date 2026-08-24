import type { ToolExecutionContext, ToolResult } from "./types";
import { registerTool } from "./registry";
import type { ToolDefinition } from "./types";

interface WebSearchInput {
  query: string;
  maxResults?: number;
  recencyDays?: number;
}

interface WebSearchOutput {
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    publishedDate?: string;
    source?: string;
  }>;
  totalResults: number;
  searchTimeMs: number;
}

const WEB_SEARCH_TOOL: ToolDefinition<WebSearchInput, WebSearchOutput> = {
  id: "web_search",
  name: "Web Search",
  description: "Search the web for current information and return relevant results with citations",
  icon: "search",
  requiredPermissions: ["web_search"],
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
      maxResults: { type: "number", description: "Maximum number of results to return (default: 10)" },
      recencyDays: { type: "number", description: "Limit results to last N days (optional)" },
    },
    required: ["query"],
  },
  outputSchema: {
    type: "object",
    properties: {
      results: { type: "string", description: "Search results as JSON string" },
      totalResults: { type: "number", description: "Total number of results" },
      searchTimeMs: { type: "number", description: "Search time in milliseconds" },
    },
  },
  supportsStreaming: true,
  estimateDuration: (input) => Math.min(5000 + input.query.length * 10, 15000),

  handler: async (input: WebSearchInput, context: ToolExecutionContext): Promise<ToolResult<WebSearchOutput>> => {
    const startTime = Date.now();
    const { query, maxResults = 10, recencyDays } = input;

    context.onProgress?.({
      stage: "initializing",
      progress: 10,
      message: "Preparing search query...",
    });

    try {
      const apiKey = process.env.SERP_API_KEY || process.env.BRAVE_API_KEY || process.env.GOOGLE_SEARCH_API_KEY;
      const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

      if (!apiKey) {
        return {
          success: false,
          error: "Web search is not configured. Please add SERP_API_KEY, BRAVE_API_KEY, or GOOGLE_SEARCH_API_KEY environment variable.",
        };
      }

      context.onProgress?.({
        stage: "searching",
        progress: 30,
        message: `Searching for "${query}"...`,
      });

      let results: Array<{ title: string; url: string; snippet: string; publishedDate?: string; source?: string }> = [];

      if (process.env.SERP_API_KEY) {
        results = await searchSerpApi(query, maxResults, recencyDays, apiKey);
      } else if (process.env.BRAVE_API_KEY) {
        results = await searchBraveApi(query, maxResults, recencyDays, apiKey);
      } else if (process.env.GOOGLE_SEARCH_API_KEY && searchEngineId) {
        results = await searchGoogleApi(query, maxResults, recencyDays, apiKey, searchEngineId);
      } else {
        return {
          success: false,
          error: "No supported search provider configured",
        };
      }

      context.onProgress?.({
        stage: "processing",
        progress: 80,
        message: `Found ${results.length} results, processing...`,
      });

      const searchTimeMs = Date.now() - startTime;

      context.onProgress?.({
        stage: "completed",
        progress: 100,
        message: `Search completed in ${searchTimeMs}ms`,
        sources: results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        })),
      });

      return {
        success: true,
        output: {
          results,
          totalResults: results.length,
          searchTimeMs,
        },
        sources: results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Web search failed",
      };
    }
  },
};

async function searchSerpApi(
  query: string,
  maxResults: number,
  recencyDays: number | undefined,
  apiKey: string
): Promise<Array<{ title: string; url: string; snippet: string; publishedDate?: string; source?: string }>> {
  const params = new URLSearchParams({
    q: query,
    num: String(maxResults),
    api_key: apiKey,
    engine: "google",
  });

  if (recencyDays) {
    params.append("tbs", `qdr:d${recencyDays}`);
  }

  const response = await fetch(`https://serpapi.com/search?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status}`);
  }

  const data = await response.json();
  return (data.organic_results || []).slice(0, maxResults).map((result: Record<string, unknown>) => ({
    title: result.title,
    url: result.link,
    snippet: result.snippet,
    publishedDate: result.date,
    source: "SerpAPI",
  }));
}

async function searchBraveApi(
  query: string,
  maxResults: number,
  recencyDays: number | undefined,
  apiKey: string
): Promise<Array<{ title: string; url: string; snippet: string; publishedDate?: string; source?: string }>> {
  const params = new URLSearchParams({
    q: query,
    count: String(maxResults),
    safesearch: "moderate",
  });

  if (recencyDays) {
    params.append("freshness", `${recencyDays}d`);
  }

  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.web?.results || []).slice(0, maxResults).map((result: Record<string, unknown>) => ({
    title: result.title,
    url: result.url,
    snippet: result.description,
    publishedDate: result.age,
    source: "Brave Search",
  }));
}

async function searchGoogleApi(
  query: string,
  maxResults: number,
  recencyDays: number | undefined,
  apiKey: string,
  searchEngineId: string
): Promise<Array<{ title: string; url: string; snippet: string; publishedDate?: string; source?: string }>> {
  const params = new URLSearchParams({
    key: apiKey,
    cx: searchEngineId,
    q: query,
    num: String(maxResults),
  });

  if (recencyDays) {
    params.append("dateRestrict", `d${recencyDays}`);
  }

  const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Google API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.items || []).slice(0, maxResults).map((result: Record<string, unknown>) => ({
    title: result.title,
    url: result.link,
    snippet: result.snippet,
    publishedDate: ((result.pagemap as Record<string, unknown>)?.metatags as Record<string, unknown>[])?.[0]?.["article:published_time"] as string | undefined,
    source: "Google Custom Search",
  }));
}

registerTool(WEB_SEARCH_TOOL);