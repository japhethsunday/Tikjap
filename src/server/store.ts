import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase";
import { HttpError } from "./errors";
import { getModel, defaultModel as defaultModelId } from "./models";
import type { AttachmentRef, ChatMessage, MessageUsage } from "@/lib/types";

type Db = SupabaseClient;

export interface ProfileRow {
  id: string;
  name: string;
  role: "user" | "admin";
  plan?: string;
  avatar_url: string | null;
  created_at: string;
  last_active_at: string;
  default_model_id: string | null;
  temperature: number;
  markdown: boolean;
  show_timestamps: boolean;
  streaming_enabled: boolean;
}

export interface ServerUser {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  plan?: PlanId;
  avatarUrl: string | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: "streaming" | "complete" | "error" | "stopped";
  model: string | null;
  attachments: AttachmentRef[] | null;
  usage: MessageUsage | null;
  bookmarked?: boolean;
  latency_ms?: number | null;
  tool_calls?: unknown;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  model: string;
  project_id: string | null;
  pinned: boolean;
  archived: boolean;
  tags?: string[];
  sort_order?: number;
  color?: string;
  incognito?: boolean;
  summary?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  instructions: string;
  icon?: string;
  archived?: boolean;
  default_model_id?: string | null;
  memory_enabled?: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectSourceRow {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  url: string | null;
  content: string;
  created_at: string;
}

export interface AuditRow {
  id: string;
  user_id: string;
  project_id: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface MemoryRow {
  id: string;
  user_id: string;
  content: string;
  priority?: number;
  project_id?: string | null;
  status?: string;
  source?: string;
  created_at: string;
}

export interface AssistantRow {
  id: string;
  user_id: string;
  name: string;
  instructions: string;
  model: string;
  avatar?: string;
  starters?: unknown;
  share_token?: string | null;
  versions?: unknown;
  runs?: number;
  created_at: string;
  updated_at: string;
}

export interface SavedPromptRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category?: string;
  tags?: string[];
  runs?: number;
  created_at: string;
}

export interface ScheduleRow {
  id: string;
  user_id: string;
  prompt_id: string | null;
  conversation_id: string | null;
  model_id: string;
  cadence: string;
  next_run: string;
  last_run: string | null;
  active: boolean;
  created_at: string;
}

export interface ShareRow {
  token: string;
  conversation_id: string;
  user_id: string;
  password_hash: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface FeedbackRow {
  id: string;
  user_id: string;
  message_id: string;
  conversation_id: string;
  rating: number;
  reason: string;
  created_at: string;
}

export interface FileRow {
  id: string;
  user_id: string;
  name: string;
  size: number;
  mime_type: string;
  kind: string;
  storage_path: string;
  created_at: string;
}

export interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  not_after: string | null;
  user_agent: string | null;
  ip: string | null;
}

export function iso(value?: string | null): string {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function profileToUser(row: ProfileRow, email: string): ServerUser {
  return {
    id: row.id,
    email,
    name: row.name,
    role: row.role,
    plan: row.plan === "pro" || row.plan === "team" ? row.plan : "free",
    avatarUrl: row.avatar_url,
    createdAt: iso(row.created_at),
    lastActiveAt: iso(row.last_active_at),
  };
}

function messageToChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    status: row.status,
    model: row.model ?? undefined,
    attachments: row.attachments ?? undefined,
    usage: row.usage ?? undefined,
    bookmarked: row.bookmarked ?? false,
    latencyMs: row.latency_ms ?? undefined,
    toolCalls: Array.isArray(row.tool_calls) ? (row.tool_calls as ChatMessage["toolCalls"]) : undefined,
    createdAt: iso(row.created_at),
  };
}

function rowToConversation(row: ConversationRow, messageCount: number) {
  return {
    id: row.id,
    title: row.title,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    model: row.model,
    projectId: row.project_id ?? undefined,
    pinned: row.pinned,
    archived: row.archived,
    tags: row.tags ?? [],
    sortOrder: row.sort_order ?? 0,
    color: row.color ?? "",
    incognito: row.incognito ?? false,
    summary: row.summary || undefined,
    messageCount,
  };
}

