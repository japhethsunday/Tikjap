import type { ToolDefinition, ToolExecutionContext, ToolResult } from "./types";
import { registerTool } from "./registry";

interface DataAnalysisInput {
  fileId: string;
  operations?: Array<{
    type: "summary" | "correlation" | "groupby" | "filter" | "describe";
    config: Record<string, unknown>;
  }>;
}

interface DataAnalysisOutput {
  fileId: string;
  fileName: string;
  rows: number;
  columns: number;
  columnTypes: Record<string, "numeric" | "categorical" | "datetime" | "text">;
  summary: Record<string, {
    count: number;
    mean?: number;
    std?: number;
    min?: number;
    max?: number;
    median?: number;
    unique?: number;
    top?: string;
    freq?: number;
  }>;
  correlations?: Record<string, Record<string, number>>;
  sample: Record<string, unknown>[];
}

const DATA_ANALYSIS_TOOL: ToolDefinition<DataAnalysisInput, DataAnalysisOutput> = {
  id: "data_analysis",
  name: "Data Analysis",
  description: "Analyze CSV/JSON data files - statistical summaries, correlations, distributions",
  icon: "database",
  requiredPermissions: ["data_analysis"],
  inputSchema: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "The file ID to analyze (must be CSV or JSON)" },
      operations: { type: "string", description: "Analysis operations as JSON string (optional)" },
    },
    required: ["fileId"],
  },
  outputSchema: {
    type: "object",
    properties: {
      fileId: { type: "string", description: "File ID" },
      fileName: { type: "string", description: "File name" },
      rows: { type: "number", description: "Number of rows" },
      columns: { type: "number", description: "Number of columns" },
      columnTypes: { type: "string", description: "Column types as JSON string" },
      summary: { type: "string", description: "Summary statistics as JSON string" },
      correlations: { type: "string", description: "Correlations as JSON string" },
      sample: { type: "string", description: "Sample rows as JSON string" },
    },
  },
  supportsStreaming: false,
  estimateDuration: () => 10000,

  handler: async (input: DataAnalysisInput, context: ToolExecutionContext): Promise<ToolResult<DataAnalysisOutput>> => {
    const { fileId } = input;

    context.onProgress?.({
      stage: "loading",
      progress: 10,
      message: "Loading data file...",
    });

    try {
      if (!context.getFileContent) {
        return { success: false, error: "File content access not available" };
      }

      const fileBuffer = await context.getFileContent(fileId);
      const fileContent = new TextDecoder().decode(fileBuffer);

      context.onProgress?.({
        stage: "parsing",
        progress: 30,
        message: "Parsing data...",
      });

      // Detect format and parse
      let data: Record<string, unknown>[];
      let fileName = `file-${fileId}`;

      if (fileId.endsWith(".json") || fileContent.trim().startsWith("{") || fileContent.trim().startsWith("[")) {
        const parsed = JSON.parse(fileContent);
        data = Array.isArray(parsed) ? parsed : [parsed];
        fileName = `data.json`;
      } else {
        // CSV parsing
        data = parseCSV(fileContent);
        fileName = `data.csv`;
      }

      if (data.length === 0) {
        return { success: false, error: "No data rows found in file" };
      }

      context.onProgress?.({
        stage: "analyzing",
        progress: 50,
        message: "Computing statistics...",
      });

      // Infer column types
      const columnTypes = inferColumnTypes(data);
      const numericColumns = Object.entries(columnTypes)
        .filter(([, type]) => type === "numeric")
        .map(([col]) => col);

      // Compute summary statistics
      const summary: Record<string, {
        count: number;
        mean?: number;
        std?: number;
        min?: number;
        max?: number;
        median?: number;
        unique?: number;
        top?: string;
        freq?: number;
      }> = {};
      for (const col of Object.keys(data[0])) {
        const values = data.map(row => row[col]).filter(v => v !== null && v !== undefined && v !== "");
        const numericValues = values.map(Number).filter(n => !isNaN(n));

        if (numericValues.length > 0) {
          const sorted = [...numericValues].sort((a, b) => a - b);
          const sum = numericValues.reduce((a, b) => a + b, 0);
          const mean = sum / numericValues.length;
          const variance = numericValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / numericValues.length;
          summary[col] = {
            count: numericValues.length,
            mean,
            std: Math.sqrt(variance),
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median: sorted[Math.floor(sorted.length / 2)],
          };
        } else {
          const freq: Record<string, number> = {};
          for (const v of values) {
            const key = String(v);
            freq[key] = (freq[key] || 0) + 1;
          }
          const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
          summary[col] = {
            count: values.length,
            unique: Object.keys(freq).length,
            top: top?.[0] || "",
            freq: top?.[1] || 0,
          };
        }
      }

      context.onProgress?.({
        stage: "correlating",
        progress: 70,
        message: "Computing correlations...",
      });

      // Compute correlations for numeric columns
      const correlations: Record<string, Record<string, number>> = {};
      if (numericColumns.length >= 2) {
        for (const col1 of numericColumns) {
          correlations[col1] = {};
          for (const col2 of numericColumns) {
            if (col1 === col2) {
              correlations[col1][col2] = 1;
              continue;
            }
            const vals1 = data.map(r => Number(r[col1])).filter(n => !isNaN(n));
            const vals2 = data.map(r => Number(r[col2])).filter(n => !isNaN(n));
            if (vals1.length === vals2.length && vals1.length > 1) {
              const mean1 = vals1.reduce((a, b) => a + b, 0) / vals1.length;
              const mean2 = vals2.reduce((a, b) => a + b, 0) / vals2.length;
              let cov = 0, std1 = 0, std2 = 0;
              for (let i = 0; i < vals1.length; i++) {
                cov += (vals1[i] - mean1) * (vals2[i] - mean2);
                std1 += Math.pow(vals1[i] - mean1, 2);
                std2 += Math.pow(vals2[i] - mean2, 2);
              }
              correlations[col1][col2] = cov / (Math.sqrt(std1) * Math.sqrt(std2)) || 0;
            }
          }
        }
      }

      context.onProgress?.({
        stage: "completed",
        progress: 100,
        message: `Analysis complete: ${data.length} rows, ${Object.keys(data[0]).length} columns`,
      });

      return {
        success: true,
        output: {
          fileId,
          fileName,
          rows: data.length,
          columns: Object.keys(data[0]).length,
          columnTypes,
          summary,
          correlations: Object.keys(correlations).length > 0 ? correlations : undefined,
          sample: data.slice(0, 10),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Data analysis failed",
      };
    }
  },
};

