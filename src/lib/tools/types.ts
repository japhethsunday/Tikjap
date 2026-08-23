export type ToolPermission =
  | "web_search"
  | "file_analysis"
  | "url_analysis"
  | "data_analysis"
  | "code_execution"
  | "image_generation"
  | "deep_research";

export interface ToolDefinition<
  TInput = unknown,
  TOutput = unknown
> {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  requiredPermissions: ToolPermission[];
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  outputSchema?: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
  };
  handler: ToolHandler<TInput, TOutput>;
  estimateDuration?: (input: TInput) => number;
  supportsStreaming?: boolean;
}

export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ToolExecutionContext
) => Promise<ToolResult<TOutput>>;

export interface ToolExecutionContext {
  userId: string;
  conversationId: string;
  messageId: string;
  modelId: string;
  abortSignal: AbortSignal;
  onProgress?: (progress: ToolProgress) => void;
  getFileContent?: (fileId: string) => Promise<Uint8Array>;
}

export interface ToolProgress {
  stage: string;
  progress: number;
  message?: string;
  sources?: ToolSource[];
}

export interface ToolSource {
  title: string;
  url: string;
  snippet: string;
  relevanceScore?: number;
}

export interface ToolResult<TOutput = Record<string, unknown>> {
  success: boolean;
  output?: TOutput;
  error?: string;
  sources?: ToolSource[];
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  toolId: string;
  input: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  startTime: number;
  endTime?: number;
  result?: ToolResult;
  progress?: ToolProgress;
}

export interface ToolRegistry {
  register<TInput, TOutput>(definition: ToolDefinition<TInput, TOutput>): void;
  get(id: string): ToolDefinition | undefined;
  getAll(): ToolDefinition[];
  getByPermission(permission: ToolPermission): ToolDefinition[];
  has(id: string): boolean;
}

export const TOOL_PERMISSIONS: Record<ToolPermission, { name: string; description: string }> = {
  web_search: { name: "Web Search", description: "Search the web for current information" },
  file_analysis: { name: "File Analysis", description: "Analyze uploaded documents and files" },
  url_analysis: { name: "URL Analysis", description: "Fetch and analyze content from URLs" },
  data_analysis: { name: "Data Analysis", description: "Analyze datasets and generate insights" },
  code_execution: { name: "Code Execution", description: "Run code in a secure sandbox" },
  image_generation: { name: "Image Generation", description: "Generate images from text prompts" },
  deep_research: { name: "Deep Research", description: "Conduct multi-step research investigations" },
};