export function projectToApi(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    icon: row.icon ?? "folder",
    archived: row.archived ?? false,
    defaultModelId: row.default_model_id ?? null,
    memoryEnabled: row.memory_enabled ?? true,
    notes: row.notes ?? "",
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function memoryToApi(row: MemoryRow) {
  return {
    id: row.id,
    content: row.content,
    priority: row.priority ?? 1,
    projectId: row.project_id ?? null,
    status: row.status ?? "approved",
    source: row.source ?? "manual",
    createdAt: iso(row.created_at),
  };
}

export function assistantToApi(row: AssistantRow) {
  return {
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    model: row.model,
    avatar: row.avatar ?? "bot",
    starters: Array.isArray(row.starters) ? (row.starters as string[]) : [],
    shareToken: row.share_token ?? null,
    versions: Array.isArray(row.versions) ? (row.versions as unknown[]) : [],
    runs: row.runs ?? 0,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function promptToApi(row: SavedPromptRow) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category ?? "",
    tags: row.tags ?? [],
    runs: row.runs ?? 0,
    createdAt: iso(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function getProfileRow(userId: string, db: Db = createServiceClient()): Promise<ProfileRow | null> {
  const { data, error } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return data as unknown as ProfileRow;
}

export async function getServerUser(userId: string, email: string): Promise<ServerUser | null> {
  const row = await getProfileRow(userId);
  if (!row) return null;
  return profileToUser(row, email);
}

export async function ensureProfile(userId: string, name: string, db: Db = createServiceClient()): Promise<void> {
  const { error } = await db.from("profiles").upsert({ id: userId, name }, { onConflict: "id" });
  if (error) throw new Error(`Failed to create profile: ${error.message}`);
}

export async function updateProfileName(userId: string, name: string, db: Db = createServiceClient()): Promise<void> {
  const { error } = await db.from("profiles").update({ name }).eq("id", userId);
  if (error) throw new Error(`Failed to update profile: ${error.message}`);
}

export async function touchProfileActivity(userId: string, db: Db = createServiceClient()): Promise<void> {
  await db.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", userId);
}

export async function getProfilePrefs(userId: string, db: Db = createServiceClient()) {
  const row = await getProfileRow(userId, db);
  return {
    defaultModelId: row?.default_model_id ?? null,
    temperature: row?.temperature ?? 0.7,
    markdown: row?.markdown ?? true,
    showTimestamps: row?.show_timestamps ?? true,
    streamingEnabled: row?.streaming_enabled ?? true,
  };
}

export async function updateProfilePrefs(
  userId: string,
  patch: {
    defaultModelId?: string | null;
    temperature?: number;
    markdown?: boolean;
    showTimestamps?: boolean;
    streamingEnabled?: boolean;
  },
  db: Db = createServiceClient()
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.defaultModelId !== undefined) update.default_model_id = patch.defaultModelId;
  if (patch.temperature !== undefined) update.temperature = patch.temperature;
  if (patch.markdown !== undefined) update.markdown = patch.markdown;
  if (patch.showTimestamps !== undefined) update.show_timestamps = patch.showTimestamps;
  if (patch.streamingEnabled !== undefined) update.streaming_enabled = patch.streamingEnabled;
  const { error } = await db.from("profiles").update(update).eq("id", userId);
  if (error) throw new Error(`Failed to update preferences: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export interface ListConversationsOptions {
  query?: string;
  projectId?: string;
  pinnedOnly?: boolean;
  archivedOnly?: boolean;
  tag?: string;
  limit?: number;
  offset?: number;
}

export async function listConversations(userId: string, options: ListConversationsOptions = {}) {
  const db = createServiceClient();
  let builder = db
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (options.query?.trim()) {
    builder = builder.ilike("title", `%${options.query.trim()}%`);
  }
  if (options.projectId) {
    builder = builder.eq("project_id", options.projectId);
  }
  if (options.tag) {
    builder = builder.contains("tags", [options.tag]);
  }
  if (options.pinnedOnly) {
    builder = builder.eq("pinned", true);
  } else if (options.archivedOnly) {
    builder = builder.eq("archived", true);
  } else {
    builder = builder.eq("archived", false);
  }
  if (options.limit !== undefined) {
    builder = builder.range(options.offset ?? 0, (options.offset ?? 0) + options.limit - 1);
  }
  const { data, error } = await builder;
  if (error) throw new Error(`Failed to list conversations: ${error.message}`);
  const rows = (data ?? []) as unknown as ConversationRow[];
  const counts = await messageCountsFor(userId, rows.map((row) => row.id), db);
  return rows.map((row) => rowToConversation(row, counts.get(row.id) ?? 0));
}

/** Batched message counts for a set of conversations (avoids N+1 queries). */
async function messageCountsFor(
  userId: string,
  conversationIds: string[],
  db: Db
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!conversationIds.length) return counts;
  const owned = new Set(conversationIds);
  const { data, error } = await db
    .from("conversations")
    .select("id, messages(count)")
    .eq("user_id", userId)
    .in("id", conversationIds);
  if (error) throw new Error(`Failed to count messages: ${error.message}`);
  for (const row of (data ?? []) as unknown as Array<{ id: string; messages: Array<{ count: number }> }>) {
    if (!owned.has(row.id)) continue;
    counts.set(row.id, row.messages?.[0]?.count ?? 0);
  }
  return counts;
}

export async function createConversation(
  userId: string,
  input: { title?: string; modelId?: string; projectId?: string }
) {
  const db = createServiceClient();
  if (input.projectId) {
    await getProject(userId, input.projectId, db);
  }
  const { data, error } = await db
    .from("conversations")
    .insert({
      user_id: userId,
      title: input.title?.trim() ? input.title.trim().slice(0, 120) : "New chat",
      model: input.modelId ?? "tikja-1",
      project_id: input.projectId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return rowToConversation(data as unknown as ConversationRow, 0);
}

export async function getConversation(userId: string, id: string): Promise<ReturnType<typeof rowToConversation>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("conversations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Conversation not found.");
  const row = data as unknown as ConversationRow;
  const count = await messageCountFor(row.id, db);
  return rowToConversation(row, count);
}

export async function updateConversationRow(
  userId: string,
  conversationId: string,
  patch: { title?: string; pinned?: boolean; archived?: boolean; projectId?: string | null }
): Promise<ConversationRow> {
  const db = createServiceClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    const cleaned = patch.title.trim().slice(0, 120);
    if (!cleaned) throw new HttpError(400, "validation", "Title cannot be empty.");
    update.title = cleaned;
  }
  if (patch.pinned !== undefined) update.pinned = patch.pinned;
  if (patch.archived !== undefined) {
    update.archived = patch.archived;
    if (patch.archived) update.pinned = false;
  }
  if (patch.projectId !== undefined) {
    if (patch.projectId) await getProject(userId, patch.projectId, db);
    update.project_id = patch.projectId;
  }
  const { data, error } = await db
    .from("conversations")
    .update(update)
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Conversation not found.");
  return data as unknown as ConversationRow;
}

export async function renameConversation(userId: string, id: string, title: string) {
  const row = await updateConversationRow(userId, id, { title });
  const count = await messageCountFor(id);
  return rowToConversation(row, count);
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  const db = createServiceClient();
  const { error, count } = await db.from("conversations").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
  if (!count || count === 0) throw new HttpError(404, "not_found", "Conversation not found.");
}

export async function messageCountFor(conversationId: string, db: Db = createServiceClient()): Promise<number> {
  const { count, error } = await db
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .neq("role", "system");
  if (error) throw new Error(`Failed to count messages: ${error.message}`);
  return count ?? 0;
}

export async function getConversationRow(
  userId: string,
  id: string,
  db: Db = createServiceClient()
): Promise<ConversationRow> {
  const { data, error } = await db
    .from("conversations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Conversation not found.");
  return data as unknown as ConversationRow;
}

export async function updateConversation(
  conversationId: string,
  patch: { title?: string; model?: string },
  db: Db = createServiceClient()
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.model !== undefined) update.model = patch.model;
  await db.from("conversations").update(update).eq("id", conversationId);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function listMessages(userId: string, conversationId: string): Promise<ChatMessage[]> {
  const db = createServiceClient();
  await getConversationRow(userId, conversationId, db);
  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`Failed to list messages: ${error.message}`);
  return ((data ?? []) as unknown as MessageRow[]).map(messageToChatMessage);
}

export async function insertMessage(
  conversationId: string,
  input: {
    role: "user" | "assistant" | "system";
    content: string;
    status: MessageRow["status"];
    model?: string;
    attachments?: AttachmentRef[];
    usage?: MessageUsage;
  },
  db: Db = createServiceClient()
): Promise<MessageRow> {
  const { data, error } = await db
    .from("messages")
    .insert({
      conversation_id: conversationId,
      role: input.role,
      content: input.content,
      status: input.status,
      model: input.model ?? null,
      attachments: input.attachments ?? null,
      usage: input.usage ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to save message: ${error.message}`);
  return data as unknown as MessageRow;
}

export async function updateMessage(
  messageId: string,
  patch: {
    content?: string;
    status?: MessageRow["status"];
    usage?: MessageUsage;
    latencyMs?: number;
    bookmarked?: boolean;
    toolCalls?: unknown[];
  },
  db: Db = createServiceClient()
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.content !== undefined) update.content = patch.content;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.usage !== undefined) update.usage = patch.usage;
  if (patch.latencyMs !== undefined) update.latency_ms = Math.round(patch.latencyMs);
  if (patch.toolCalls !== undefined) update.tool_calls = patch.toolCalls;
  if (patch.bookmarked !== undefined) update.bookmarked = patch.bookmarked;
  if (!Object.keys(update).length) return;
  const { error } = await db.from("messages").update(update).eq("id", messageId);
  if (error) throw new Error(`Failed to update message: ${error.message}`);
}

export async function getMessageRow(
  conversationId: string,
  messageId: string,
  db: Db = createServiceClient()
): Promise<MessageRow | null> {
  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as MessageRow | null) ?? null;
}

export async function getLastUserMessage(conversationId: string, db: Db = createServiceClient()): Promise<MessageRow | null> {
  const { data, error } = await db
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as unknown as MessageRow | null) ?? null;
}

/**
 * Deletes the given message and everything after it within the conversation.
 */
