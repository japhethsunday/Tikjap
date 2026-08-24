/**
 * Line diff for the Code workspace's change review.
 *
 * A real LCS rather than a naive line-by-line comparison: zipping two files
 * together and marking unequal lines reports every line after an insertion as
 * changed, which makes a one-line addition look like a rewrite and is useless
 * for reviewing what the AI actually did.
 */

export type DiffKind = "same" | "add" | "remove";

export interface DiffLine {
  kind: DiffKind;
  /** 1-based line number in the original, absent for additions. */
  beforeLine?: number;
  /** 1-based line number in the updated file, absent for removals. */
  afterLine?: number;
  text: string;
}

export interface DiffStats {
  added: number;
  removed: number;
  changed: boolean;
}

/** Longest common subsequence table over two line arrays. */
function lcsLengths(a: string[], b: string[]): Uint32Array[] {
  const table: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

export function diffLines(before: string, after: string): DiffLine[] {
  // Split without a trailing phantom line so an unchanged file diffs to nothing.
  const a = before.length === 0 ? [] : before.replace(/\n$/, "").split("\n");
  const b = after.length === 0 ? [] : after.replace(/\n$/, "").split("\n");

  // Quadratic in lines; fine for source files, and the writer caps them at
  // 512 KB. Bail out to a whole-file replace beyond a sane ceiling rather than
  // allocating a giant table.
  const CEILING = 3000;
  if (a.length > CEILING || b.length > CEILING) {
    return [
      ...a.map((text, index) => ({ kind: "remove" as const, beforeLine: index + 1, text })),
      ...b.map((text, index) => ({ kind: "add" as const, afterLine: index + 1, text })),
    ];
  }

  const table = lcsLengths(a, b);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: "same", beforeLine: i + 1, afterLine: j + 1, text: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push({ kind: "remove", beforeLine: i + 1, text: a[i] });
      i += 1;
    } else {
      lines.push({ kind: "add", afterLine: j + 1, text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    lines.push({ kind: "remove", beforeLine: i + 1, text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    lines.push({ kind: "add", afterLine: j + 1, text: b[j] });
    j += 1;
  }

  return lines;
}

export function diffStats(lines: DiffLine[]): DiffStats {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "add") added += 1;
    else if (line.kind === "remove") removed += 1;
  }
  return { added, removed, changed: added > 0 || removed > 0 };
}

/**
 * Drops long runs of unchanged lines, keeping `context` lines either side of
 * each change — the same idea as `diff -U`. Returns the lines to render plus
 * markers for what was elided.
 */
export function collapseUnchanged(lines: DiffLine[], context = 3): Array<DiffLine | { kind: "gap"; count: number }> {
  const keep = new Array<boolean>(lines.length).fill(false);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].kind === "same") continue;
    for (let offset = -context; offset <= context; offset += 1) {
      const target = index + offset;
      if (target >= 0 && target < lines.length) keep[target] = true;
    }
  }

  const output: Array<DiffLine | { kind: "gap"; count: number }> = [];
  let gap = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (keep[index]) {
      if (gap > 0) {
        output.push({ kind: "gap", count: gap });
        gap = 0;
      }
      output.push(lines[index]);
    } else {
      gap += 1;
    }
  }
  if (gap > 0) output.push({ kind: "gap", count: gap });
  return output;
}
