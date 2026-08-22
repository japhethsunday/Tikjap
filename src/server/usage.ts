import {
  adminMetrics as storeAdminMetrics,
  fileUsageFor as storeFileUsage,
  getProfilePlan,
  getTodayUsage as storeGetTodayUsage,
  incrementUsage,
  insertRequestLog,
  todayKey,
  usageSummaryFor as storeUsageSummaryFor,
  type PlanId,
} from "./store";
import type { MessageUsage } from "@/lib/types";

export interface PlanLimits {
  id: PlanId;
  name: string;
  maxMessagesPerDay: number;
  maxTokensPerDay: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: { id: "free", name: "Free", maxMessagesPerDay: 100, maxTokensPerDay: 500_000 },
  pro: { id: "pro", name: "Pro", maxMessagesPerDay: 1_000, maxTokensPerDay: 5_000_000 },
  team: { id: "team", name: "Team", maxMessagesPerDay: 5_000, maxTokensPerDay: 25_000_000 },
};

export async function getPlanLimits(userId: string): Promise<PlanLimits> {
  return PLAN_LIMITS[await getProfilePlan(userId)];
}

export async function getTodayUsage(userId: string): Promise<{ messages: number; tokens: number }> {
  return storeGetTodayUsage(userId, todayKey());
}

export async function assertWithinLimits(userId: string): Promise<void> {
  const [limits, { messages, tokens }] = await Promise.all([getPlanLimits(userId), getTodayUsage(userId)]);
  if (messages >= limits.maxMessagesPerDay) {
    throw new Error("rate_limit:messages");
  }
  if (tokens >= limits.maxTokensPerDay) {
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
  const [limits, summary] = await Promise.all([getPlanLimits(userId), storeUsageSummaryFor(userId)]);
  return {
    plan: limits,
    today: summary.today,
    history: summary.history,
  };
}

export async function adminMetrics() {
  return storeAdminMetrics();
}

export interface StorageUsage {
  usedBytes: number;
  capBytes: number;
  fileCount: number;
}

const STORAGE_CAPS: Record<PlanId, number> = {
  free: 50 * 1024 * 1024,
  pro: 2 * 1024 * 1024 * 1024,
  team: 20 * 1024 * 1024 * 1024,
};

export async function storageUsageFor(userId: string): Promise<StorageUsage> {
  const [plan, used] = await Promise.all([getProfilePlan(userId), storeFileUsage(userId)]);
  return {
    usedBytes: used.bytes,
    capBytes: STORAGE_CAPS[plan],
    fileCount: used.count,
  };
}
