export type Role = "user" | "admin";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  plan?: PlanId;
  avatarUrl?: string;
  createdAt: string;
}

export interface SessionInfo {
  id: string;
  current: boolean;
  createdAt: string;
  expiresAt: string;
  userAgent?: string;
  ip?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  messageCount: number;
  pinned?: boolean;
  archived?: boolean;
  projectId?: string | null;
}

export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "streaming" | "complete" | "error" | "stopped";

export interface AttachmentRef {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface MessageUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  model?: string;
  attachments?: AttachmentRef[];
  usage?: MessageUsage;
  createdAt: string;
}

export interface ModelCapabilities {
  vision: boolean;
  files: boolean;
  streaming: boolean;
  toolUse: boolean;
}

export interface AIModel {
  id: string;
  name: string;
  description: string;
  provider: string;
  contextWindow: number;
  maxOutputTokens: number;
  capabilities: ModelCapabilities;
  isDefault?: boolean;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  kind: "text" | "image" | "pdf" | "spreadsheet" | "archive" | "other";
  createdAt: string;
}

export interface UsageDay {
  date: string;
  messages: number;
  tokens: number;
}

export interface UsageSummary {
  plan: {
    name: string;
    maxMessagesPerDay: number;
    maxTokensPerDay: number;
  };
  today: {
    messages: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
  };
  history: UsageDay[];
}

export interface AiPreferences {
  defaultModelId: string | null;
  temperature: number;
  markdown: boolean;
  showTimestamps: boolean;
  streamingEnabled: boolean;
}

export interface AccountSettingsInput {
  name: string;
  email: string;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers30d: number;
  totalConversations: number;
  totalMessages: number;
  aiRequests: number;
  failedRequests: number;
  tokensConsumed: number;
  storageBytes: number;
  models: Array<{ modelId: string; requests: number; tokens: number }>;
  status: "operational" | "degraded" | "down";
  generatedAt: string;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChatRequest {
  content: string;
  modelId: string;
  attachments?: string[];
  regenerate?: boolean;
  regenerateMessageId?: string;
  removeFromMessageId?: string;
  assistantId?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

export type PlanId = "free" | "pro" | "team";

export interface Memory {
  id: string;
  content: string;
  createdAt: string;
}

export interface Assistant {
  id: string;
  name: string;
  instructions: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedPrompt {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface StreamChunk {
  type: "delta" | "done" | "error" | "usage";
  content?: string;
  messageId?: string;
  usage?: MessageUsage;
  error?: string;
  title?: string;
  status?: MessageStatus;
}

export interface PublicInfo {
  appName: string;
  mode: "demo" | "live";
  seedAccounts?: { email: string; password: string; role: string }[];
  billingEnabled: boolean;
  plans?: Array<{ name: string; price: number; features: string[] }>;
}