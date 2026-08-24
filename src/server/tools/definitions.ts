import { readFileContent } from "../files";
import { runJavaScript } from "./sandbox";
import { fetchReadable, isSearchConfigured, SearchUnavailableError, webSearch, type SearchHit } from "./search";
import { UnsafeUrlError } from "./safe-fetch";
import { parseCsv, parseJsonTable, profileTable, type ParsedTable, type TableProfile } from "./tabular";
import type { ServerToolDefinition, ToolRunContext, ToolRunResult } from "./types";

/**
 * The tool implementations.
 *
 * Every handler returns a `summary` — a compact markdown block that is fed back
 * to the model as the tool's observation — plus structured `data` for the UI to
 * render. Handlers never throw for expected failures; they return
 * `{ ok: false, summary }` so the model can tell the user what went wrong and
 * carry on, rather than the whole turn erroring out.
 */

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  if (Number.isInteger(value) && Math.abs(value) < 1e15) return value.toLocaleString("en-US");
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function renderProfile(profile: TableProfile, label: string): string {
  const lines: string[] = [
    `Dataset: ${label}`,
    `Rows: ${formatNumber(profile.rowCount)} · Columns: ${profile.columnCount}` +
      (profile.truncated ? " (truncated to the row limit)" : "") +
      (profile.skippedRows ? ` · ${profile.skippedRows} malformed row(s) skipped` : ""),
    "",
    "| Column | Type | Non-null | Nulls | Summary |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const column of profile.columns) {
    if (column.type === "numeric" && column.numeric) {
      const n = column.numeric;
      lines.push(
        `| ${column.name} | numeric | ${formatNumber(n.count)} | ${formatNumber(n.nulls)} | ` +
          `min ${formatNumber(n.min)}, p25 ${formatNumber(n.p25)}, median ${formatNumber(n.median)}, ` +
          `p75 ${formatNumber(n.p75)}, max ${formatNumber(n.max)}, mean ${formatNumber(n.mean)}, ` +
          `sd ${formatNumber(n.stdDev)}, sum ${formatNumber(n.sum)} |`
      );
    } else if (column.categorical) {
      const c = column.categorical;
      const top = c.top
        .slice(0, 5)
        .map((entry) => `${entry.value} (${formatNumber(entry.count)})`)
        .join(", ");
      lines.push(
        `| ${column.name} | ${column.type} | ${formatNumber(c.count)} | ${formatNumber(c.nulls)} | ` +
          `${formatNumber(c.distinct)} distinct; top: ${top || "—"} |`
      );
    }
  }

  if (profile.correlations.length) {
    lines.push("", "Notable correlations (Pearson r):");
    for (const entry of profile.correlations.slice(0, 8)) {
      lines.push(`- ${entry.a} ↔ ${entry.b}: r = ${entry.r.toFixed(3)}`);
    }
  }

  return lines.join("\n");
}

/** Reads an attached file's bytes, enforcing that it belongs to the caller. */
async function readOwnedFile(
  context: ToolRunContext,
  fileId: string
): Promise<{ name: string; extension: string; text: string } | null> {
  // readFileContent resolves the file by (userId, fileId), so another user's
  // file id 404s rather than leaking content across accounts.
  const record = await readFileContent(context.userId, fileId).catch(() => null);
  if (!record) return null;
  const extension = record.name.split(".").pop()?.toLowerCase() ?? "";
  return {
    name: record.name,
    extension,
    text: new TextDecoder("utf-8", { fatal: false }).decode(record.buffer),
  };
}

function tableFromText(text: string, extension: string): ParsedTable {
  if (extension === "json") {
    try {
      return parseJsonTable(text);
    } catch {
      return { columns: [], rows: [], skippedRows: 0, truncated: false };
    }
  }
  return parseCsv(text);
}

// ---------------------------------------------------------------------------
// Web Search
// ---------------------------------------------------------------------------
export const webSearchTool: ServerToolDefinition = {
  id: "web_search",
  name: "Web Search",
  description:
    "Search the web for current information. Use for recent events, prices, releases, documentation, or anything that may have changed since training.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query." },
    },
    required: ["query"],
  },
  isAvailable: () => isSearchConfigured(),
  unavailableReason: () =>
    "Web search is not configured on this deployment (no search provider API key is set).",
  async run(input, context): Promise<ToolRunResult> {
    const query = String(input.query ?? "").trim();
    if (!query) return { ok: false, summary: "No search query was provided." };

    context.onProgress({ stage: "searching", progress: 0.3, message: `Searching for “${query}”` });

    try {
      const hits = await webSearch(query, { count: 6, signal: context.signal });
      if (hits.length === 0) {
        return { ok: true, summary: `No results were found for “${query}”.`, data: { query, results: [] } };
      }
      context.onProgress({ stage: "done", progress: 1, message: `${hits.length} results` });

      const summary = [
        `Search results for “${query}”:`,
        "",
        ...hits.map((hit, index) => `${index + 1}. ${hit.title}\n   ${hit.url}\n   ${hit.snippet}`),
        "",
        "Cite these sources by URL where you rely on them.",
      ].join("\n");

      return {
        ok: true,
        summary,
        data: { query, results: hits },
        sources: hits.map((hit) => ({ title: hit.title, url: hit.url, snippet: hit.snippet })),
      };
    } catch (error) {
      const message = error instanceof SearchUnavailableError ? error.message : "The search failed.";
      return { ok: false, summary: message };
    }
  },
};