export async function deleteMessagesFrom(conversationId: string, fromMessageId: string, db: Db = createServiceClient()): Promise<void> {
  const { data, error } = await db
    .from("messages")
    .select("id, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) return;
  const rows = (data ?? []) as unknown as Array<{ id: string; created_at: string }>;
  const startIndex = rows.findIndex((row) => row.id === fromMessageId);
  if (startIndex === -1) return;
  const ids = rows.slice(startIndex).map((row) => row.id);
  if (ids.length) {
    await db.from("messages").delete().in("id", ids);
  }
}

// ---------------------------------------------------------------------------
// Usage & analytics
// ---------------------------------------------------------------------------

export async function getTodayUsage(userId: string, day: string): Promise<{ messages: number; tokens: number }> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("day_usage")
    .select("messages, input_tokens, output_tokens")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (error || !data) return { messages: 0, tokens: 0 };
  const row = data as unknown as { messages: number; input_tokens: number; output_tokens: number };
  return { messages: row.messages ?? 0, tokens: (row.input_tokens ?? 0) + (row.output_tokens ?? 0) };
}

export async function incrementUsage(
  userId: string,
  day: string,
  usage: MessageUsage,
  messageCount = 1,
  db: Db = createServiceClient()
): Promise<void> {
  const { error } = await db.rpc("increment_usage", {
    p_user_id: userId,
    p_day: day,
    p_messages: messageCount,
    p_input: usage.inputTokens,
    p_output: usage.outputTokens,
  });
  if (error) throw new Error(`Failed to record usage: ${error.message}`);
}

export async function insertRequestLog(
  userId: string,
  modelId: string,
  usage: MessageUsage,
  ok: boolean,
  db: Db = createServiceClient()
): Promise<void> {
  await db.from("request_logs").insert({
    user_id: userId,
    model_id: modelId,
    ok,
    tokens: usage.inputTokens + usage.outputTokens,
  });
}

export async function usageSummaryFor(userId: string) {
  const db = createServiceClient();
  const day = todayKey();
  const [{ data: today }, { data: history }] = await Promise.all([
    db
      .from("day_usage")
      .select("day, messages, input_tokens, output_tokens")
      .eq("user_id", userId)
      .eq("day", day)
      .maybeSingle(),
    db
      .from("day_usage")
      .select("day, messages, input_tokens, output_tokens")
      .eq("user_id", userId)
      .order("day", { ascending: false })
      .limit(30),
  ]);
  const todayRow = today as unknown as { day: string; messages: number; input_tokens: number; output_tokens: number } | null;
  return {
    today: {
      messages: todayRow?.messages ?? 0,
      tokens: (todayRow?.input_tokens ?? 0) + (todayRow?.output_tokens ?? 0),
      inputTokens: todayRow?.input_tokens ?? 0,
      outputTokens: todayRow?.output_tokens ?? 0,
    },
    history: ((history ?? []) as unknown as Array<{ day: string; messages: number; input_tokens: number; output_tokens: number }>).map(
      (entry) => ({ date: entry.day, messages: entry.messages, tokens: entry.input_tokens + entry.output_tokens })
    ),
  };
}

export async function adminMetrics() {
  const db = createServiceClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count: totalUsers }, { count: totalConversations }, { count: totalMessages }, { count: activeUsers30d }, logs, files] =
    await Promise.all([
      db.from("profiles").select("id", { count: "exact", head: true }),
      db.from("conversations").select("id", { count: "exact", head: true }),
      db.from("messages").select("id", { count: "exact", head: true }),
      db.from("profiles").select("id", { count: "exact", head: true }).gte("last_active_at", thirtyDaysAgo),
      db.from("request_logs").select("model_id, ok, tokens"),
      db.from("files").select("size"),
    ]);
  const logRows = (logs.data ?? []) as unknown as Array<{ model_id: string; ok: boolean; tokens: number }>;
  const modelUsage = new Map<string, { requests: number; tokens: number }>();
  let failedRequests = 0;
  let tokensConsumed = 0;
  for (const log of logRows) {
    const entry = modelUsage.get(log.model_id) ?? { requests: 0, tokens: 0 };
    entry.requests += 1;
    entry.tokens += log.tokens;
    modelUsage.set(log.model_id, entry);
    if (!log.ok) failedRequests += 1;
    tokensConsumed += log.tokens;
  }
  const storageBytes = ((files.data ?? []) as unknown as Array<{ size: number }>).reduce((sum, f) => sum + f.size, 0);
  return {
    totalUsers: totalUsers ?? 0,
    activeUsers30d: activeUsers30d ?? 0,
    totalConversations: totalConversations ?? 0,
    totalMessages: totalMessages ?? 0,
    aiRequests: logRows.length,
    failedRequests,
    tokensConsumed,
    storageBytes,
    models: Array.from(modelUsage.entries()).map(([modelId, value]) => ({ modelId, requests: value.requests, tokens: value.tokens })),
  };
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export async function insertFile(record: {
  id: string;
  user_id: string;
  name: string;
  size: number;
  mime_type: string;
  kind: string;
  storage_path: string;
}): Promise<FileRow> {
  const db = createServiceClient();
  const { data, error } = await db.from("files").insert(record).select("*").single();
  if (error) throw new Error(`Failed to save file metadata: ${error.message}`);
  return data as unknown as FileRow;
}

/**
 * A user's uploaded files, newest first. Scoped by user_id, so one account can
 * never enumerate another's uploads.
 */
export async function listFiles(userId: string, limit = 100, db: Db = createServiceClient()): Promise<FileRow[]> {
  const { data, error } = await db
    .from("files")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new HttpError(500, "internal", "Could not load files.");
  return (data ?? []) as FileRow[];
}

export async function getFile(userId: string, fileId: string, db: Db = createServiceClient()): Promise<FileRow> {
  const { data, error } = await db.from("files").select("*").eq("id", fileId).eq("user_id", userId).maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "File not found.");
  return data as unknown as FileRow;
}

