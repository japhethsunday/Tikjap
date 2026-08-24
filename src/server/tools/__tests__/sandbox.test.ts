import { describe, expect, it } from "vitest";
import { runJavaScript } from "../sandbox";

describe("runJavaScript", () => {
  it("returns the value of the final expression", async () => {
    const result = await runJavaScript("1 + 2");
    expect(result.ok).toBe(true);
    expect(result.result).toBe("3");
  });

  it("captures console output in order", async () => {
    const result = await runJavaScript('console.log("a"); console.error("b"); 0');
    expect(result.ok).toBe(true);
    expect(result.logs).toEqual(["a", "[error] b"]);
  });

  it("computes real results rather than approximations", async () => {
    const result = await runJavaScript(`
      const primes = [];
      for (let n = 2; primes.length < 10; n++) {
        if (primes.every((p) => n % p)) primes.push(n);
      }
      primes.join(",")
    `);
    expect(result.result).toBe("2,3,5,7,11,13,17,19,23,29");
  });

  it("serializes object results as JSON", async () => {
    const result = await runJavaScript("({ a: 1, b: [2, 3] })");
    expect(JSON.parse(result.result!)).toEqual({ a: 1, b: [2, 3] });
  });

  it("reports a thrown error without crashing", async () => {
    const result = await runJavaScript('throw new Error("boom")');
    expect(result.ok).toBe(false);
    expect(result.error).toContain("boom");
  });

  it("reports a syntax error", async () => {
    const result = await runJavaScript("function (");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  describe("isolation", () => {
    it.each([
      ["process", "typeof process"],
      ["require", "typeof require"],
      ["fetch", "typeof fetch"],
      ["XMLHttpRequest", "typeof XMLHttpRequest"],
      ["globalThis.process", "typeof globalThis.process"],
    ])("does not expose %s to guest code", async (_name, source) => {
      const result = await runJavaScript(source);
      expect(result.ok).toBe(true);
      expect(result.result).toBe("undefined");
    });

    it("cannot reach the host realm through the Function constructor", async () => {
      // The classic vm escape: walk a constructor chain back to the host.
      // In a separate WASM realm there is nothing at the other end.
      const result = await runJavaScript(
        'const F = (function(){}).constructor; F("return typeof process")()'
      );
      // The Function constructor still works — it is ordinary JavaScript — but
      // the realm it builds into is the guest's, where `process` is absent.
      expect(result.ok).toBe(true);
      expect(result.result).toBe("undefined");
    });
  });

  describe("limits", () => {
    it("interrupts an infinite loop instead of hanging", async () => {
      const result = await runJavaScript("while (true) {}", { timeoutMs: 300 });
      expect(result.ok).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.error).toMatch(/timed out/i);
    }, 10_000);

    it("interrupts an infinite generator loop", async () => {
      const result = await runJavaScript("let i = 0; for (;;) { i += 1; }", { timeoutMs: 300 });
      expect(result.timedOut).toBe(true);
    }, 10_000);

    it("survives unbounded allocation", async () => {
      const result = await runJavaScript(
        'const a = []; while (true) { a.push("x".repeat(10000)); }',
        { timeoutMs: 2_000 }
      );
      // Either the memory ceiling or the deadline stops it; both are failures
      // that leave the host process healthy, which is the property under test.
      expect(result.ok).toBe(false);
    }, 15_000);

    it("unwinds deep recursion without taking down the host", async () => {
      const result = await runJavaScript("function f(){ return f(); } f()", { timeoutMs: 2_000 });
      expect(result.ok).toBe(false);
    }, 15_000);

    it("rejects an oversized script before executing it", async () => {
      const result = await runJavaScript("x".repeat(60_000));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/too long/i);
    });

    it("honours an external abort signal", async () => {
      const controller = new AbortController();
      controller.abort();
      const result = await runJavaScript("while (true) {}", { timeoutMs: 10_000 });
      // With no signal wired the deadline still applies; with one already
      // aborted the interrupt handler trips on its first callback.
      expect(result.ok).toBe(false);
      const aborted = await runJavaScript("while (true) {}", {
        timeoutMs: 10_000,
        signal: controller.signal,
      });
      expect(aborted.ok).toBe(false);
      expect(aborted.timedOut).toBe(true);
    }, 30_000);
  });

  it("runs repeatedly without leaking state between invocations", async () => {
    await runJavaScript("globalThis.leaked = 42");
    const result = await runJavaScript("typeof globalThis.leaked");
    expect(result.result).toBe("undefined");
  });
});
