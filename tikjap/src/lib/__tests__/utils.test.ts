import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cn,
  formatBytes,
  formatDate,
  timeAgo,
  debounce,
  truncate,
  initials,
  titleFromContent,
  isValidHttpUrl,
} from "@/lib/utils";

describe("cn", () => {
  it("joins class names and drops falsy values", () => {
    expect(cn("a", false && "b", null, undefined, "c")).toBe("a c");
  });
});

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024 * 2.5)).toBe("2.5 MB");
  });
  it("handles non-finite values", () => {
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns just now for recent timestamps", () => {
    expect(timeAgo(new Date(Date.now() - 10 * 1000).toISOString())).toBe("just now");
  });
  it("pluralizes units", () => {
    expect(timeAgo(new Date(Date.now() - 2 * 60 * 1000).toISOString())).toBe("2 minutes ago");
    expect(timeAgo(new Date(Date.now() - 60 * 60 * 1000).toISOString())).toBe("1 hour ago");
  });
});

describe("formatDate", () => {
  it("formats a date", () => {
    expect(formatDate("2026-08-15T10:00:00Z")).toMatch(/Aug 15/);
  });
  it("returns empty for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("");
  });
});

describe("debounce", () => {
  it("fires once after the delay", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(49);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("truncate", () => {
  it("shortens long strings", () => {
    expect(truncate("a".repeat(100), 10)).toMatch(/…$/);
    expect(truncate("short", 10)).toBe("short");
  });
});

describe("initials", () => {
  it("derives initials", () => {
    expect(initials("Jane Doe")).toBe("JD");
    expect(initials("alice")).toBe("A");
    expect(initials("")).toBe("");
  });
});

describe("titleFromContent", () => {
  it("collapses newlines and truncates", () => {
    expect(titleFromContent("Hello\nworld")).toBe("Hello world");
    expect(titleFromContent("x".repeat(60))).toMatch(/…$/);
    expect(titleFromContent("")).toBe("New chat");
  });
});

describe("isValidHttpUrl", () => {
  it("validates http(s) urls only", () => {
    expect(isValidHttpUrl("https://example.com")).toBe(true);
    expect(isValidHttpUrl("http://example.com")).toBe(true);
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
  });
});