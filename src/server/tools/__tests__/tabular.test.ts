import { describe, expect, it } from "vitest";
import {
  correlation,
  detectDelimiter,
  parseCsv,
  parseDelimited,
  parseJsonTable,
  profileColumn,
  profileTable,
} from "../tabular";

describe("parseDelimited", () => {
  it("parses a plain grid", () => {
    expect(parseDelimited("a,b\n1,2\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseDelimited('name,note\n"Smith, John",hello')).toEqual([
      ["name", "note"],
      ["Smith, John", "hello"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseDelimited('a\n"He said ""hi"""')).toEqual([["a"], ['He said "hi"']]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseDelimited('a,b\n"line1\nline2",x')).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseDelimited("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("does not emit a trailing empty row", () => {
    expect(parseDelimited("a\n1\n")).toEqual([["a"], ["1"]]);
  });
});

describe("detectDelimiter", () => {
  it.each([
    ["a,b,c\n1,2,3", ","],
    ["a\tb\tc\n1\t2\t3", "\t"],
    ["a;b;c\n1;2;3", ";"],
    ["a|b|c\n1|2|3", "|"],
  ])("detects the delimiter in %j", (input, expected) => {
    expect(detectDelimiter(input)).toBe(expected);
  });
});

describe("parseCsv", () => {
  it("strips a UTF-8 BOM from the first header", () => {
    const table = parseCsv("﻿id,name\n1,a");
    expect(table.columns).toEqual(["id", "name"]);
  });

  it("coerces types", () => {
    const table = parseCsv("n,s,b,e\n42,hello,true,\n");
    expect(table.rows[0]).toEqual([42, "hello", true, null]);
  });

  it("treats NA markers as null", () => {
    const table = parseCsv("v\nNA\nn/a\nnull\nNaN");
    expect(table.rows.flat()).toEqual([null, null, null, null]);
  });

  it("parses thousands separators but not malformed numbers", () => {
    const table = parseCsv("a,b\n1,234.5,1.2.3");
    // "1,234.5" is two fields here; check the standalone behaviour instead.
    const single = parseCsv('v\n"1,234.56"\n1.2.3');
    expect(single.rows[0][0]).toBe(1234.56);
    expect(single.rows[1][0]).toBe("1.2.3");
    expect(table.columns).toHaveLength(2);
  });

  it("names blank header cells", () => {
    expect(parseCsv("a,,c\n1,2,3").columns).toEqual(["a", "column_2", "c"]);
  });

  it("pads short rows and skips over-long ones", () => {
    const table = parseCsv("a,b,c\n1,2\n1,2,3,4\n5,6,7");
    expect(table.rows).toEqual([
      [1, 2, null],
      [5, 6, 7],
    ]);
    expect(table.skippedRows).toBe(1);
  });
});

describe("parseJsonTable", () => {
  it("reads an array of objects", () => {
    const table = parseJsonTable('[{"a":1,"b":"x"},{"a":2,"b":"y"}]');
    expect(table.columns).toEqual(["a", "b"]);
    expect(table.rows).toEqual([
      [1, "x"],
      [2, "y"],
    ]);
  });

  it("unwraps a {data:[...]} envelope", () => {
    const table = parseJsonTable('{"data":[{"a":1}]}');
    expect(table.rows).toEqual([[1]]);
  });

  it("unions sparse keys and fills gaps with null", () => {
    const table = parseJsonTable('[{"a":1},{"b":2}]');
    expect(table.columns).toEqual(["a", "b"]);
    expect(table.rows).toEqual([
      [1, null],
      [null, 2],
    ]);
  });
});

describe("profileColumn", () => {
  it("computes numeric statistics correctly", () => {
    // 2,4,4,4,5,5,7,9 — the textbook sample: mean 5, population sd 2,
    // sample sd (n-1) = 2.13809...
    const profile = profileColumn("v", [2, 4, 4, 4, 5, 5, 7, 9]);
    expect(profile.type).toBe("numeric");
    const n = profile.numeric!;
    expect(n.count).toBe(8);
    expect(n.mean).toBe(5);
    expect(n.median).toBe(4.5);
    expect(n.min).toBe(2);
    expect(n.max).toBe(9);
    expect(n.sum).toBe(40);
    expect(n.stdDev).toBeCloseTo(2.13809, 4);
    expect(n.p25).toBeCloseTo(4, 6);
    expect(n.p75).toBeCloseTo(5.5, 6);
  });

  it("counts nulls separately from values", () => {
    const profile = profileColumn("v", [1, null, 3, null]);
    expect(profile.numeric!.count).toBe(2);
    expect(profile.numeric!.nulls).toBe(2);
    expect(profile.numeric!.mean).toBe(2);
  });

  it("stays numeric despite a few stray strings", () => {
    const values = [...Array(9).fill(1), "oops"];
    expect(profileColumn("v", values).type).toBe("numeric");
  });

  it("becomes categorical when mostly text", () => {
    expect(profileColumn("v", [1, "a", "b", "c"]).type).toBe("categorical");
  });

  it("ranks categorical values by frequency", () => {
    const profile = profileColumn("v", ["a", "b", "a", "c", "a", "b"]);
    expect(profile.type).toBe("categorical");
    expect(profile.categorical!.distinct).toBe(3);
    expect(profile.categorical!.top[0]).toEqual({ value: "a", count: 3 });
  });

  it("detects booleans", () => {
    const profile = profileColumn("v", [true, false, true]);
    expect(profile.type).toBe("boolean");
    expect(profile.categorical!.top).toEqual([
      { value: "true", count: 2 },
      { value: "false", count: 1 },
    ]);
  });
});

describe("correlation", () => {
  it("returns 1 for a perfect positive relationship", () => {
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
  });

  it("returns -1 for a perfect inverse relationship", () => {
    expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
  });

  it("returns null for a constant column", () => {
    expect(correlation([1, 1, 1, 1], [1, 2, 3, 4])).toBeNull();
  });

  it("returns null when too few complete pairs exist", () => {
    expect(correlation([1, null], [2, 3])).toBeNull();
  });

  it("ignores incomplete pairs", () => {
    expect(correlation([1, 2, 3, 4, null], [2, 4, 6, 8, 100])).toBeCloseTo(1, 10);
  });
});

describe("profileTable", () => {
  it("profiles every column and surfaces strong correlations", () => {
    const csv = ["x,y,label", "1,2,a", "2,4,b", "3,6,a", "4,8,b", "5,10,a"].join("\n");
    const profile = profileTable(parseCsv(csv));

    expect(profile.rowCount).toBe(5);
    expect(profile.columnCount).toBe(3);
    expect(profile.columns.map((c) => c.type)).toEqual(["numeric", "numeric", "categorical"]);
    expect(profile.correlations[0].r).toBeCloseTo(1, 10);
    expect([profile.correlations[0].a, profile.correlations[0].b].sort()).toEqual(["x", "y"]);
  });

  it("omits weak correlations", () => {
    const csv = ["x,y", "1,5", "2,3", "3,4", "4,3", "5,4"].join("\n");
    const profile = profileTable(parseCsv(csv));
    expect(profile.correlations.every((c) => Math.abs(c.r) >= 0.3)).toBe(true);
  });
});
