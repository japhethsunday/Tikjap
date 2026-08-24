import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A key set under a name the code does not read is indistinguishable from no
 * key at all: the tool reports itself unconfigured, the chip greys out, and
 * there is nothing in the logs. That happened in this project when the search
 * variables were renamed, so both spellings are supported and pinned here.
 */

const ORIGINAL_ENV = { ...process.env };

function clearSearchEnv() {
  for (const name of [
    "BRAVE_SEARCH_API_KEY",
    "BRAVE_API_KEY",
    "TAVILY_API_KEY",
    "SERPER_API_KEY",
    "SERP_API_KEY",
    "GOOGLE_SEARCH_API_KEY",
    "GOOGLE_SEARCH_ENGINE_ID",
    "GOOGLE_CSE_ID",
  ]) {
    delete process.env[name];
  }
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  clearSearchEnv();
  vi.resetModules();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

async function provider() {
  const { configuredSearchProvider } = await import("../search");
  return configuredSearchProvider();
}

describe("search provider resolution", () => {
  it("reports none when nothing is set", async () => {
    expect(await provider()).toBe("none");
  });

  it.each([
    ["BRAVE_SEARCH_API_KEY", "brave"],
    ["BRAVE_API_KEY", "brave"],
    ["TAVILY_API_KEY", "tavily"],
    ["SERPER_API_KEY", "serper"],
    ["SERP_API_KEY", "serper"],
  ])("accepts %s and resolves to %s", async (name, expected) => {
    process.env[name] = "test-key";
    expect(await provider()).toBe(expected);
  });

  it("treats an empty or whitespace value as unset", async () => {
    process.env.BRAVE_API_KEY = "   ";
    expect(await provider()).toBe("none");
  });

  it("needs both halves of Google Custom Search", async () => {
    process.env.GOOGLE_SEARCH_API_KEY = "key";
    // A key with no engine id cannot make a request, so it must not count.
    expect(await provider()).toBe("none");

    process.env.GOOGLE_SEARCH_ENGINE_ID = "engine";
    vi.resetModules();
    expect(await provider()).toBe("google");
  });

  it("accepts GOOGLE_CSE_ID as the engine id", async () => {
    process.env.GOOGLE_SEARCH_API_KEY = "key";
    process.env.GOOGLE_CSE_ID = "engine";
    expect(await provider()).toBe("google");
  });

  it("prefers Brave when several providers are configured", async () => {
    process.env.BRAVE_API_KEY = "a";
    process.env.TAVILY_API_KEY = "b";
    process.env.SERP_API_KEY = "c";
    expect(await provider()).toBe("brave");
  });

  it("marks search available to the registry under either spelling", async () => {
    process.env.BRAVE_API_KEY = "test-key";
    const { isToolAvailable } = await import("../index");
    expect(isToolAvailable("web_search")).toBe(true);
    expect(isToolAvailable("deep_research")).toBe(true);
  });

  it("names both spellings in the unconfigured message", async () => {
    const { runTool } = await import("../index");
    const result = await runTool(
      "web_search",
      { query: "x" },
      {
        userId: `user-${Math.random()}`,
        conversationId: "c",
        messageId: "m",
        attachments: [],
        signal: new AbortController().signal,
        onProgress: () => undefined,
      }
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/not configured/i);
  });
});