export async function deleteFileRecord(userId: string, fileId: string): Promise<void> {
  const db = createServiceClient();
  const { error, count } = await db.from("files").delete().eq("id", fileId).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete file: ${error.message}`);
  if (!count || count === 0) throw new HttpError(404, "not_found", "File not found.");
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function rowToProject(row: ProjectRow) {
  return projectToApi(row);
}

export async function listProjects(userId: string, options: { includeArchived?: boolean } = {}) {
  const db = createServiceClient();
  let builder = db
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (!options.includeArchived) builder = builder.eq("archived", false);
  const { data, error } = await builder;
  if (error) throw new Error(`Failed to list projects: ${error.message}`);
  return ((data ?? []) as unknown as ProjectRow[]).map(rowToProject);
}

export async function getProject(
  userId: string,
  id: string,
  db: Db = createServiceClient()
): Promise<ProjectRow> {
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Project not found.");
  return data as unknown as ProjectRow;
}

export async function createProject(
  userId: string,
  input: { name: string; description?: string; instructions?: string; icon?: string }
) {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new HttpError(400, "validation", "Project name is required.");
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .insert({
      user_id: userId,
      name,
      description: input.description?.trim().slice(0, 500) ?? "",
      instructions: input.instructions?.trim().slice(0, 4000) ?? "",
      icon: input.icon?.trim().slice(0, 32) || "folder",
    })
    .select("*")
    .single();
  if (error) {
    if (/check/i.test(error.message)) throw new HttpError(400, "validation", "Project name is required.");
    throw new Error(`Failed to create project: ${error.message}`);
  }
  await insertAudit(userId, (data as unknown as ProjectRow).id, "project.created", { name });
  return rowToProject(data as unknown as ProjectRow);
}

export async function updateProject(
  userId: string,
  id: string,
  patch: {
    name?: string;
    description?: string;
    instructions?: string;
    icon?: string;
    archived?: boolean;
    defaultModelId?: string | null;
    memoryEnabled?: boolean;
    notes?: string;
  }
) {
  await getProject(userId, id);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 120);
    if (!name) throw new HttpError(400, "validation", "Project name is required.");
    update.name = name;
  }
  if (patch.description !== undefined) update.description = patch.description.trim().slice(0, 500);
  if (patch.instructions !== undefined) update.instructions = patch.instructions.trim().slice(0, 4000);
  if (patch.icon !== undefined) update.icon = patch.icon.trim().slice(0, 32) || "folder";
  if (patch.archived !== undefined) update.archived = patch.archived;
  if (patch.defaultModelId !== undefined) update.default_model_id = patch.defaultModelId;
  if (patch.memoryEnabled !== undefined) update.memory_enabled = patch.memoryEnabled;
  if (patch.notes !== undefined) update.notes = patch.notes.slice(0, 4000);
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Project not found.");
  return rowToProject(data as unknown as ProjectRow);
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const db = createServiceClient();
  await getProject(userId, id, db);
  const { error } = await db.from("projects").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete project: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------

export async function listMemories(userId: string, options: { status?: string; projectId?: string } = {}) {
  const db = createServiceClient();
  let builder = db
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (options.status) builder = builder.eq("status", options.status);
  if (options.projectId) builder = builder.eq("project_id", options.projectId);
  const { data, error } = await builder;
  if (error) throw new Error(`Failed to list memories: ${error.message}`);
  return ((data ?? []) as unknown as MemoryRow[]).map(memoryToApi);
}

export async function createMemory(
  userId: string,
  content: string,
  options: { priority?: number; projectId?: string | null; status?: string; source?: string } = {}
) {
  const cleaned = content.trim().slice(0, 500);
  if (!cleaned) throw new HttpError(400, "validation", "Memory cannot be empty.");
  const db = createServiceClient();
  const { count, error } = await db
    .from("memories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to check memories: ${error.message}`);
  if ((count ?? 0) >= 150) throw new HttpError(400, "validation", "Memory limit reached (150). Remove some first.");
  const { data, error: insertError } = await db
    .from("memories")
    .insert({
      user_id: userId,
      content: cleaned,
      priority: Math.min(2, Math.max(0, options.priority ?? 1)),
      project_id: options.projectId ?? null,
      status: options.status ?? "approved",
      source: options.source ?? "manual",
    })
    .select("*")
    .single();
  if (insertError) throw new Error(`Failed to save memory: ${insertError.message}`);
  return memoryToApi(data as unknown as MemoryRow);
}

export async function updateMemory(
  userId: string,
  id: string,
  patch: { priority?: number; status?: string }
) {
  const update: Record<string, unknown> = {};
  if (patch.priority !== undefined) update.priority = Math.min(2, Math.max(0, patch.priority));
  if (patch.status !== undefined) {
    if (!["approved", "pending"].includes(patch.status)) {
      throw new HttpError(400, "validation", "Invalid memory status.");
    }
    update.status = patch.status;
  }
  const db = createServiceClient();
  const { data, error } = await db
    .from("memories")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Memory not found.");
  return memoryToApi(data as unknown as MemoryRow);
}

export async function deleteMemoriesBulk(userId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const db = createServiceClient();
  const { data, error } = await db.from("memories").delete().eq("user_id", userId).in("id", ids).select("id");
  if (error) throw new Error(`Failed to delete memories: ${error.message}`);
  return ((data ?? []) as unknown as Array<{ id: string }>).length;
}

export async function deleteMemory(userId: string, id: string): Promise<void> {
  const db = createServiceClient();
  const { error, count } = await db.from("memories").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete memory: ${error.message}`);
  if (!count || count === 0) throw new HttpError(404, "not_found", "Memory not found.");
}

export async function clearMemories(userId: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("memories").delete().eq("user_id", userId);
  if (error) throw new Error(`Failed to clear memories: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Assistants
// ---------------------------------------------------------------------------

function rowToAssistant(row: AssistantRow) {
  return assistantToApi(row);
}

export async function listAssistants(userId: string) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("assistants")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Failed to list assistants: ${error.message}`);
  return ((data ?? []) as unknown as AssistantRow[]).map(rowToAssistant);
}

export async function getAssistant(
  userId: string,
  id: string,
  db: Db = createServiceClient()
): Promise<AssistantRow> {
  const { data, error } = await db
    .from("assistants")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Assistant not found.");
  return data as unknown as AssistantRow;
}

export async function createAssistant(
  userId: string,
  input: { name: string; instructions?: string; model?: string; avatar?: string; starters?: string[] }
) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new HttpError(400, "validation", "Assistant name is required.");
  const model = input.model ?? defaultModelId().id;
  if (!getModel(model)) throw new HttpError(400, "validation", "Unknown model.");
  const db = createServiceClient();
  const { count } = await db.from("assistants").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= 20) throw new HttpError(400, "validation", "Assistant limit reached (20).");
  const { data, error } = await db
    .from("assistants")
    .insert({
      user_id: userId,
      name,
      instructions: input.instructions?.trim().slice(0, 4000) ?? "",
      model,
      avatar: input.avatar?.trim().slice(0, 32) || "bot",
      starters: (input.starters ?? []).slice(0, 4).map((s) => s.trim().slice(0, 120)).filter(Boolean),
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create assistant: ${error.message}`);
  return rowToAssistant(data as unknown as AssistantRow);
}

export async function updateAssistant(
  userId: string,
  id: string,
  patch: { name?: string; instructions?: string; model?: string; avatar?: string; starters?: string[] }
) {
  await snapshotAssistantVersion(userId, id);
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 80);
    if (!name) throw new HttpError(400, "validation", "Assistant name is required.");
    update.name = name;
  }
  if (patch.instructions !== undefined) update.instructions = patch.instructions.trim().slice(0, 4000);
  if (patch.model !== undefined) {
    getModel(patch.model);
    update.model = patch.model;
  }
  if (patch.avatar !== undefined) update.avatar = patch.avatar.trim().slice(0, 32) || "bot";
  if (patch.starters !== undefined) {
    update.starters = patch.starters.slice(0, 4).map((s) => s.trim().slice(0, 120)).filter(Boolean);
  }
  const db = createServiceClient();
  const { data, error } = await db
    .from("assistants")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Assistant not found.");
  return rowToAssistant(data as unknown as AssistantRow);
}

export async function deleteAssistant(userId: string, id: string): Promise<void> {
  const db = createServiceClient();
  const { error, count } = await db.from("assistants").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete assistant: ${error.message}`);
  if (!count || count === 0) throw new HttpError(404, "not_found", "Assistant not found.");
}

// ---------------------------------------------------------------------------
// Saved prompts
// ---------------------------------------------------------------------------

export async function listSavedPrompts(userId: string) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("saved_prompts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Failed to list prompts: ${error.message}`);
  return ((data ?? []) as unknown as SavedPromptRow[]).map(promptToApi);
}

export async function createSavedPrompt(
  userId: string,
  input: { title: string; body: string; category?: string; tags?: string[] }
) {
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 4000);
  if (!title || !body) throw new HttpError(400, "validation", "Title and prompt body are required.");
  const db = createServiceClient();
  const { data, error } = await db
    .from("saved_prompts")
    .insert({
      user_id: userId,
      title,
      body,
      category: input.category?.trim().slice(0, 60) ?? "",
      tags: (input.tags ?? []).slice(0, 8).map((tag) => tag.trim().toLowerCase().slice(0, 24)).filter(Boolean),
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to save prompt: ${error.message}`);
  return promptToApi(data as unknown as SavedPromptRow);
}

export async function deleteSavedPrompt(userId: string, id: string): Promise<void> {
  const db = createServiceClient();
  const { error, count } = await db.from("saved_prompts").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete prompt: ${error.message}`);
  if (!count || count === 0) throw new HttpError(404, "not_found", "Prompt not found.");
}

