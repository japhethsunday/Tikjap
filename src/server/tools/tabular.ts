/**
 * CSV parsing and descriptive statistics for the Data Analysis tool.
 *
 * The numbers this produces are fed to the model as ground truth, so the
 * parsing has to be correct rather than approximately correct: a naive
 * `split(",")` mangles quoted fields containing commas, embedded newlines and
 * escaped quotes, and every downstream statistic inherits the damage. This is a
 * proper RFC 4180 reader.
 */

export type CellValue = string | number | boolean | null;

export interface ParsedTable {
  columns: string[];
  rows: CellValue[][];
  /** Rows discarded because their arity did not match the header. */
  skippedRows: number;
  truncated: boolean;
}

export const MAX_ROWS = 50_000;
export const MAX_COLUMNS = 512;

/** RFC 4180 reader: handles quoted fields, "" escapes, and CRLF/LF. */
export function parseDelimited(input: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;
  // Strip a UTF-8 BOM, which otherwise corrupts the first column name.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Ignore the trailing empty row produced by a final newline.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      endField();
      index += 1;
      continue;
    }
    if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      endRow();
      index += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Picks the delimiter that yields the most consistent column count. */
export function detectDelimiter(sample: string): string {
  const candidates = [",", "\t", ";", "|"];
  let best = ",";
  let bestScore = -1;
  for (const candidate of candidates) {
    const rows = parseDelimited(sample.slice(0, 64_000), candidate).slice(0, 20);
    if (rows.length < 2) continue;
    const widths = rows.map((r) => r.length);
    const modal = widths[0];
    if (modal < 2) continue;
    const consistent = widths.filter((w) => w === modal).length / widths.length;
    const score = consistent * modal;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function coerce(raw: string): CellValue {
  const value = raw.trim();
  if (value === "") return null;
  const lower = value.toLowerCase();
  if (lower === "null" || lower === "na" || lower === "n/a" || lower === "nan") return null;
  if (lower === "true") return true;
  if (lower === "false") return false;
  // Accept 1,234.56 and plain numerics; reject things like "1.2.3" or "12abc".
  const numeric = value.replace(/,(?=\d{3}\b)/g, "");
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(numeric)) {
    const parsed = Number(numeric);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
}

export function parseCsv(input: string): ParsedTable {
  const delimiter = detectDelimiter(input);
  const raw = parseDelimited(input, delimiter);
  if (raw.length === 0) {
    return { columns: [], rows: [], skippedRows: 0, truncated: false };
  }

  const header = raw[0].slice(0, MAX_COLUMNS).map((name, index) => {
    const clean = name.trim();
    return clean === "" ? `column_${index + 1}` : clean;
  });

  const rows: CellValue[][] = [];
  let skippedRows = 0;
  let truncated = false;

  for (let i = 1; i < raw.length; i += 1) {
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const record = raw[i];
    // Tolerate a short final row; reject genuinely ragged data so statistics
    // are never computed over misaligned columns.
    if (record.length !== header.length) {
      if (record.length < header.length) {
        while (record.length < header.length) record.push("");
      } else {
        skippedRows += 1;
        continue;
      }
    }
    rows.push(record.map(coerce));
  }

  return { columns: header, rows, skippedRows, truncated };
}

export function parseJsonTable(input: string): ParsedTable {
  const data: unknown = JSON.parse(input);
  const array = Array.isArray(data)
    ? data
    : typeof data === "object" && data !== null
      ? // Accept {items:[...]} / {data:[...]} / {results:[...]} wrappers.
        (Object.values(data).find((value) => Array.isArray(value)) as unknown[] | undefined) ?? [data]
      : [];

  const records = array.filter(
    (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item)
  );
  if (records.length === 0) {
    return { columns: [], rows: [], skippedRows: 0, truncated: false };
  }

  // Union of keys in first-seen order so sparse records still line up.
  const columns: string[] = [];
  for (const record of records.slice(0, 1000)) {
    for (const key of Object.keys(record)) {
      if (!columns.includes(key) && columns.length < MAX_COLUMNS) columns.push(key);
    }
  }

  const limited = records.slice(0, MAX_ROWS);
  const rows = limited.map((record) =>
    columns.map((column) => {
      const value = record[column];
      if (value === null || value === undefined) return null;
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return coerce(value);
      return JSON.stringify(value);
    })
  );

  return { columns, rows, skippedRows: 0, truncated: records.length > MAX_ROWS };
}

export type ColumnType = "numeric" | "boolean" | "categorical";

export interface NumericSummary {
  count: number;
  nulls: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  p25: number;
  p75: number;
  sum: number;
}

export interface CategoricalSummary {
  count: number;
  nulls: number;
  distinct: number;
  top: Array<{ value: string; count: number }>;
}

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  numeric?: NumericSummary;
  categorical?: CategoricalSummary;
}

/** Linear-interpolated percentile over a pre-sorted ascending array. */
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function profileColumn(name: string, values: CellValue[]): ColumnProfile {
  const nulls = values.filter((value) => value === null).length;
  const present = values.filter((value) => value !== null) as Exclude<CellValue, null>[];

  const numbers = present.filter((value): value is number => typeof value === "number");
  const booleans = present.filter((value): value is boolean => typeof value === "boolean");

  // Treat a column as numeric only if it is overwhelmingly numeric — a single
  // stray "N/A" should not demote it, but a mostly-text column is categorical.
  if (present.length > 0 && numbers.length / present.length >= 0.8 && numbers.length > 0) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const sum = numbers.reduce((total, value) => total + value, 0);
    const mean = sum / numbers.length;
    const variance =
      numbers.length > 1
        ? numbers.reduce((total, value) => total + (value - mean) ** 2, 0) / (numbers.length - 1)
        : 0;
    return {
      name,
      type: "numeric",
      numeric: {
        count: numbers.length,
        nulls,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean,
        median: percentile(sorted, 0.5),
        stdDev: Math.sqrt(variance),
        p25: percentile(sorted, 0.25),
        p75: percentile(sorted, 0.75),
        sum,
      },
    };
  }

  if (present.length > 0 && booleans.length === present.length) {
    const trues = booleans.filter(Boolean).length;
    return {
      name,
      type: "boolean",
      categorical: {
        count: present.length,
        nulls,
        distinct: new Set(booleans).size,
        top: [
          { value: "true", count: trues },
          { value: "false", count: booleans.length - trues },
        ].filter((entry) => entry.count > 0),
      },
    };
  }

  const counts = new Map<string, number>();
  for (const value of present) {
    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([value, count]) => ({ value, count }));

  return {
    name,
    type: "categorical",
    categorical: { count: present.length, nulls, distinct: counts.size, top },
  };
}

