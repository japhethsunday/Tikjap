"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

export default function BookmarksPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["bookmarks"],
    queryFn: () => api.conversations.bookmarks(),
  });
  const bookmarks = data?.bookmarks ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-fg">
          <Bookmark className="h-5 w-5 text-accent" aria-hidden />
          Bookmarked messages
        </h1>
        <p className="mt-0.5 text-sm text-muted">Starred replies from any conversation.</p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : bookmarks.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted">No bookmarks yet — tap the star under any reply to save it here.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {bookmarks.map((hit) => (
            <li key={hit.messageId}>
              <Link
                href={`/chat/${hit.conversationId}`}
                className="block rounded-2xl border border-line p-4 transition-colors hover:bg-surface"
              >
                <p className="flex items-center justify-between gap-3 text-xs text-muted">
                  <span className="truncate font-medium text-fg">{hit.conversationTitle}</span>
                  <span className="shrink-0">{timeAgo(hit.createdAt)}</span>
                </p>
                <p className="mt-1.5 line-clamp-3 text-sm text-muted">{hit.snippet}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