export async function updateSavedPrompt(
  userId: string,
  id: string,
  patch: { title?: string; body?: string; category?: string; tags?: string[] }
) {
  await getSavedPrompt(userId, id);
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, 120);
    if (!title) throw new HttpError(400, "validation", "Title is required.");
    update.title = title;
  }
  if (patch.body !== undefined) {
    const body = patch.body.trim().slice(0, 4000);
    if (!body) throw new HttpError(400, "validation", "Prompt body is required.");
    update.body = body;
  }
  if (patch.category !== undefined) update.category = patch.category.trim().slice(0, 60);
  if (patch.tags !== undefined) {
    update.tags = patch.tags.slice(0, 8).map((tag) => tag.trim().toLowerCase().slice(0, 24)).filter(Boolean);
  }
  const db = createServiceClient();
  const { data, error } = await db
    .from("saved_prompts")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Prompt not found.");
  return promptToApi(data as unknown as SavedPromptRow);
}

export async function incrementPromptRuns(userId: string, id: string): Promise<number> {
  const db = createServiceClient();
  const current = await getSavedPrompt(userId, id);
  const runs = (current.runs ?? 0) + 1;
  await db.from("saved_prompts").update({ runs }).eq("id", id).eq("user_id", userId);
  return runs;
}

export async function getSavedPrompt(userId: string, id: string): Promise<SavedPromptRow> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("saved_prompts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Prompt not found.");
  return data as unknown as SavedPromptRow;
}

// ---------------------------------------------------------------------------
// Billing plan state
// ---------------------------------------------------------------------------

export type PlanId = "free" | "pro" | "team";

export async function getProfilePlan(userId: string, db: Db = createServiceClient()): Promise<PlanId> {
  const row = await getProfileRow(userId, db);
  const plan = row ? (row as unknown as { plan?: string }).plan : undefined;
  return plan === "pro" || plan === "team" ? plan : "free";
}

export async function setProfilePlan(userId: string, plan: PlanId): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("profiles").update({ plan }).eq("id", userId);
  if (error) throw new Error(`Failed to update plan: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Auth sessions (auth schema)
// ---------------------------------------------------------------------------

export async function listAuthSessions(userId: string): Promise<SessionRow[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .schema("auth")
    .from("sessions")
    .select("id, created_at, updated_at, not_after, user_agent, ip")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as unknown as SessionRow[];
}

export async function deleteAuthSessionsExcept(userId: string, sessionId: string): Promise<void> {
  const db = createServiceClient();
  await db.schema("auth").from("sessions").delete().eq("user_id", userId).neq("id", sessionId);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function uid(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
// ---------------------------------------------------------------------------
// Wave 2: organization, sharing, knowledge, feedback, scheduling
// ---------------------------------------------------------------------------

export async function updateConversationFields(
  userId: string,
  id: string,
  patch: {
    title?: string;
    pinned?: boolean;
    archived?: boolean;
    projectId?: string | null;
    tags?: string[];
    color?: string;
    incognito?: boolean;
    sortOrder?: number;
    summary?: string;
  },
  db: Db = createServiceClient()
): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) update.title = patch.title.trim().slice(0, 120) || "New chat";
  if (patch.pinned !== undefined) update.pinned = patch.pinned;
  if (patch.archived !== undefined) update.archived = patch.archived;
  if (patch.projectId !== undefined) update.project_id = patch.projectId;
  if (patch.tags !== undefined) {
    update.tags = patch.tags.slice(0, 8).map((t) => t.trim().toLowerCase().slice(0, 24)).filter(Boolean);
  }
  if (patch.color !== undefined) update.color = patch.color.slice(0, 16);
  if (patch.incognito !== undefined) update.incognito = patch.incognito;
  if (patch.sortOrder !== undefined) update.sort_order = Math.trunc(patch.sortOrder);
  if (patch.summary !== undefined) update.summary = patch.summary.slice(0, 2000);
  const { error } = await db.from("conversations").update(update).eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to update conversation: ${error.message}`);
}

export async function bulkUpdateConversations(
  userId: string,
  ids: string[],
  action: "archive" | "unarchive" | "delete" | "pin" | "unpin"
): Promise<number> {
  if (!ids.length) return 0;
  const db = createServiceClient();
  if (action === "delete") {
    const { data, error } = await db.from("conversations").select("id").eq("user_id", userId).in("id", ids);
    if (error) throw new Error(`Bulk delete failed: ${error.message}`);
    const owned = ((data ?? []) as unknown as Array<{ id: string }>).map((r) => r.id);
    if (!owned.length) return 0;
    const del = await db.from("conversations").delete().in("id", owned);
    if (del.error) throw new Error(`Bulk delete failed: ${del.error.message}`);
    return owned.length;
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (action === "archive") update.archived = true;
  if (action === "unarchive") update.archived = false;
  if (action === "pin") update.pinned = true;
  if (action === "unpin") update.pinned = false;
  const { data, error } = await db.from("conversations").update(update).eq("user_id", userId).in("id", ids).select("id");
  if (error) throw new Error(`Bulk update failed: ${error.message}`);
  return ((data ?? []) as unknown as Array<{ id: string }>).length;
}

export async function bulkTagConversations(userId: string, ids: string[], tag: string, remove: boolean): Promise<void> {
  if (!ids.length) return;
  const db = createServiceClient();
  const clean = tag.trim().toLowerCase().slice(0, 24);
  if (!clean) return;
  const rows = await Promise.all(ids.map((id) => getConversationRow(userId, id).catch(() => null)));
  for (const row of rows) {
    if (!row) continue;
    const tags = new Set(row.tags ?? []);
    if (remove) tags.delete(clean);
    else tags.add(clean);
    await db.from("conversations").update({ tags: [...tags] }).eq("id", row.id).eq("user_id", userId);
  }
}

export async function reorderConversation(userId: string, id: string, direction: "up" | "down"): Promise<void> {
  const list = await listConversations(userId, {});
  const index = list.findIndex((c) => c.id === id);
  if (index < 0) throw new HttpError(404, "not_found", "Conversation not found.");
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= list.length) return;
  const db = createServiceClient();
  const a = list[index];
  const b = list[swapWith];
  const baseA = a.sortOrder ?? index * 10;
  const baseB = b.sortOrder ?? swapWith * 10;
  await db.from("conversations").update({ sort_order: baseB }).eq("id", a.id).eq("user_id", userId);
  await db.from("conversations").update({ sort_order: baseA }).eq("id", b.id).eq("user_id", userId);
}

export async function duplicateConversation(userId: string, id: string) {
  const source = await getConversationRow(userId, id);
  const messages = await listMessages(userId, id);
  const copy = await createConversation(userId, {
    title: `${source.title} (copy)`.slice(0, 120),
    modelId: source.model,
    projectId: source.project_id ?? undefined,
  });
  const db = createServiceClient();
  if (messages.length) {
    const rows = messages.map((m) => ({
      conversation_id: copy.id,
      role: m.role,
      content: m.content,
      status: m.status === "streaming" ? "complete" : m.status,
      model: m.model ?? null,
      attachments: m.attachments ?? null,
      usage: m.usage ?? null,
    }));
    const { error } = await db.from("messages").insert(rows);
    if (error) throw new Error(`Failed to copy messages: ${error.message}`);
  }
  return storeGetConversationById(copy.id, userId);
}

