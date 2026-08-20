"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Skeleton, Badge } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default function UsagePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["usage"],
    queryFn: () => api.usage.me(),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-6 text-sm text-danger">
        Could not load usage data. Please try again.
      </Card>
    );
  }

  const { usage } = data;
  const messagePercent = Math.min(100, Math.round((usage.today.messages / usage.plan.maxMessagesPerDay) * 100));
  const tokenPercent = Math.min(100, Math.round((usage.today.tokens / usage.plan.maxTokensPerDay) * 100));

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-fg">{usage.plan.name} plan</h2>
            <p className="text-sm text-muted">Today&apos;s usage resets at midnight.</p>
          </div>
          <Badge variant="accent">{usage.plan.name}</Badge>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <StatCard label="Messages today" value={`${usage.today.messages}`} sub={`of ${usage.plan.maxMessagesPerDay}`} percent={messagePercent} />
          <StatCard label="Tokens today" value={usage.today.tokens.toLocaleString()} sub={`of ${usage.plan.maxTokensPerDay.toLocaleString()}`} percent={tokenPercent} />
          <StatCard label="This conversation" value={(usage.today.inputTokens + usage.today.outputTokens).toLocaleString()} sub="input + output" />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-fg">Usage history</h2>
        {usage.history.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No usage recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Day</th>
                  <th className="py-2 pr-4 font-medium">Messages</th>
                  <th className="py-2 font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {usage.history.map((day) => (
                  <tr key={day.date} className="border-b border-line/50 last:border-0">
                    <td className="py-2.5 pr-4 text-fg">{formatDate(day.date)}</td>
                    <td className="py-2.5 pr-4 text-muted">{day.messages}</td>
                    <td className="py-2.5 text-muted">{day.tokens.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, sub, percent }: { label: string; value: string; sub?: string; percent?: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-fg">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
      {percent !== undefined ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </div>
  );
}