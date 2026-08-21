import { describe, expect, it, vi, beforeEach } from "vitest";

async function loadApiBase(): Promise<string> {
  const mod = await import("../index");
  return mod.API_BASE_URL;
}

describe("API_BASE_URL", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  });

  it("falls back to /api/v1 when the env var is missing", async () => {
    expect(await loadApiBase()).toBe("/api/v1");
  });

  it("falls back to /api/v1 when the env var is an empty string", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "";
    expect(await loadApiBase()).toBe("/api/v1");
  });

  it("uses a configured value and strips trailing slashes", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "/custom/api/";
    expect(await loadApiBase()).toBe("/custom/api");
  });
});