async function storeGetConversationById(id: string, userId: string) {
  const db = createServiceClient();
  const counts = await messageCountsFor(userId, [id], db);
  const row = await getConversationRow(userId, id, db);
  return rowToConversation(row, counts.get(id) ?? 0);
}

export async function mergeConversations(userId: string, targetId: string, otherId: string) {
  if (targetId === otherId) throw new HttpError(400, "validation", "Cannot merge a conversation with itself.");
  const target = await getConversationRow(userId, targetId);
  const other = await getConversationRow(userId, otherId);
  const incoming = await listMessages(userId, otherId);
  const db = createServiceClient();
  if (incoming.length) {
    const divider = {
      conversation_id: target.id,
      role: "system" as const,
      content: `� merged from "${other.title.replace(/"/g, "'")}" �`,
      status: "complete" as const,
      model: null,
      attachments: null,
      usage: null,
    };
    const rows = [
      divider,
      ...incoming.map((m) => ({
        conversation_id: target.id,
        role: m.role,
        content: m.content,
        status: m.status === "streaming" ? "complete" : m.status,
        model: m.model ?? null,
        attachments: m.attachments ?? null,
        usage: m.usage ?? null,
      })),
    ];
    const { error } = await db.from("messages").insert(rows);
    if (error) throw new Error(`Failed to merge messages: ${error.message}`);
  }
  await db.from("conversations").update({ archived: true }).eq("id", other.id).eq("user_id", userId);
  await insertAudit(userId, target.project_id, "conversation.merged", { from: other.id, into: target.id });
  void target;
  return storeGetConversationById(targetId, userId);
}

// Full-text message search scoped to owner
export async function searchMessages(userId: string, query: string, limit = 30) {
  const term = query.trim();
  if (!term) return [];
  const db = createServiceClient();
  const { data, error } = await db
    .from("messages")
    .select(
      `id, conversation_id, role, content, created_at,
       conversations!inner(title, user_id)`
    )
    .textSearch("content_tsv", term, { type: "websearch" })
    .limit(limit * 2);
  if (error) {
    // Fallback to ilike when tsquery syntax fails
    const fallback = await db
      .from("messages")
      .select(
        `id, conversation_id, role, content, created_at,
         conversations!inner(title, user_id)`
      )
      .ilike("content", `%${term}%`)
      .limit(limit * 2);
    if (fallback.error) return [];
    return shapeSearchHits(userId, fallback.data as unknown as RawSearchHit[], limit);
  }
  return shapeSearchHits(userId, data as unknown as RawSearchHit[], limit);
}

interface RawSearchHit {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  conversations: { title: string; user_id: string };
}

function shapeSearchHits(userId: string, hits: RawSearchHit[], limit: number) {
  return hits
    .filter((hit) => hit.conversations?.user_id === userId)
    .slice(0, limit)
    .map((hit) => ({
      messageId: hit.id,
      conversationId: hit.conversation_id,
      conversationTitle: hit.conversations?.title ?? "",
      role: hit.role,
      snippet: hit.content.length > 180 ? hit.content.slice(0, 180) + "�" : hit.content,
      createdAt: iso(hit.created_at),
    }));
}

// Bookmarks
export async function setMessageBookmark(userId: string, conversationId: string, messageId: string, bookmarked: boolean): Promise<boolean> {
  const db = createServiceClient();
  const { error } = await db
    .from("messages")
    .update({ bookmarked })
    .eq("id", messageId)
    .eq("conversation_id", conversationId);
  if (error) throw new Error(`Failed to update bookmark: ${error.message}`);
  // verify ownership via conversation
  await getConversationRow(userId, conversationId);
  return bookmarked;
}

export async function listBookmarks(userId: string, limit = 50) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("messages")
    .select(
      `id, conversation_id, role, content, created_at,
       conversations!inner(title, user_id)`
    )
    .eq("bookmarked", true)
    .order("created_at", { ascending: false })
    .limit(limit * 2);
  if (error) return [];
  return shapeSearchHits(userId, data as unknown as RawSearchHit[], limit);
}

// Message feedback
export async function setMessageFeedback(
  userId: string,
  conversationId: string,
  messageId: string,
  rating: -1 | 1,
  reason: string
): Promise<void> {
  await getConversationRow(userId, conversationId);
  const db = createServiceClient();
  const { error } = await db.from("message_feedback").upsert(
    {
      user_id: userId,
      message_id: messageId,
      conversation_id: conversationId,
      rating,
      reason: reason.slice(0, 500),
    },
    { onConflict: "message_id,user_id" }
  );
  if (error) throw new Error(`Failed to save feedback: ${error.message}`);
}

export async function feedbackSummary(): Promise<{ up: number; down: number; recent: FeedbackRow[] }> {
  const db = createServiceClient();
  const [{ count: up }, { count: down }, recent] = await Promise.all([
    db.from("message_feedback").select("id", { count: "exact", head: true }).eq("rating", 1),
    db.from("message_feedback").select("id", { count: "exact", head: true }).eq("rating", -1),
    db
      .from("message_feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  return { up: up ?? 0, down: down ?? 0, recent: (recent.data ?? []) as unknown as FeedbackRow[] };
}

// Conversation shares
export async function createShare(
  userId: string,
  conversationId: string,
  options: { expiresAt?: string | null; password?: string | null }
): Promise<ShareRow> {
  await getConversationRow(userId, conversationId);
  const db = createServiceClient();
  const passwordHash = options.password ? hashSharePassword(options.password) : null;
  const { data, error } = await db
    .from("conversation_shares")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      password_hash: passwordHash,
      expires_at: options.expiresAt ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create share link: ${error.message}`);
  return data as unknown as ShareRow;
}

// Salted digest for optional share-link passwords. Read-only share links are
// outside the auth path, so a keyed mixing function is proportionate here.
function mixShareSecret(salt: string, password: string): string {
  let h1 = 0xdeadbeef ^ salt.length;
  let h2 = 0x41c6ce57 ^ password.length;
  const input = `${salt}:${password}`;
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i) + round;
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const left = (h1 >>> 0).toString(16).padStart(8, "0");
  const right = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${left}${right}`;
}

function hashSharePassword(password: string): string {
  const salt = crypto.randomUUID().replace(/-/g, "");
  return `${salt}:${mixShareSecret(salt, password)}`;
}

function verifySharePassword(password: string, stored: string): boolean {
  const separator = stored.indexOf(":");
  if (separator < 0) return false;
  const salt = stored.slice(0, separator);
  const expected = stored.slice(separator + 1);
  if (!salt || !expected) return false;
  const actual = mixShareSecret(salt, password);
  let diff = 0;
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    diff |= (expected.charCodeAt(i) ?? 0) ^ (actual.charCodeAt(i) ?? 0);
  }
  return diff === 0;
}

export async function resolveShare(token: string, password?: string) {
  const db = createServiceClient();
  const { data, error } = await db.from("conversation_shares").select("*").eq("token", token).maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "This share link is invalid or has been revoked.");
  const share = data as unknown as ShareRow;
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    throw new HttpError(410, "gone", "This share link has expired.");
  }
  if (share.password_hash) {
    if (!password || !verifySharePassword(password, share.password_hash)) {
      throw new HttpError(401, "unauthorized", "Password required.");
    }
  }
  const { data: conv, error: convError } = await db
    .from("conversations")
    .select("title, created_at, updated_at")
    .eq("id", share.conversation_id)
    .maybeSingle();
  if (convError || !conv) throw new HttpError(404, "not_found", "The shared conversation was deleted.");
  const { data: msgs, error: msgError } = await db
    .from("messages")
    .select("role, content, status, created_at")
    .eq("conversation_id", share.conversation_id)
    .neq("status", "error")
    .order("created_at", { ascending: true })
    .limit(500);
  if (msgError) throw new Error(`Failed to load shared conversation: ${msgError.message}`);
  return {
    title: (conv as unknown as { title: string }).title,
    messages: ((msgs ?? []) as unknown as Array<{ role: string; content: string; status: string; created_at: string }>).map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: iso(m.created_at),
    })),
  };
}

