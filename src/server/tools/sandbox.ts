import {
  getQuickJS,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSHandle,
} from "quickjs-emscripten";

/**
 * JavaScript execution sandbox backed by QuickJS compiled to WebAssembly.
 *
 * Node's `vm` module is not a security boundary — `this.constructor.constructor`
 * walks straight back to the host realm — and `eval` is worse. QuickJS runs in a
 * separate WASM heap with no host bindings at all: `process`, `require`,
 * `fetch`, `globalThis.process` and the filesystem simply do not exist inside
 * it. The only things crossing the boundary are the source string going in and
 * JSON-serializable values coming out.
 *
 * Three limits are enforced by the runtime itself rather than by cooperation
 * from the guest:
 *   - wall-clock deadline via an interrupt handler, so `while(true){}` halts
 *   - memory ceiling, so a runaway allocation fails instead of taking the
 *     function down
 *   - stack ceiling, so deep recursion unwinds cleanly
 *
 * This runs inside a Vercel serverless function, so the WASM module is
 * instantiated per invocation and disposed in a finally block.
 */

export const SANDBOX_TIMEOUT_MS = 5_000;
export const SANDBOX_MEMORY_BYTES = 32 * 1024 * 1024;
export const SANDBOX_STACK_BYTES = 1024 * 1024;
export const MAX_OUTPUT_CHARS = 20_000;
export const MAX_SOURCE_CHARS = 50_000;

export interface SandboxResult {
  ok: boolean;
  /** Anything the script wrote with console.log/error/warn, in order. */
  logs: string[];
  /** The completion value of the final expression, formatted for display. */
  result?: string;
  error?: string;
  durationMs: number;
  timedOut: boolean;
}

/** Formats a guest value for display without leaking host object internals. */
function formatValue(context: QuickJSContext, handle: QuickJSHandle): string {
  try {
    const value = context.dump(handle);
    if (value === undefined) return "undefined";
    if (typeof value === "string") return value;
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return "[unserializable value]";
  }
}

export async function runJavaScript(
  source: string,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<SandboxResult> {
  const startedAt = Date.now();
  const timeoutMs = Math.min(options.timeoutMs ?? SANDBOX_TIMEOUT_MS, 15_000);
  const logs: string[] = [];

  if (source.length > MAX_SOURCE_CHARS) {
    return {
      ok: false,
      logs,
      error: `Script is too long (${source.length} characters, limit ${MAX_SOURCE_CHARS}).`,
      durationMs: 0,
      timedOut: false,
    };
  }

  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  const deadline = Date.now() + timeoutMs;
  let interrupted = false;

  runtime.setMemoryLimit(SANDBOX_MEMORY_BYTES);
  runtime.setMaxStackSize(SANDBOX_STACK_BYTES);
  const deadlineCheck = shouldInterruptAfterDeadline(deadline);
  runtime.setInterruptHandler((rt) => {
    // Honour both the wall clock and an upstream cancel (user pressed Stop).
    if (options.signal?.aborted) {
      interrupted = true;
      return true;
    }
    const stop = deadlineCheck(rt);
    if (stop) interrupted = true;
    return stop;
  });

  const context = runtime.newContext();

  try {
    // Provide a console that captures into `logs`. This is the only host
    // function exposed, and it does nothing but stringify and append.
    const consoleHandle = context.newObject();
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      const fn = context.newFunction(level, (...args: QuickJSHandle[]) => {
        const line = args.map((arg) => formatValue(context, arg)).join(" ");
        if (logs.length < 500) {
          logs.push(level === "log" || level === "info" ? line : `[${level}] ${line}`);
        }
        return context.undefined;
      });
      context.setProp(consoleHandle, level, fn);
      fn.dispose();
    }
    context.setProp(context.global, "console", consoleHandle);
    consoleHandle.dispose();

    const evaluation = context.evalCode(source, "user-script.js");

    if (evaluation.error) {
      const message = formatValue(context, evaluation.error);
      evaluation.error.dispose();
      const timedOut = interrupted || Date.now() >= deadline;
      return {
        ok: false,
        logs,
        error: timedOut
          ? `Execution timed out after ${timeoutMs} ms.`
          : message || "The script threw an error.",
        durationMs: Date.now() - startedAt,
        timedOut,
      };
    }

    const result = formatValue(context, evaluation.value);
    evaluation.value.dispose();

    return {
      ok: true,
      logs,
      result: result.length > MAX_OUTPUT_CHARS ? `${result.slice(0, MAX_OUTPUT_CHARS)}\n…truncated` : result,
      durationMs: Date.now() - startedAt,
      timedOut: false,
    };
  } catch (error) {
    return {
      ok: false,
      logs,
      error: error instanceof Error ? error.message : "The sandbox failed to run this script.",
      durationMs: Date.now() - startedAt,
      timedOut: interrupted,
    };
  } finally {
    // Order matters: the context must go before the runtime that owns it.
    try {
      context.dispose();
    } catch {
      // already disposed by a fatal guest error
    }
    try {
      runtime.dispose();
    } catch {
      // ditto
    }
  }
}