function parseCSV(content: string): Record<string, unknown>[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const data: Record<string, unknown>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      const val = values[idx].trim().replace(/^"|"$/g, "");
      // Try to convert to number
      const num = Number(val);
      row[h] = isNaN(num) ? val : num;
    });
    data.push(row);
  }
  return data;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function inferColumnTypes(data: Record<string, unknown>[]): Record<string, "numeric" | "categorical" | "datetime" | "text"> {
  const types: Record<string, "numeric" | "categorical" | "datetime" | "text"> = {};
  const columns = Object.keys(data[0] || {});
  
  for (const col of columns) {
    const values = data.map(row => row[col]).filter(v => v !== null && v !== undefined && v !== "");
    if (values.length === 0) {
      types[col] = "text";
      continue;
    }
    
    // Check if numeric
    const numericCount = values.filter(v => !isNaN(Number(v))).length;
    if (numericCount / values.length > 0.8) {
      types[col] = "numeric";
      continue;
    }
    
    // Check if datetime
    const dateCount = values.filter(v => !isNaN(Date.parse(String(v)))).length;
    if (dateCount / values.length > 0.8) {
      types[col] = "datetime";
      continue;
    }
    
    // Check if categorical (low cardinality)
    const uniqueCount = new Set(values.map(String)).size;
    if (uniqueCount < Math.min(20, values.length * 0.1)) {
      types[col] = "categorical";
      continue;
    }
    
    types[col] = "text";
  }
  
  return types;
}

registerTool(DATA_ANALYSIS_TOOL);