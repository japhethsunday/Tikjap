import { getData, todayKey, uid, nowISO, type DayUsage, type RequestLog } from "./db";
import type { MessageUsage } from "@/lib/types";

export const FREE_PLAN = {
  name: "Free",
  maxMessagesPerDay: 100,
  maxTokensPerDay: 500_000,
};

function ensureUsage(store: Awaited<ReturnType<typeof getData>>, userId: string, day: string): DayUsage {
  let entry = store.usage.find((u) => u.userId === userId && u.day === day);
  if (!entry) {
    entry = { userId, day, messages: 0, tokens: 0, inputTokens: 0, outputTokens: 0 };
    store.usage.push(entry);
  }
  return entry;
}

export async function getTodayUsage(userId: string): Promise<{ messages: number; tokens: number }> {
  const store = await getData();
  const entry = store.usage.find((u) => u.userId === userId && u.day === todayKey());
  return { messages: entry?.messages ?? 0, tokens: entry?.tokens ?? 0 };
}

export async function assertWithinLimits(userId: string): Promise<void> {
  const { messages, tokens } = await getTodayUsage(userId);
  if (messages >= FREE_PLAN.maxMessagesPerDay) {
    throw new Error("rate_limit:messages");
  }
  if (tokens >= FREE_PLAN.maxTokensPerDay) {
    throw new Error("rate_limit:tokens");
  }
}

export async function recordRequest(userId: string, modelId: string, usage: MessageUsage, ok: boolean): Promise<void> {
  const store = await getData();
  const log: RequestLog = {
    id: uid(),
    userId,
    modelId,
    ok,
    tokens: usage.inputTokens + usage.outputTokens,
    createdAt: nowISO(),
  };
  store.requestLogs.push(log);
  if (store.requestLogs.length > 10_000) {
    store.requestLogs.splice(0, store.requestLogs.length - 10_000);
  }
}

export async function recordUsage(userId: string, usage: MessageUsage, messageCount = 1): Promise<void> {
  const store = await getData();
  const entry = ensureUsage(store, userId, todayKey());
  entry.messages += messageCount;
  entry.tokens += usage.inputTokens + usage.outputTokens;
  entry.inputTokens += usage.inputTokens;
  entry.outputTokens += usage.outputTokens;
}

export async function usageSummaryFor(userId: string): Promise<{
  plan: typeof FREE_PLAN;
  today: { messages: number; tokens: number; inputTokens: number; outputTokens: number };
  history: Array<{ date: string; messages: number; tokens: number }>;
}> {
  const store = await getData();
  const todays = store.usage.find((u) => u.userId === userId && u.day === todayKey());
  const history = store.usage
    .filter((u) => u.userId === userId)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, 30)
    .map((u) => ({ date: u.day, messages: u.messages, tokens: u.tokens }));
  return {
    plan: FREE_PLAN,
    today: {
      messages: todays?.messages ?? 0,
      tokens: todays?.tokens ?? 0,
      inputTokens: todays?.inputTokens ?? 0,
      outputTokens: todays?.outputTokens ?? 0,
    },
    history,
  };
}

export async function adminMetrics() {
  const store = await getData();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const activeUsers = new Set(
    store.users.filter((u) => u.lastActiveAt >= thirtyDaysAgo).map((u) => u.id)
  );
  const modelUsage = new Map<string, { requests: number; tokens: number }>();
  for (const log of store.requestLogs) {
    const entry = modelUsage.get(log.modelId) ?? { requests: 0, tokens: 0 };
    entry.requests += 1;
    entry.tokens += log.tokens;
    modelUsage.set(log.modelId, entry);
  }
  return {
    totalUsers: store.users.length,
    activeUsers30d: activeUsers.size,
    totalConversations: store.conversations.length,
    totalMessages: store.messages.length,
    aiRequests: store.requestLogs.length,
    failedRequests: store.requestLogs.filter((r) => !r.ok).length,
    tokensConsumed: store.requestLogs.reduce((sum, r) => sum + r.tokens, 0),
    storageBytes: store.files.reduce((sum, f) => sum + f.size, 0),
    models: Array.from(modelUsage.entries()).map(([modelId, value]) => ({
      modelId,
      requests: value.requests,
      tokens: value.tokens,
    })),
  };
}