/** Pearson correlation between two numeric columns, ignoring incomplete pairs. */
export function correlation(a: CellValue[], b: CellValue[]): number | null {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = a[i];
    const y = b[i];
    if (typeof x === "number" && typeof y === "number") pairs.push([x, y]);
  }
  if (pairs.length < 3) return null;

  const n = pairs.length;
  const meanX = pairs.reduce((total, [x]) => total + x, 0) / n;
  const meanY = pairs.reduce((total, [, y]) => total + y, 0) / n;
  let numerator = 0;
  let sumSqX = 0;
  let sumSqY = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    numerator += dx * dy;
    sumSqX += dx * dx;
    sumSqY += dy * dy;
  }
  const denominator = Math.sqrt(sumSqX * sumSqY);
  if (denominator === 0) return null;
  return numerator / denominator;
}

export interface TableProfile {
  rowCount: number;
  columnCount: number;
  skippedRows: number;
  truncated: boolean;
  columns: ColumnProfile[];
  correlations: Array<{ a: string; b: string; r: number }>;
}

export function profileTable(table: ParsedTable): TableProfile {
  const columns = table.columns.map((name, index) =>
    profileColumn(
      name,
      table.rows.map((row) => row[index] ?? null)
    )
  );

  const numericIndexes = columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.type === "numeric");

  const correlations: Array<{ a: string; b: string; r: number }> = [];
  // O(n^2) over numeric columns only, and capped — wide tables would otherwise
  // spend the whole request budget here.
  for (let i = 0; i < numericIndexes.length && correlations.length < 25; i += 1) {
    for (let j = i + 1; j < numericIndexes.length && correlations.length < 25; j += 1) {
      const left = numericIndexes[i];
      const right = numericIndexes[j];
      const r = correlation(
        table.rows.map((row) => row[left.index] ?? null),
        table.rows.map((row) => row[right.index] ?? null)
      );
      if (r !== null && Math.abs(r) >= 0.3) {
        correlations.push({ a: left.column.name, b: right.column.name, r });
      }
    }
  }
  correlations.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

  return {
    rowCount: table.rows.length,
    columnCount: table.columns.length,
    skippedRows: table.skippedRows,
    truncated: table.truncated,
    columns,
    correlations,
  };
}
