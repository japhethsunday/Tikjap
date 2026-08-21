import {
  adminMetrics as storeAdminMetrics,
  getTodayUsage as storeGetTodayUsage,
  incrementUsage,
  insertRequestLog,
  todayKey,
  usageSummaryFor as storeUsageSummaryFor,
} from "./store";
import type { MessageUsage } from "@/lib/types";

export const FREE_PLAN = {
  name: "Free",
  maxMessagesPerDay: 100,
  maxTokensPerDay: 500_000,
};

export async function getTodayUsage(userId: string): Promise<{ messages: number; tokens: number }> {
  return storeGetTodayUsage(userId, todayKey());
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
  await insertRequestLog(userId, modelId, usage, ok);
}

export async function recordUsage(userId: string, usage: MessageUsage, messageCount = 1): Promise<void> {
  await incrementUsage(userId, todayKey(), usage, messageCount);
}

export async function usageSummaryFor(userId: string) {
  const summary = await storeUsageSummaryFor(userId);
  return {
    plan: FREE_PLAN,
    today: summary.today,
    history: summary.history,
  };
}

export async function adminMetrics() {
  return storeAdminMetrics();
}