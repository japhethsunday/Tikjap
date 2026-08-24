import type { ToolDefinition, ToolExecutionContext, ToolResult } from "./types";
import { registerTool } from "./registry";

interface UrlAnalysisInput {
  url: string;
  maxLength?: number;
  extractText?: boolean;
}

interface UrlAnalysisOutput {
  url: string;
  title: string;
  description: string;
  content: string;
  contentLength: number;
  mimeType: string;
  statusCode: number;
  fetchedAt: string;
}

const URL_ANALYSIS_TOOL: ToolDefinition<UrlAnalysisInput, UrlAnalysisOutput> = {
  id: "url_analysis",
  name: "URL Analysis",
  description: "Fetch and analyze content from a URL, extracting title, description, and text content",
  icon: "globe",
  requiredPermissions: ["url_analysis"],
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to analyze" },
      maxLength: { type: "number", description: "Maximum content length to extract (default: 50000)" },
      extractText: { type: "boolean", description: "Whether to extract full text content (default: true)" },
    },
    required: ["url"],
  },
  outputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The analyzed URL" },
      title: { type: "string", description: "Page title" },
      description: { type: "string", description: "Page description/meta description" },
      content: { type: "string", description: "Extracted text content" },
      contentLength: { type: "number", description: "Length of extracted content" },
      mimeType: { type: "string", description: "Content MIME type" },
      statusCode: { type: "number", description: "HTTP status code" },
      fetchedAt: { type: "string", description: "ISO timestamp when fetched" },
    },
  },
  supportsStreaming: false,
  estimateDuration: () => 8000,

  handler: async (input: UrlAnalysisInput, context: ToolExecutionContext): Promise<ToolResult<UrlAnalysisOutput>> => {
    const { url, maxLength = 50000, extractText = true } = input;
    const fetchedAt = new Date().toISOString();

    context.onProgress?.({
      stage: "fetching",
      progress: 10,
      message: `Fetching ${url}...`,
    });

    try {
      const parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return { success: false, error: "Only HTTP/HTTPS URLs are supported" };
      }

      // Block private/internal IPs
      const hostname = parsedUrl.hostname;
      if (isPrivateIp(hostname)) {
        return { success: false, error: "Access to private/internal addresses is not allowed" };
      }

      context.onProgress?.({
        stage: "downloading",
        progress: 40,
        message: "Downloading content...",
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      context.abortSignal.addEventListener("abort", () => controller.abort(), { once: true });

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": "Tikjap/1.0 (+https://tikjap.ai) URL Analyzer",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch URL: ${response.status} ${response.statusText}`,
        };
      }

      const mimeType = response.headers.get("content-type") || "unknown";
      const isHtml = mimeType.includes("text/html");
      const isText = mimeType.includes("text/") || mimeType.includes("application/json") || mimeType.includes("application/xml");

      let content = "";
      let title = "";
      let description = "";

      if (isHtml && extractText) {
        const html = await response.text();
        title = extractTitle(html) || "";
        description = extractDescription(html) || "";
        content = extractTextFromHtml(html);
      } else if (isText) {
        content = await response.text();
        if (content.length > maxLength) {
          content = content.slice(0, maxLength) + "\n... [truncated]";
        }
      } else {
        // Binary content - just return metadata
        const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
        return {
          success: true,
          output: {
            url,
            title: "",
            description: `Binary content (${mimeType}, ${contentLength} bytes)`,
            content: "",
            contentLength: 0,
            mimeType,
            statusCode: response.status,
            fetchedAt,
          },
        };
      }

      if (content.length > maxLength) {
        content = content.slice(0, maxLength) + "\n... [truncated]";
      }

      context.onProgress?.({
        stage: "completed",
        progress: 100,
        message: `Analyzed ${url}`,
      });

      return {
        success: true,
        output: {
          url,
          title,
          description,
          content,
          contentLength: content.length,
          mimeType,
          statusCode: response.status,
          fetchedAt,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { success: false, error: "Request timed out or was cancelled" };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to analyze URL",
      };
    }
  },
};

function isPrivateIp(hostname: string): boolean {
  try {
    const ip = hostname;
    // Check for localhost
    if (ip === "localhost" || ip === "127.0.0.1" || ip === "::1") return true;
    
    // Check for private IP ranges
    const parts = ip.split(".").map(Number);
    if (parts.length === 4) {
      const [a, b] = parts;
      // 10.0.0.0/8
      if (a === 10) return true;
      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) return true;
      // 192.168.0.0/16
      if (a === 192 && b === 168) return true;
      // 169.254.0.0/16 (link-local)
      if (a === 169 && b === 254) return true;
      // 0.0.0.0/8
      if (a === 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : "";
}

function extractDescription(html: string): string {
  // Try meta description
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (metaDesc) return metaDesc[1].trim();
  
  // Try og:description
  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  if (ogDesc) return ogDesc[1].trim();
  
  // Try twitter:description
  const twitterDesc = html.match(/<meta[^>]*name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i);
  if (twitterDesc) return twitterDesc[1].trim();
  
  return "";
}

function extractTextFromHtml(html: string): string {
  // Remove scripts, styles, and other non-content elements
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  
  // Replace block elements with newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|br|tr|td|th|section|article|aside|header|footer|nav|main)>/gi, "\n");
  text = text.replace(/<(p|div|h[1-6]|li|br|tr|td|th|section|article|aside|header|footer|nav|main)[^>]*>/gi, "");
  
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&[a-z]+;/gi, " ");
  
  // Normalize whitespace
  text = text
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .trim();
  
  return text;
}

registerTool(URL_ANALYSIS_TOOL);