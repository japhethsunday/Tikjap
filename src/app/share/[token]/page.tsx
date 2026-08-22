"use client";

import { use, useState } from "react";
import { Lock } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { Markdown } from "@/components/chat/markdown";
import type { SharedConversation } from "@/lib/types";

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<SharedConversation>();
  const [error, setError] = useState<string>();
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async (pass?: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pass }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 401) setNeedsPassword(true);
        throw new Error(body?.error?.message ?? "This link is not available.");
      }
      setData(body as SharedConversation);
      setNeedsPassword(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-bold text-white">T</span>
        <span className="text-sm font-semibold text-fg">Tikjap AI · shared conversation</span>
      </header>

      {!data && needsPassword ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void load(password);
          }}
          className="space-y-3 rounded-2xl border border-line p-6"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-fg">
            <Lock className="h-4 w-4" aria-hidden />
            This conversation is password protected
          </p>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoFocus
            aria-label="Share password"
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" disabled={!password || loading}>
            {loading ? "Checking…" : "View conversation"}
          </Button>
        </form>
      ) : null}

      {!data && !needsPassword ? (
        <div className="space-y-3">
          {error ? <p className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</p> : null}
          {!error ? (
            <Button onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Load shared conversation"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {data ? (
        <>
          <h1 className="mb-6 text-xl font-semibold text-fg">{data.title}</h1>
          <div className="space-y-6">
            {data.messages.map((message, index) => (
              <article key={index} className={message.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-[15px] text-primary-fg"
                      : "rounded-2xl bg-surface px-4 py-2.5"
                  }
                >
                  {message.role === "user" ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <Markdown content={message.content} />
                  )}
                </div>
              </article>
            ))}
          </div>
          <footer className="mt-12 border-t border-line pt-4 text-xs text-muted">
            Read-only shared view · powered by Tikjap AI
          </footer>
        </>
      ) : null}
    </main>
  );
}