export async function listShares(userId: string, conversationId: string) {
  const db = createServiceClient();
  await getConversationRow(userId, conversationId);
  const { data, error } = await db
    .from("conversation_shares")
    .select("token, expires_at, created_at, password_hash")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return ((data ?? []) as unknown as Array<Omit<ShareRow, "conversation_id" | "user_id">>).map((s) => ({
    token: s.token,
    expiresAt: s.expires_at,
    protected: Boolean(s.password_hash),
    createdAt: iso(s.created_at),
  }));
}

export async function revokeShare(userId: string, token: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("conversation_shares").delete().eq("token", token).eq("user_id", userId);
  if (error) throw new Error(`Failed to revoke share: ${error.message}`);
}

// Project sources (knowledge base)
export async function listProjectSources(userId: string, projectId: string) {
  await getProject(userId, projectId);
  const db = createServiceClient();

  // content_length is a stored generated column added by a later migration.
  // PostgREST cannot call length() in a select — it reads `length(content)` as
  // an embedded resource and 500s — so the column does the work instead.
  const { data, error } = await db
    .from("project_sources")
    .select("id, project_id, title, url, content_length, created_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (!error) {
    return ((data ?? []) as unknown as Array<{
      id: string;
      project_id: string;
      title: string;
      url: string | null;
      content_length: number | null;
      created_at: string;
    }>).map((source) => ({
      id: source.id,
      projectId: source.project_id,
      title: source.title,
      url: source.url ?? null,
      chars: source.content_length ?? 0,
      createdAt: iso(source.created_at),
    }));
  }

  // The column is missing, so this deployment is running ahead of its
  // migration. Fall back to counting in JS rather than failing outright —
  // heavier, but a project's sources are capped at 50.
  const fallback = await db
    .from("project_sources")
    .select("id, project_id, title, url, content, created_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (fallback.error) throw new Error(`Failed to list sources: ${fallback.error.message}`);

  return ((fallback.data ?? []) as unknown as Array<{
    id: string;
    project_id: string;
    title: string;
    url: string | null;
    content: string | null;
    created_at: string;
  }>).map((source) => ({
    id: source.id,
    projectId: source.project_id,
    title: source.title,
    url: source.url ?? null,
    chars: source.content?.length ?? 0,
    createdAt: iso(source.created_at),
  }));
}

export async function createProjectSource(
  userId: string,
  projectId: string,
  input: { title: string; url?: string | null; content: string }
) {
  await getProject(userId, projectId);
  const title = input.title.trim().slice(0, 160) || "Untitled source";
  const content = input.content.slice(0, 400_000);
  if (!content.trim()) throw new HttpError(400, "validation", "Source content cannot be empty.");
  const db = createServiceClient();
  const { count } = await db
    .from("project_sources")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if ((count ?? 0) >= 50) throw new HttpError(400, "validation", "Source limit reached (50 per project).");
  const { data, error } = await db
    .from("project_sources")
    .insert({ project_id: projectId, user_id: userId, title, url: input.url ?? null, content })
    .select("id, title, url, created_at")
    .single();
  if (error) throw new Error(`Failed to save source: ${error.message}`);
  await insertAudit(userId, projectId, "source.added", { title });
  const row = data as unknown as { id: string; title: string; url: string | null; created_at: string };
  return { id: row.id, title: row.title, url: row.url ?? null, createdAt: iso(row.created_at), chars: content.length };
}

export async function deleteProjectSource(userId: string, projectId: string, sourceId: string): Promise<void> {
  await getProject(userId, projectId);
  const db = createServiceClient();
  const { error } = await db
    .from("project_sources")
    .delete()
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to delete source: ${error.message}`);
}

/** Keyword retrieval over project sources: score chunks by query-term hits. */
export async function retrieveFromSources(
  userId: string,
  projectId: string,
  query: string,
  maxChunks = 4
): Promise<Array<{ title: string; chunk: string }>> {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3).slice(0, 12);
  if (!terms.length) return [];
  const db = createServiceClient();
  const { data, error } = await db
    .from("project_sources")
    .select("title, content")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .limit(50);
  if (error) return [];
  const chunks: Array<{ title: string; text: string }> = [];
  for (const source of (data ?? []) as unknown as Array<{ title: string; content: string }>) {
    const text = source.content ?? "";
    for (let i = 0; i < text.length; i += 700) {
      chunks.push({ title: source.title, text: text.slice(i, i + 700) });
    }
  }
  const scored = chunks.map((chunk) => {
    const lower = chunk.text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      let idx = lower.indexOf(term);
      while (idx !== -1) {
        score += 1;
        idx = lower.indexOf(term, idx + term.length);
        if (score > 30) break;
      }
    }
    return { ...chunk, score };
  });
  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map((c) => ({ title: c.title, chunk: c.text.trim() }));
}

// Audit log / activity feed
export async function insertAudit(
  userId: string,
  projectId: string | null | undefined,
  action: string,
  detail: Record<string, unknown> = {},
  db: Db = createServiceClient()
): Promise<void> {
  await db.from("audit_log").insert({ user_id: userId, project_id: projectId ?? null, action, detail });
}

export async function listAuditForUser(userId: string, options: { projectId?: string; limit?: number } = {}) {
  const db = createServiceClient();
  let builder = db
    .from("audit_log")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);
  if (options.projectId) builder = builder.eq("project_id", options.projectId);
  const { data, error } = await builder;
  if (error) return [];
  return ((data ?? []) as unknown as AuditRow[]).map((row) => ({
    id: row.id,
    action: row.action,
    detail: row.detail ?? {},
    createdAt: iso(row.created_at),
  }));
}

// Assistant extras
export async function incrementAssistantRuns(userId: string, id: string): Promise<void> {
  const db = createServiceClient();
  const { data } = await db.from("assistants").select("runs").eq("id", id).eq("user_id", userId).maybeSingle();
  const runs = ((data as unknown as { runs: number } | null)?.runs ?? 0) + 1;
  await db.from("assistants").update({ runs }).eq("id", id).eq("user_id", userId);
}

export async function snapshotAssistantVersion(userId: string, id: string): Promise<void> {
  const db = createServiceClient();
  const row = await getAssistantRow(userId, id, db);
  const versions = Array.isArray(row.versions) ? (row.versions as Array<Record<string, unknown>>) : [];
  versions.push({
    name: row.name,
    instructions: row.instructions,
    model: row.model,
    avatar: row.avatar ?? "bot",
    savedAt: new Date().toISOString(),
  });
  while (versions.length > 10) versions.shift();
  await db.from("assistants").update({ versions }).eq("id", id).eq("user_id", userId);
}

async function getAssistantRow(userId: string, id: string, db: Db): Promise<AssistantRow> {
  const { data, error } = await db
    .from("assistants")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Assistant not found.");
  return data as unknown as AssistantRow;
}

export async function rollbackAssistant(userId: string, id: string, versionIndex: number) {
  const db = createServiceClient();
  const row = await getAssistantRow(userId, id, db);
  const versions = Array.isArray(row.versions) ? (row.versions as Array<Record<string, unknown>>) : [];
  const version = versions[versionIndex];
  if (!version) throw new HttpError(404, "not_found", "Version not found.");
  const updated = await updateAssistant(userId, id, {
    name: String(version.name ?? row.name),
    instructions: String(version.instructions ?? ""),
    model: String(version.model ?? row.model),
  });
  await snapshotAssistantVersion(userId, id);
  return updated;
}

// Schedules
export async function listSchedules(userId: string) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("schedules")
    .select("*")
    .eq("user_id", userId)
    .order("next_run", { ascending: true })
    .limit(50);
  if (error) throw new Error(`Failed to list schedules: ${error.message}`);
  return ((data ?? []) as unknown as ScheduleRow[]).map(scheduleToApi);
}

function scheduleToApi(row: ScheduleRow) {
  return {
    id: row.id,
    promptId: row.prompt_id,
    conversationId: row.conversation_id,
    modelId: row.model_id,
    cadence: row.cadence,
    nextRun: iso(row.next_run),
    lastRun: row.last_run ? iso(row.last_run) : null,
    active: row.active,
  };
}

export async function createSchedule(
  userId: string,
  input: { promptId: string; cadence: string; modelId?: string; conversationId?: string | null }
) {
  if (!["daily", "weekly", "weekdays"].includes(input.cadence)) {
    throw new HttpError(400, "validation", "Cadence must be daily, weekly, or weekdays.");
  }
  await getSavedPrompt(userId, input.promptId);
  const next = nextRunFor(input.cadence);
  const db = createServiceClient();
  const { count } = await db.from("schedules").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= 20) throw new HttpError(400, "validation", "Schedule limit reached (20).");
  const { data, error } = await db
    .from("schedules")
    .insert({
      user_id: userId,
      prompt_id: input.promptId,
      conversation_id: input.conversationId ?? null,
      model_id: input.modelId?.trim() || "",
      cadence: input.cadence,
      next_run: next.toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create schedule: ${error.message}`);
  return scheduleToApi(data as unknown as ScheduleRow);
}