// ---------------------------------------------------------------------------
// URL Analysis
// ---------------------------------------------------------------------------
export const urlAnalysisTool: ServerToolDefinition = {
  id: "url_analysis",
  name: "URL Analysis",
  description:
    "Fetch a specific web page or JSON endpoint and read its contents. Use when the user supplies a URL or asks what a page says.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "The absolute http(s) URL to fetch." },
    },
    required: ["url"],
  },
  async run(input, context): Promise<ToolRunResult> {
    const url = String(input.url ?? "").trim();
    if (!url) return { ok: false, summary: "No URL was provided." };

    context.onProgress({ stage: "fetching", progress: 0.4, message: `Fetching ${url}` });

    try {
      const page = await fetchReadable(url, { maxChars: 12_000, signal: context.signal });
      context.onProgress({ stage: "done", progress: 1, message: page.title });

      return {
        ok: true,
        summary: [
          `Contents of ${page.url}`,
          `Title: ${page.title}`,
          "",
          page.text || "(the page contained no readable text)",
          page.truncated ? "\n[content truncated]" : "",
        ].join("\n"),
        data: { url: page.url, title: page.title, characters: page.text.length, truncated: page.truncated },
        sources: [{ title: page.title, url: page.url, snippet: page.text.slice(0, 200) }],
      };
    } catch (error) {
      // UnsafeUrlError messages are written to be safe to show a user; they
      // deliberately do not reveal whether an internal host exists.
      const message = error instanceof UnsafeUrlError ? error.message : "That URL could not be fetched.";
      return { ok: false, summary: message };
    }
  },
};

// ---------------------------------------------------------------------------
// File Analysis
// ---------------------------------------------------------------------------
export const fileAnalysisTool: ServerToolDefinition = {
  id: "file_analysis",
  name: "File Analysis",
  description:
    "Read the text of a file the user attached to this conversation. Use to quote, summarize or answer questions about an attachment.",
  parameters: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "Id of the attached file to read." },
    },
    required: ["fileId"],
  },
  async run(input, context): Promise<ToolRunResult> {
    const fileId = String(input.fileId ?? "").trim() || context.attachments[0]?.fileId;
    if (!fileId) return { ok: false, summary: "No file was attached to analyze." };

    context.onProgress({ stage: "reading", progress: 0.5, message: "Reading attachment" });
    const file = await readOwnedFile(context, fileId);
    if (!file) return { ok: false, summary: "That file is not available on this account." };

    const text = file.text.slice(0, 20_000);
    return {
      ok: true,
      summary: [`Contents of ${file.name}:`, "", text, file.text.length > text.length ? "\n[truncated]" : ""].join(
        "\n"
      ),
      data: { fileId, name: file.name, characters: file.text.length },
    };
  },
};

