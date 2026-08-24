import { beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_TOOLS, PROJECT_TOOL_IDS, checkToolRateLimit, getServerTool, isToolAvailable, runTool } from "../index";
import type { ToolRunContext } from "../types";

function makeContext(overrides: Partial<ToolRunContext> = {}): ToolRunContext {
  return {
    userId: `user-${Math.random().toString(36).slice(2)}`,
    conversationId: "conv-1",
    messageId: "msg-1",
    attachments: [],
    signal: new AbortController().signal,
    onProgress: () => undefined,
    ...overrides,
  };
}

describe("tool registry", () => {
  it("registers the chat tools", () => {
    const chatTools = ALL_TOOLS.filter((tool) => !tool.requiresProject).map((tool) => tool.id).sort();
    expect(chatTools).toEqual([
      "code_execution",
      "data_analysis",
      "deep_research",
      "file_analysis",
      "image_generation",
      "url_analysis",
      "web_search",
    ]);
  });

  it("registers the project tools separately, all requiring a project", () => {
    const projectTools = ALL_TOOLS.filter((tool) => tool.requiresProject).map((tool) => tool.id).sort();
    expect(projectTools).toEqual([
      "code_delete_file",
      "code_list_files",
      "code_read_file",
      "code_run_file",
      "code_write_file",
    ]);
    // PROJECT_TOOL_IDS is what the orchestrator gates on, so the two must agree
    // or a file tool could leak into an ordinary chat turn.
    expect([...PROJECT_TOOL_IDS].sort()).toEqual(projectTools);
  });

  it("gives every tool a description and a parameter schema", () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.parameters.type).toBe("object");
      expect(Array.isArray(tool.parameters.required)).toBe(true);
    }
  });

  it("resolves known tools and rejects unknown ones", () => {
    expect(getServerTool("code_execution")).toBeDefined();
    expect(getServerTool("definitely_not_a_tool")).toBeUndefined();
    expect(isToolAvailable("definitely_not_a_tool")).toBe(false);
  });

  it("returns a failure result for an unknown tool instead of throwing", async () => {
    const result = await runTool("nope", {}, makeContext());
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/unknown tool/i);
  });
});

describe("code_execution through runTool", () => {
  it("executes real code and reports the value", async () => {
    const result = await runTool("code_execution", { code: "6 * 7" }, makeContext());
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("42");
  });

  it("reports a failure without throwing", async () => {
    const result = await runTool("code_execution", { code: "throw new Error('x')" }, makeContext());
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/error/i);
  });

  it("rejects an empty script", async () => {
    const result = await runTool("code_execution", { code: "   " }, makeContext());
    expect(result.ok).toBe(false);
  });

  it("emits progress events", async () => {
    const stages: string[] = [];
    await runTool(
      "code_execution",
      { code: "1" },
      makeContext({ onProgress: (progress) => stages.push(progress.stage) })
    );
    expect(stages).toContain("executing");
    expect(stages).toContain("done");
  });
});

describe("per-tool rate limiting", () => {
  // Exercised directly: runTool checks availability before the limiter, so a
  // tool whose credentials are absent would short-circuit before counting.
  it("cuts a tool off once its budget is spent", () => {
    const user = `user-${Math.random()}`;
    const results = Array.from({ length: 6 }, () => checkToolRateLimit(user, "deep_research"));
    // deep_research allows 3 per 5-minute window.
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results.slice(3).every((r) => !r.ok)).toBe(true);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
  });

  it("gives each tool its own budget", () => {
    const user = `user-${Math.random()}`;
    for (let i = 0; i < 4; i += 1) checkToolRateLimit(user, "deep_research");
    // Exhausting deep_research must not affect an unrelated tool.
    expect(checkToolRateLimit(user, "code_execution").ok).toBe(true);
  });

  it("scopes budgets per user", () => {
    const first = `user-${Math.random()}`;
    const second = `user-${Math.random()}`;
    for (let i = 0; i < 4; i += 1) checkToolRateLimit(first, "deep_research");
    expect(checkToolRateLimit(second, "deep_research").ok).toBe(true);
  });

  it("applies a tighter budget to image generation than to search", () => {
    const user = `user-${Math.random()}`;
    const image = Array.from({ length: 6 }, () => checkToolRateLimit(user, "image_generation"));
    const search = Array.from({ length: 6 }, () => checkToolRateLimit(user, "web_search"));
    expect(image.filter((r) => r.ok)).toHaveLength(5);
    expect(search.every((r) => r.ok)).toBe(true);
  });
});

describe("availability gating", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("reports web_search unavailable with no provider key", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPER_API_KEY;
    const { isToolAvailable: check } = await import("../index");
    expect(check("web_search")).toBe(false);
  });

  it("reports web_search available once a key is set", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    const { isToolAvailable: check } = await import("../index");
    expect(check("web_search")).toBe(true);
  });

  it("refuses to run an unavailable tool and explains why", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPER_API_KEY;
    const { runTool: run } = await import("../index");
    const result = await run("web_search", { query: "anything" }, makeContext());
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/not configured/i);
  });

  it("never fabricates search results when unconfigured", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPER_API_KEY;
    const { runTool: run } = await import("../index");
    const result = await run("web_search", { query: "latest news" }, makeContext());
    expect(result.sources).toBeUndefined();
    expect(result.data).toBeUndefined();
  });
});

describe("data_analysis input handling", () => {
  it("explains itself when no dataset is attached", async () => {
    const result = await runTool("data_analysis", {}, makeContext());
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/no dataset/i);
  });
});

describe("url_analysis input handling", () => {
  it("rejects a private address without attempting a request", async () => {
    const result = await runTool("url_analysis", { url: "http://169.254.169.254/" }, makeContext());
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/private or reserved/i);
  });

  it("rejects a non-http scheme", async () => {
    const result = await runTool("url_analysis", { url: "file:///etc/passwd" }, makeContext());
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/http and https/i);
  });

  it("rejects an empty url", async () => {
    const result = await runTool("url_analysis", { url: "" }, makeContext());
    expect(result.ok).toBe(false);
  });
});
