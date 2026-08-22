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
  const nearLimit = messagePercent >= 80 || tokenPercent >= 80;

  return (
    <div className="space-y-6">
      {nearLimit ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <p className="text-fg">
            You&apos;ve used {messagePercent}% of daily messages and {tokenPercent}% of tokens. Consider upgrading to keep going.
          </p>
          <a href="/pricing" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg hover:opacity-90">
            View plans
          </a>
        </div>
      ) : null}

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

      <UsageChart history={usage.history} />

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

function UsageChart({
  history,
}: {
  history: Array<{ date: string; messages: number; tokens: number }>;
}) {
  const days = history.slice(-14);
  if (days.length < 2) return null;
  const maxMessages = Math.max(...days.map((day) => day.messages), 1);
  const width = 560;
  const height = 120;
  const stepX = width / (days.length - 1);
  const points = days.map((day, index) => {
    const x = index * stepX;
    const y = height - (day.messages / maxMessages) * (height - 12) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-fg">Last 14 days</h2>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 h-32 w-full"
        role="img"
        aria-label={`Messages per day over the last ${days.length} days, peaking at ${maxMessages}`}
      >
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {days.map((day, index) => {
          const x = index * stepX;
          const y = height - (day.messages / maxMessages) * (height - 12) - 4;
          return <circle key={day.date} cx={x} cy={y} r="3" fill="var(--accent)" />;
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{formatDate(days[0].date)}</span>
        <span>{formatDate(days[days.length - 1].date)}</span>
      </div>
    </Card>
  );
}