// ---------------------------------------------------------------------------
// Data Analysis  (one of the four headline tools)
// ---------------------------------------------------------------------------
export const dataAnalysisTool: ServerToolDefinition = {
  id: "data_analysis",
  name: "Data Analysis",
  description:
    "Compute real descriptive statistics over an attached CSV/TSV/JSON dataset: per-column types, min/max/mean/median/quartiles/standard deviation, null counts, category frequencies and pairwise correlations. Use whenever the user asks about numbers in a dataset.",
  parameters: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "Id of the attached dataset. Defaults to the first attachment." },
    },
    required: [],
  },
  async run(input, context): Promise<ToolRunResult> {
    const explicitId = String(input.fileId ?? "").trim();
    const candidate =
      explicitId ||
      context.attachments.find((attachment) => /\.(csv|tsv|json)$/i.test(attachment.name))?.fileId ||
      context.attachments[0]?.fileId;

    if (!candidate) {
      return { ok: false, summary: "No dataset is attached. Attach a CSV, TSV or JSON file and try again." };
    }

    context.onProgress({ stage: "loading", progress: 0.3, message: "Loading dataset" });
    const file = await readOwnedFile(context, candidate);
    if (!file) return { ok: false, summary: "That dataset is not available on this account." };

    context.onProgress({ stage: "analyzing", progress: 0.7, message: `Analyzing ${file.name}` });
    const table = tableFromText(file.text, file.extension);

    if (table.columns.length === 0 || table.rows.length === 0) {
      return {
        ok: false,
        summary: `${file.name} could not be read as tabular data. Supported formats are CSV, TSV and JSON arrays of objects.`,
      };
    }

    const profile = profileTable(table);
    context.onProgress({ stage: "done", progress: 1, message: `${profile.rowCount} rows analyzed` });

    return {
      ok: true,
      summary: [
        renderProfile(profile, file.name),
        "",
        "These figures were computed directly from the file. Use them as ground truth and do not recompute or estimate them.",
      ].join("\n"),
      data: {
        name: file.name,
        rowCount: profile.rowCount,
        columnCount: profile.columnCount,
        columns: profile.columns,
        correlations: profile.correlations,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Code Execution  (one of the four headline tools)
// ---------------------------------------------------------------------------
export const codeExecutionTool: ServerToolDefinition = {
  id: "code_execution",
  name: "Code Execution",
  description:
    "Run JavaScript in a sandboxed interpreter and get back its console output and final value. Use for exact arithmetic, data transformation, algorithm checks and verifying code. No network or filesystem access is available inside the sandbox.",
  parameters: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description:
          "JavaScript to execute. The value of the last expression is returned; use console.log for intermediate output.",
      },
    },
    required: ["code"],
  },
  async run(input, context): Promise<ToolRunResult> {
    const code = String(input.code ?? "");
    if (!code.trim()) return { ok: false, summary: "No code was provided to run." };

    context.onProgress({ stage: "executing", progress: 0.5, message: "Running in sandbox" });
    const result = await runJavaScript(code, { signal: context.signal });
    context.onProgress({ stage: "done", progress: 1, message: result.ok ? "Completed" : "Failed" });

    const parts = [`Executed JavaScript (${result.durationMs} ms):`, "", "```javascript", code.slice(0, 4_000), "```"];
    if (result.logs.length) {
      parts.push("", "Console output:", "```", result.logs.join("\n").slice(0, 8_000), "```");
    }
    if (result.ok) {
      parts.push("", "Return value:", "```", result.result ?? "undefined", "```");
    } else {
      parts.push("", `Error: ${result.error}`);
    }
    parts.push(
      "",
      "This output came from a real execution. Report it accurately, including any error."
    );

    return {
      ok: result.ok,
      summary: parts.join("\n"),
      data: {
        code,
        logs: result.logs,
        result: result.result,
        error: result.error,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Image Generation / Understanding  (one of the four headline tools)
// ---------------------------------------------------------------------------
const IMAGE_ENDPOINT = process.env.IMAGE_GATEWAY_URL?.trim();
const IMAGE_MODEL = process.env.IMAGE_GATEWAY_MODEL?.trim() || "black-forest-labs/flux.1-schnell";

export const imageGenerationTool: ServerToolDefinition = {
  id: "image_generation",
  name: "Image Generation",
  description:
    "Generate an image from a text prompt. Use when the user asks for a picture, illustration, logo, diagram or visual concept.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "A detailed description of the image to generate." },
    },
    required: ["prompt"],
  },
  isAvailable: () => Boolean(IMAGE_ENDPOINT && (process.env.AI_GATEWAY_API_KEY ?? process.env.NVIDIA_API_KEY)),
  unavailableReason: () =>
    "Image generation is not configured on this deployment (IMAGE_GATEWAY_URL is not set).",
  async run(input, context): Promise<ToolRunResult> {
    const prompt = String(input.prompt ?? "").trim();
    if (!prompt) return { ok: false, summary: "No image prompt was provided." };
    if (!IMAGE_ENDPOINT) {
      return { ok: false, summary: "Image generation is not configured on this deployment." };
    }

    context.onProgress({ stage: "generating", progress: 0.4, message: "Generating image" });

    try {
      const response = await fetch(IMAGE_ENDPOINT, {
        method: "POST",
        signal: context.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(process.env.AI_GATEWAY_API_KEY ?? process.env.NVIDIA_API_KEY ?? "").trim()}`,
        },
        body: JSON.stringify({ model: IMAGE_MODEL, prompt, n: 1, response_format: "b64_json" }),
      });

      if (!response.ok) {
        return { ok: false, summary: "The image service could not generate that image. Please try again." };
      }

      const payload = (await response.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
        artifacts?: Array<{ base64?: string }>;
      };
      const b64 = payload.data?.[0]?.b64_json ?? payload.artifacts?.[0]?.base64;
      const url = payload.data?.[0]?.url;

      if (!b64 && !url) {
        return { ok: false, summary: "The image service returned no image." };
      }

      context.onProgress({ stage: "done", progress: 1, message: "Image ready" });

      return {
        ok: true,
        summary: `An image was generated for the prompt “${prompt}” and is displayed to the user. Briefly describe what you produced; do not attempt to embed the image yourself.`,
        data: { prompt, image: b64 ? `data:image/png;base64,${b64}` : url },
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, summary: "Image generation was cancelled." };
      }
      return { ok: false, summary: "The image service could not be reached." };
    }
  },
};

// ---------------------------------------------------------------------------
// Deep Research  (one of the four headline tools)
// ---------------------------------------------------------------------------
export const deepResearchTool: ServerToolDefinition = {
  id: "deep_research",
  name: "Deep Research",
  description:
    "Run a multi-step investigation: break the question into sub-queries, search each, read the most relevant pages in full, and return a sourced dossier. Use for open-ended research questions that need more than a single search.",
  parameters: {
    type: "object",
    properties: {
      question: { type: "string", description: "The research question to investigate." },
    },
    required: ["question"],
  },
  isAvailable: () => isSearchConfigured(),
  unavailableReason: () =>
    "Deep research is not configured on this deployment (it requires a web search provider API key).",
  async run(input, context): Promise<ToolRunResult> {
    const question = String(input.question ?? "").trim();
    if (!question) return { ok: false, summary: "No research question was provided." };

    // Sub-queries are derived cheaply rather than with another model call: the
    // point is breadth of retrieval, and a round trip per plan would double the
    // latency of an already slow tool.
    const subQueries = [
      question,
      `${question} latest developments`,
      `${question} analysis OR criticism`,
    ];

    const seen = new Set<string>();
    const hits: SearchHit[] = [];

    for (const [index, query] of subQueries.entries()) {
      if (context.signal.aborted) break;
      context.onProgress({
        stage: "searching",
        progress: 0.1 + index * 0.15,
        message: `Searching: ${query}`,
      });
      try {
        for (const hit of await webSearch(query, { count: 5, signal: context.signal })) {
          if (!seen.has(hit.url)) {
            seen.add(hit.url);
            hits.push(hit);
          }
        }
      } catch (error) {
        if (error instanceof SearchUnavailableError && hits.length === 0) {
          return { ok: false, summary: error.message };
        }
      }
    }

    if (hits.length === 0) {
      return { ok: false, summary: `No sources could be found for “${question}”.` };
    }

    // Read the top pages in full. Capped at 5 to stay inside the serverless
    // execution window; failures are skipped rather than aborting the run.
    const toRead = hits.slice(0, 5);
    const documents: Array<{ title: string; url: string; text: string }> = [];

    for (const [index, hit] of toRead.entries()) {
      if (context.signal.aborted) break;
      context.onProgress({
        stage: "reading",
        progress: 0.55 + index * 0.08,
        message: `Reading ${new URL(hit.url).hostname}`,
        sources: documents.map((doc) => ({ title: doc.title, url: doc.url, snippet: "" })),
      });
      try {
        const page = await fetchReadable(hit.url, { maxChars: 6_000, signal: context.signal });
        if (page.text.trim().length > 200) {
          documents.push({ title: page.title || hit.title, url: page.url, text: page.text });
        }
      } catch {
        // A single unreachable or non-text source should not fail the dossier.
      }
    }

    context.onProgress({ stage: "done", progress: 1, message: `${documents.length} sources read` });

    const summary = [
      `Deep research dossier for: ${question}`,
      "",
      `Searched ${subQueries.length} queries, found ${hits.length} unique results, read ${documents.length} in full.`,
      "",
      "## Sources read",
      ...documents.map((doc, index) => `${index + 1}. ${doc.title} — ${doc.url}`),
      "",
      "## Other results",
      ...hits.slice(documents.length, documents.length + 6).map((hit) => `- ${hit.title} — ${hit.url}`),
      "",
      "## Extracted content",
      ...documents.map(
        (doc, index) => `\n### [${index + 1}] ${doc.title}\n${doc.url}\n\n${doc.text}`
      ),
      "",
      "Synthesize an answer from the above. Cite claims with the numbered sources and their URLs. If the sources disagree or are insufficient, say so explicitly.",
    ].join("\n");

    return {
      ok: true,
      summary,
      data: {
        question,
        queries: subQueries,
        readCount: documents.length,
        hitCount: hits.length,
      },
      sources: [
        ...documents.map((doc) => ({ title: doc.title, url: doc.url, snippet: doc.text.slice(0, 200) })),
        ...hits
          .filter((hit) => !documents.some((doc) => doc.url === hit.url))
          .slice(0, 6)
          .map((hit) => ({ title: hit.title, url: hit.url, snippet: hit.snippet })),
      ],
    };
  },
};

export const ALL_TOOLS: ServerToolDefinition[] = [
  webSearchTool,
  urlAnalysisTool,
  fileAnalysisTool,
  dataAnalysisTool,
  codeExecutionTool,
  imageGenerationTool,
  deepResearchTool,
];
