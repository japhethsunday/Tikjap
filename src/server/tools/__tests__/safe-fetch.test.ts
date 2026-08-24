import { describe, expect, it, vi } from "vitest";
import { assertSafeUrl, isBlockedAddress, UnsafeUrlError } from "../safe-fetch";

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: async (hostname: string) => {
      // Deterministic resolver: the test hostnames map to fixed addresses so
      // the SSRF checks can be exercised without real DNS.
      const table: Record<string, string[]> = {
        "example.com": ["93.184.216.34"],
        "evil-internal.test": ["10.0.0.5"],
        "metadata-alias.test": ["169.254.169.254"],
        "mixed.test": ["93.184.216.34", "127.0.0.1"],
        "v6-loopback.test": ["::1"],
        "v6-public.test": ["2606:2800:220:1:248:1893:25c8:1946"],
        "mapped.test": ["::ffff:192.168.1.1"],
      };
      const addresses = table[hostname];
      if (!addresses) throw new Error("ENOTFOUND");
      return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    },
  },
}));

describe("isBlockedAddress", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "RFC1918 /8"],
    ["172.16.0.1", "RFC1918 /12"],
    ["172.31.255.254", "RFC1918 /12 upper bound"],
    ["192.168.1.1", "RFC1918 /16"],
    ["169.254.169.254", "cloud metadata"],
    ["100.64.0.1", "CGNAT"],
    ["0.0.0.0", "this network"],
    ["224.0.0.1", "multicast"],
    ["::1", "IPv6 loopback"],
    ["fe80::1", "IPv6 link-local"],
    ["fc00::1", "IPv6 unique local"],
    ["::ffff:10.0.0.1", "IPv4-mapped private"],
  ])("blocks %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    ["93.184.216.34", "public IPv4"],
    ["8.8.8.8", "public resolver"],
    ["172.32.0.1", "just outside RFC1918 /12"],
    ["2606:2800:220:1:248:1893:25c8:1946", "public IPv6"],
  ])("allows %s (%s)", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it("refuses values that are not IP literals", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
  });
});

describe("assertSafeUrl", () => {
  it("allows a public https URL", async () => {
    const url = await assertSafeUrl("https://example.com/page");
    expect(url.hostname).toBe("example.com");
  });

  it.each([
    ["file:///etc/passwd", "file scheme"],
    ["gopher://example.com", "gopher scheme"],
    ["data:text/html,<script>", "data scheme"],
  ])("rejects %s (%s)", async (target) => {
    await expect(assertSafeUrl(target)).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects non-web ports", async () => {
    await expect(assertSafeUrl("http://example.com:22/")).rejects.toThrow(/Port 22/);
  });

  it("rejects embedded credentials", async () => {
    await expect(assertSafeUrl("https://user:pass@example.com/")).rejects.toThrow(/credentials/);
  });

  it("rejects localhost by name", async () => {
    await expect(assertSafeUrl("http://localhost/")).rejects.toThrow(/not publicly routable/);
  });

  it("rejects a raw private IP literal", async () => {
    await expect(assertSafeUrl("http://192.168.0.1/")).rejects.toThrow(/private or reserved/);
  });

  it("rejects the cloud metadata address directly", async () => {
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      /private or reserved/
    );
  });

  it("rejects a public hostname that resolves into RFC1918", async () => {
    await expect(assertSafeUrl("https://evil-internal.test/")).rejects.toThrow(
      /resolves to a private or reserved address/
    );
  });

  it("rejects a hostname aliased to the metadata address", async () => {
    await expect(assertSafeUrl("https://metadata-alias.test/")).rejects.toThrow(
      /resolves to a private or reserved address/
    );
  });

  it("rejects when only one of several answers is private", async () => {
    await expect(assertSafeUrl("https://mixed.test/")).rejects.toThrow(
      /resolves to a private or reserved address/
    );
  });

  it("rejects an IPv4-mapped private answer", async () => {
    await expect(assertSafeUrl("https://mapped.test/")).rejects.toThrow(
      /resolves to a private or reserved address/
    );
  });

  it("allows a hostname resolving to public IPv6", async () => {
    await expect(assertSafeUrl("https://v6-public.test/")).resolves.toBeInstanceOf(URL);
  });

  it("rejects a hostname resolving to IPv6 loopback", async () => {
    await expect(assertSafeUrl("https://v6-loopback.test/")).rejects.toThrow(
      /resolves to a private or reserved address/
    );
  });

  it("rejects unresolvable hostnames", async () => {
    await expect(assertSafeUrl("https://does-not-exist.test/")).rejects.toThrow(/could not be resolved/);
  });
});
