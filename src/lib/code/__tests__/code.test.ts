import { describe, expect, it } from "vitest";
import { buildTree, collectDirPaths, type TreeDir } from "../tree";
import { collapseUnchanged, diffLines, diffStats } from "../diff";
import type { ProjectFile } from "@/lib/types";

function file(path: string): ProjectFile {
  return {
    id: path,
    path,
    content: "",
    language: null,
    sizeBytes: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("buildTree", () => {
  it("returns nothing for no files", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("nests files under inferred directories", () => {
    const tree = buildTree([file("src/index.ts"), file("package.json")]);
    // Directories sort before files.
    expect(tree.map((n) => `${n.kind}:${n.name}`)).toEqual(["dir:src", "file:package.json"]);
    expect((tree[0] as TreeDir).children.map((n) => n.name)).toEqual(["index.ts"]);
  });

  it("creates each shared directory level exactly once", () => {
    const tree = buildTree([
      file("src/components/a.tsx"),
      file("src/components/b.tsx"),
      file("src/lib/util.ts"),
    ]);
    expect(tree).toHaveLength(1);
    const src = tree[0] as TreeDir;
    expect(src.children.map((n) => n.name)).toEqual(["components", "lib"]);
    const components = src.children[0] as TreeDir;
    expect(components.children.map((n) => n.name)).toEqual(["a.tsx", "b.tsx"]);
  });

  it("handles deep nesting", () => {
    const tree = buildTree([file("a/b/c/d/e.ts")]);
    let node = tree[0] as TreeDir;
    for (const name of ["b", "c", "d"]) {
      expect(node.children).toHaveLength(1);
      node = node.children[0] as TreeDir;
      expect(node.name).toBe(name);
    }
    expect(node.children[0].name).toBe("e.ts");
  });

  it("sorts directories before files at every level, case-insensitively", () => {
    const tree = buildTree([file("Zebra.ts"), file("apple.ts"), file("src/x.ts")]);
    expect(tree.map((n) => n.name)).toEqual(["src", "apple.ts", "Zebra.ts"]);
  });

  it("records the full path on every node", () => {
    const tree = buildTree([file("src/lib/util.ts")]);
    const src = tree[0] as TreeDir;
    const lib = src.children[0] as TreeDir;
    expect(src.path).toBe("src");
    expect(lib.path).toBe("src/lib");
    expect(lib.children[0].path).toBe("src/lib/util.ts");
  });

  it("collects every directory path", () => {
    const tree = buildTree([file("src/lib/util.ts"), file("docs/readme.md")]);
    expect(collectDirPaths(tree).sort()).toEqual(["docs", "src", "src/lib"]);
  });
});

describe("diffLines", () => {
  it("reports no changes for identical content", () => {
    const lines = diffLines("a\nb\nc", "a\nb\nc");
    expect(lines.every((l) => l.kind === "same")).toBe(true);
    expect(diffStats(lines).changed).toBe(false);
  });

  it("marks only the inserted line, not everything after it", () => {
    // The whole point of using an LCS: a naive zip would call lines 2 and 3
    // changed as well.
    const lines = diffLines("a\nb\nc", "a\nNEW\nb\nc");
    expect(diffStats(lines)).toEqual({ added: 1, removed: 0, changed: true });
    expect(lines.find((l) => l.kind === "add")?.text).toBe("NEW");
  });

  it("marks only the removed line", () => {
    const lines = diffLines("a\nb\nc", "a\nc");
    expect(diffStats(lines)).toEqual({ added: 0, removed: 1, changed: true });
    expect(lines.find((l) => l.kind === "remove")?.text).toBe("b");
  });

  it("represents a modified line as a remove plus an add", () => {
    const lines = diffLines("a\nb\nc", "a\nB\nc");
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1, changed: true });
  });

  it("handles an empty original", () => {
    const lines = diffLines("", "a\nb");
    expect(diffStats(lines)).toEqual({ added: 2, removed: 0, changed: true });
  });

  it("handles an emptied file", () => {
    const lines = diffLines("a\nb", "");
    expect(diffStats(lines)).toEqual({ added: 0, removed: 2, changed: true });
  });

  it("ignores a trailing newline difference", () => {
    expect(diffStats(diffLines("a\nb\n", "a\nb")).changed).toBe(false);
  });

  it("numbers lines against the correct side", () => {
    const lines = diffLines("a\nc", "a\nb\nc");
    const added = lines.find((l) => l.kind === "add");
    expect(added?.afterLine).toBe(2);
    expect(added?.beforeLine).toBeUndefined();
    const last = lines[lines.length - 1];
    expect(last).toMatchObject({ kind: "same", beforeLine: 2, afterLine: 3 });
  });

  it("falls back to a whole-file replace past the size ceiling", () => {
    const big = Array.from({ length: 3100 }, (_, i) => `line ${i}`).join("\n");
    const lines = diffLines(big, `${big}\nextra`);
    expect(lines.some((l) => l.kind === "same")).toBe(false);
  });
});

describe("collapseUnchanged", () => {
  it("elides long unchanged runs and reports the gap size", () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 20", "line 20 CHANGED");
    const collapsed = collapseUnchanged(diffLines(before, after), 3);

    const gaps = collapsed.filter((entry) => entry.kind === "gap");
    expect(gaps.length).toBeGreaterThan(0);
    // Far fewer rows than the 41 the full diff would produce.
    expect(collapsed.length).toBeLessThan(20);
  });

  it("keeps the requested context either side of a change", () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 20", "line 20 CHANGED");
    const collapsed = collapseUnchanged(diffLines(before, after), 3);
    const texts = collapsed.filter((e) => e.kind !== "gap").map((e) => (e as { text: string }).text);
    expect(texts).toContain("line 17");
    expect(texts).toContain("line 23");
    expect(texts).not.toContain("line 10");
  });

  it("returns everything when the whole file changed", () => {
    const collapsed = collapseUnchanged(diffLines("a\nb", "x\ny"), 3);
    expect(collapsed.some((e) => e.kind === "gap")).toBe(false);
  });
});