function nextRunFor(cadence: string): Date {
  const now = new Date();
  const next = new Date(now.getTime() + 60_000); // earliest: one minute out
  if (cadence === "weekly") {
    next.setDate(next.getDate() + (7 - next.getDay()));
  }
  return next;
}

export async function updateScheduleActive(userId: string, id: string, active: boolean) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("schedules")
    .update({ active })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "Schedule not found.");
  return scheduleToApi(data as unknown as ScheduleRow);
}

export async function deleteSchedule(userId: string, id: string): Promise<void> {
  const db = createServiceClient();
  const { error, count } = await db.from("schedules").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete schedule: ${error.message}`);
  if (!count || count === 0) throw new HttpError(404, "not_found", "Schedule not found.");
}

export async function dueSchedules(limit = 20) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("schedules")
    .select("*")
    .eq("active", true)
    .lte("next_run", new Date().toISOString())
    .order("next_run", { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as ScheduleRow[];
}

export async function markScheduleRan(schedule: ScheduleRow): Promise<void> {
  const db = createServiceClient();
  const now = new Date();
  let next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (schedule.cadence === "weekly") next = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await db
    .from("schedules")
    .update({ last_run: now.toISOString(), next_run: next.toISOString() })
    .eq("id", schedule.id);
}

// Data export/import
export interface ExportBundle {
  version: 2;
  exportedAt: string;
  conversations: Array<{
    title: string;
    model: string;
    tags: string[];
    color: string;
    pinned: boolean;
    archived: boolean;
    createdAt: string;
    messages: Array<{ role: string; content: string; createdAt: string }>;
  }>;
  memories: Array<{ content: string; priority: number }>;
  assistants: Array<{ name: string; instructions: string; model: string; avatar?: string; starters?: string[] }>;
  prompts: Array<{ title: string; body: string; category?: string; tags?: string[] }>;
}

export async function exportUserData(userId: string): Promise<ExportBundle> {
  const [conversations, memories, assistants, prompts] = await Promise.all([
    listConversations(userId, {}),
    listMemories(userId, {}),
    listAssistants(userId),
    listSavedPrompts(userId),
  ]);
  const bundle: ExportBundle = {
    version: 2,
    exportedAt: new Date().toISOString(),
    conversations: [],
    memories: memories.filter((m) => m.status === "approved").map((m) => ({ content: m.content, priority: m.priority })),
    assistants: assistants.map((a) => ({ name: a.name, instructions: a.instructions, model: a.model, avatar: a.avatar, starters: a.starters })),
    prompts: prompts.map((p) => ({ title: p.title, body: p.body, category: p.category, tags: p.tags })),
  };
  for (const conversation of conversations) {
    const messages = await listMessages(userId, conversation.id);
    bundle.conversations.push({
      title: conversation.title,
      model: conversation.model,
      tags: conversation.tags ?? [],
      color: conversation.color ?? "",
      pinned: conversation.pinned,
      archived: conversation.archived,
      createdAt: conversation.createdAt,
      messages: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content, createdAt: m.createdAt })),
    });
  }
  return bundle;
}

export async function importChatGPTExport(userId: string, payload: unknown): Promise<{ imported: number }> {
  if (!Array.isArray(payload)) throw new HttpError(400, "validation", "Expected an array of conversations.");
  let imported = 0;
  for (const entry of payload.slice(0, 100)) {
    const record = entry as { title?: string; mapping?: Record<string, { message?: { author?: { role?: string }; content?: { parts?: unknown[] }; create_time?: number } }> };
    if (!record.mapping) continue;
    const nodes = Object.values(record.mapping)
      .map((node) => node.message)
      .filter(Boolean)
      .filter((m) => ["user", "assistant"].includes(m!.author?.role ?? ""))
      .filter((m) => (m!.content?.parts ?? []).length > 0)
      .sort((a, b) => (a!.create_time ?? 0) - (b!.create_time ?? 0))
      .slice(0, 200);
    if (!nodes.length) continue;
    const conversation = await createConversation(userId, {
      title: (record.title ?? "Imported chat").slice(0, 120),
      modelId: undefined,
    });
    const db = createServiceClient();
    const rows = nodes.map((m) => ({
      conversation_id: conversation.id,
      role: m!.author!.role as "user" | "assistant",
      content: String((m!.content!.parts ?? []).filter((p) => typeof p === "string")).slice(0, 32_000),
      status: "complete",
      model: null,
      attachments: null,
      usage: null,
    })).filter((r) => r.content.trim());
    if (rows.length) {
      await db.from("messages").insert(rows);
    }
    imported += 1;
  }
  return { imported };
}

export async function fileUsageFor(userId: string): Promise<{ bytes: number; count: number }> {
  const db = createServiceClient();
  const { data, error } = await db.from("files").select("size").eq("user_id", userId);
  if (error) return { bytes: 0, count: 0 };
  const rows = (data ?? []) as unknown as Array<{ size: number }>;
  return { bytes: rows.reduce((sum, row) => sum + (row.size ?? 0), 0), count: rows.length };
}
