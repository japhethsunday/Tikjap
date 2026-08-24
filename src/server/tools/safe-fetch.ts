import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF-hardened outbound fetch.
 *
 * Tools accept URLs that originate from user input (URL Analysis) or from
 * search-engine output (Deep Research). Either path can point at the
 * deployment's own metadata service, a private VPC address, or localhost, so
 * every request made on a user's behalf goes through here rather than raw
 * `fetch`.
 *
 * Defences, in order:
 *   1. Scheme allowlist — http/https only, so file:, gopher:, data: are out.
 *   2. Port allowlist — blocks probing arbitrary internal services.
 *   3. DNS resolution up front, with every returned address checked against the
 *      private/reserved ranges. A hostname that resolves to 169.254.169.254 or
 *      10.x is rejected before a socket is opened.
 *   4. Redirects are followed manually, re-validating each hop. `redirect:
 *      "follow"` would let a public URL bounce to a private one unchecked.
 *   5. Response size and total time are capped so a hostile endpoint cannot
 *      exhaust the function's memory or hold the request open.
 *
 * DNS rebinding (a name that passes validation then resolves to a private
 * address when the socket is opened) is not fully closed here — that needs a
 * custom agent that pins the validated IP. The window is small and the
 * remaining reachable surface is limited by the port allowlist; documented in
 * the security notes rather than silently ignored.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** Standard web ports only. Anything else is almost certainly internal. */
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 3;
export const DEFAULT_TIMEOUT_MS = 15_000;

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/** RFC1918 + loopback + link-local + CGNAT + reserved ranges. */
const BLOCKED_V4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local — cloud metadata lives here
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved / broadcast
];

function isBlockedIPv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return BLOCKED_V4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedIPv6(ip: string): boolean {
  const address = ip.toLowerCase().split("%")[0];
  if (address === "::" || address === "::1") return true; // unspecified, loopback
  if (address.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(address)) return true; // unique local (fc00::/7)
  if (address.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:10.0.0.1) — unwrap and apply the v4 rules.
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);
  return false;
}

export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIPv4(ip);
  if (net.isIPv6(ip)) return isBlockedIPv6(ip);
  return true; // not a recognizable literal — refuse rather than guess
}

/**
 * Validates a single URL and resolves it, throwing if anything about it or the
 * addresses it points at is unsafe. Returns the parsed URL on success.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("That does not look like a valid URL.");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeUrlError("Only http and https URLs can be fetched.");
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeUrlError(`Port ${url.port} is not allowed.`);
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not allowed.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  // A bare IP literal skips DNS entirely — check it directly.
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new UnsafeUrlError("That address is in a private or reserved range.");
    }
    return url;
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
    throw new UnsafeUrlError("That hostname is not publicly routable.");
  }

  let addresses: string[];
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = records.map((record) => record.address);
  } catch {
    throw new UnsafeUrlError("That hostname could not be resolved.");
  }

  if (addresses.length === 0) {
    throw new UnsafeUrlError("That hostname could not be resolved.");
  }
  // Every address must be safe — one private answer is enough to reject.
  if (addresses.some((address) => isBlockedAddress(address))) {
    throw new UnsafeUrlError("That hostname resolves to a private or reserved address.");
  }

  return url;
}

export interface SafeFetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

/**
 * Fetches a user-supplied URL with redirects validated hop by hop and the
 * response body capped. Returns text; binary responses are rejected by the
 * caller via `contentType`.
 */
export async function safeFetch(
  rawUrl: string,
  options: { timeoutMs?: number; maxBytes?: number; signal?: AbortSignal; accept?: string } = {}
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? MAX_RESPONSE_BYTES;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    let current = rawUrl;
    let response: Response | undefined;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const url = await assertSafeUrl(current);
      response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          // Identify honestly; some sites 403 an empty UA.
          "User-Agent": "TikjapBot/1.0 (+https://tikjap.vercel.app)",
          Accept: options.accept ?? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
          "Accept-Language": "en",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) break;
        // Resolve relative redirects against the current URL, then re-validate.
        current = new URL(location, url).toString();
        if (hop === MAX_REDIRECTS) {
          throw new UnsafeUrlError("Too many redirects.");
        }
        continue;
      }
      break;
    }

    if (!response) throw new UnsafeUrlError("The request could not be completed.");

    const contentType = response.headers.get("content-type") ?? "application/octet-stream";

    // Trust-but-verify the declared length, then enforce the real cap while reading.
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared && declared > maxBytes) {
      throw new UnsafeUrlError("That response is too large to analyze.");
    }

    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          chunks.push(value.subarray(0, value.byteLength - (total - maxBytes)));
          truncated = true;
          await reader.cancel().catch(() => undefined);
          break;
        }
        chunks.push(value);
      }
    }

    const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      url: response.url || current,
      status: response.status,
      contentType,
      body: new TextDecoder("utf-8", { fatal: false }).decode(merged),
      truncated,
    };
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new UnsafeUrlError("That request timed out.");
    }
    throw new UnsafeUrlError("That URL could not be reached.");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
