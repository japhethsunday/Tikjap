"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Skeleton, Badge } from "@/components/ui";
import { formatBytes } from "@/lib/utils";
import type { AdminStats } from "@/lib/types";

export default function AdminDashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api.admin.stats(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-56" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-6">
        <p className="text-sm text-danger">You don&apos;t have access to admin data, or it could not be loaded.</p>
        <button type="button" onClick={() => refetch()} className="mt-3 text-sm font-medium text-accent hover:underline">
          Try again
        </button>
      </Card>
    );
  }

  const stats: AdminStats = data.stats;
  const failureRate = stats.aiRequests > 0 ? (stats.failedRequests / stats.aiRequests) * 100 : 0;
  const modelTotal = stats.models.reduce((sum, m) => sum + m.requests, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">Admin dashboard</h1>
          <p className="text-sm text-muted">Platform-wide metrics from the demo backend.</p>
        </div>
        <Badge variant={stats.status === "operational" ? "success" : "danger"}>{stats.status}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Users" value={stats.totalUsers.toLocaleString()} sub={`${stats.activeUsers30d} active (30d)`} />
        <Metric label="Conversations" value={stats.totalConversations.toLocaleString()} />
        <Metric label="Messages" value={stats.totalMessages.toLocaleString()} />
        <Metric label="Storage" value={formatBytes(stats.storageBytes)} />
        <Metric label="AI requests" value={stats.aiRequests.toLocaleString()} />
        <Metric label="Tokens consumed" value={stats.tokensConsumed.toLocaleString()} />
        <Metric label="Failed requests" value={stats.failedRequests.toLocaleString()} sub={`${failureRate.toFixed(1)}% failure rate`} />
        <Metric label="Unique models" value={String(stats.models.length)} />
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-fg">Usage by model</h2>
        {stats.models.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No model usage recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Model</th>
                  <th className="py-2 pr-4 font-medium">Requests</th>
                  <th className="py-2 pr-4 font-medium">Share</th>
                  <th className="py-2 font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {stats.models.map((model) => {
                  const share = modelTotal > 0 ? (model.requests / modelTotal) * 100 : 0;
                  return (
                    <tr key={model.modelId} className="border-b border-line/50 last:border-0">
                      <td className="py-2.5 pr-4 font-mono text-fg">{model.modelId}</td>
                      <td className="py-2.5 pr-4 text-muted">{model.requests.toLocaleString()}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line" aria-hidden>
                            <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                          </div>
                          <span className="text-xs text-muted">{share.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-muted">{model.tokens.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-fg">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
    </Card>
  );
}