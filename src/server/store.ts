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
  created_at: string;
  updated_at: string;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  instructions: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryRow {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface AssistantRow {
  id: string;
  user_id: string;
  name: string;
  instructions: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface SavedPromptRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
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
    messageCount,
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
}

export async function listConversations(userId: string, options: ListConversationsOptions = {}) {
  const db = createServiceClient();
  let builder = db.from("conversations").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
  if (options.query?.trim()) {
    builder = builder.ilike("title", `%${options.query.trim()}%`);
  }
  if (options.projectId) {
    builder = builder.eq("project_id", options.projectId);
  }
  if (options.pinnedOnly) {
    builder = builder.eq("pinned", true);
  } else if (options.archivedOnly) {
    builder = builder.eq("archived", true);
  } else {
    builder = builder.eq("archived", false);
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
  const { error } = await db.from("conversations").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete conversation: ${error.message}`);
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
  patch: { content?: string; status?: MessageRow["status"]; usage?: MessageUsage },
  db: Db = createServiceClient()
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.content !== undefined) update.content = patch.content;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.usage !== undefined) update.usage = patch.usage;
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

export async function getFile(userId: string, fileId: string, db: Db = createServiceClient()): Promise<FileRow> {
  const { data, error } = await db.from("files").select("*").eq("id", fileId).eq("user_id", userId).maybeSingle();
  if (error || !data) throw new HttpError(404, "not_found", "File not found.");
  return data as unknown as FileRow;
}

export async function deleteFileRecord(userId: string, fileId: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("files").delete().eq("id", fileId).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete file: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

function rowToProject(row: ProjectRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function listProjects(userId: string) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
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
  input: { name: string; description?: string; instructions?: string }
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
    })
    .select("*")
    .single();
  if (error) {
    if (/check/i.test(error.message)) throw new HttpError(400, "validation", "Project name is required.");
    throw new Error(`Failed to create project: ${error.message}`);
  }
  return rowToProject(data as unknown as ProjectRow);
}

export async function updateProject(
  userId: string,
  id: string,
  patch: { name?: string; description?: string; instructions?: string }
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

export async function listMemories(userId: string) {
  const db = createServiceClient();
  const { data, error } = await db
    .from("memories")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Failed to list memories: ${error.message}`);
  return ((data ?? []) as unknown as MemoryRow[]).map((row) => ({
    id: row.id,
    content: row.content,
    createdAt: iso(row.created_at),
  }));
}

export async function createMemory(userId: string, content: string) {
  const cleaned = content.trim().slice(0, 500);
  if (!cleaned) throw new HttpError(400, "validation", "Memory cannot be empty.");
  const db = createServiceClient();
  const { count, error } = await db
    .from("memories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to check memories: ${error.message}`);
  if ((count ?? 0) >= 100) throw new HttpError(400, "validation", "Memory limit reached (100). Remove some first.");
  const { data, error: insertError } = await db
    .from("memories")
    .insert({ user_id: userId, content: cleaned })
    .select("*")
    .single();
  if (insertError) throw new Error(`Failed to save memory: ${insertError.message}`);
  const row = data as unknown as MemoryRow;
  return { id: row.id, content: row.content, createdAt: iso(row.created_at) };
}

export async function deleteMemory(userId: string, id: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("memories").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete memory: ${error.message}`);
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
  return {
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    model: row.model,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
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
  input: { name: string; instructions?: string; model?: string }
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
    })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to create assistant: ${error.message}`);
  return rowToAssistant(data as unknown as AssistantRow);
}

export async function updateAssistant(
  userId: string,
  id: string,
  patch: { name?: string; instructions?: string; model?: string }
) {
  await getAssistant(userId, id);
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
  const { error } = await db.from("assistants").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete assistant: ${error.message}`);
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
  return ((data ?? []) as unknown as SavedPromptRow[]).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: iso(row.created_at),
  }));
}

export async function createSavedPrompt(userId: string, input: { title: string; body: string }) {
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, 4000);
  if (!title || !body) throw new HttpError(400, "validation", "Title and prompt body are required.");
  const db = createServiceClient();
  const { data, error } = await db
    .from("saved_prompts")
    .insert({ user_id: userId, title, body })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to save prompt: ${error.message}`);
  const row = data as unknown as SavedPromptRow;
  return { id: row.id, title: row.title, body: row.body, createdAt: iso(row.created_at) };
}

export async function deleteSavedPrompt(userId: string, id: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("saved_prompts").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Failed to delete prompt: ${error.message}`);
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