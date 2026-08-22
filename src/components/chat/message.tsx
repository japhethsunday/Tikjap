"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDownToLine, Bookmark, BookmarkCheck, Pencil, RefreshCw, StopCircle, ThumbsDown, ThumbsUp } from "lucide-react";
import { Markdown } from "./markdown";
import { CopyButton } from "./copy-button";
import { Avatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/field";
import { api } from "@/lib/api";
import { cn, formatTime } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

function AttachmentList({ message }: { message: ChatMessage }) {
  const attachments = message.attachments ?? [];
  if (!attachments.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((attachment) => (
        <span
          key={attachment.fileId}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted"
        >
          <span className="max-w-40 truncate font-medium text-fg">{attachment.name}</span>
        </span>
      ))}
    </div>
  );
}

function UserMessage({
  message,
  onEdit,
  showTimestamp,
}: {
  message: ChatMessage;
  onEdit: (messageId: string, content: string) => void;
  showTimestamp: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  if (editing) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={Math.min(Math.max(draft.split("\n").length, 2), 8)}
          className="max-w-xl"
          aria-label="Edit message"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(message.content);
            }}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (draft.trim()) onEdit(message.id, draft.trim());
              setEditing(false);
            }}
            disabled={!draft.trim()}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end gap-1.5">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-fg sm:max-w-[70%]">
        <p className="whitespace-pre-wrap">{message.content}</p>
        <AttachmentList message={message} />
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-fg"
          aria-label="Edit and resend message"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        <CopyButton text={message.content} />
        {showTimestamp ? <span className="px-1 text-[11px] text-muted">{formatTime(message.createdAt)}</span> : null}
      </div>
    </div>
  );
}

const LATENCY_MIN_MS = 0;

function AssistantMessage({
  message,
  conversationId,
  onRegenerate,
  onContinue,
  showTimestamp,
}: {
  message: ChatMessage;
  conversationId?: string;
  onRegenerate: (messageId: string) => void;
  onContinue: (messageId: string) => void;
  showTimestamp: boolean;
}) {
  const isStreaming = message.status === "streaming";
  const isError = message.status === "error";
  const isPendingId = message.id.startsWith("assistant-");
  const [bookmarked, setBookmarked] = useState(Boolean(message.bookmarked));
  const [feedback, setFeedback] = useState<1 | -1 | null>(null);
  const latencySeconds =
    message.latencyMs && message.latencyMs > LATENCY_MIN_MS
      ? (message.latencyMs / 1000).toFixed(message.latencyMs < 10_000 ? 2 : 1)
      : null;

  const toggleBookmark = () => {
    if (!conversationId || isPendingId) return;
    const next = !bookmarked;
    setBookmarked(next);
    void api.conversations.setMessageBookmark(conversationId, message.id, next).catch(() => setBookmarked(!next));
  };

  const sendFeedback = (rating: 1 | -1) => {
    if (!conversationId || isPendingId) return;
    const next = feedback === rating ? null : rating;
    setFeedback(next as 1 | -1 | null);
    if (next) {
      let reason = "";
      if (next === -1) reason = window.prompt("What was wrong? (optional)") ?? "";
      void api.conversations.sendMessageFeedback(conversationId, message.id, next, reason).catch(() => undefined);
    }
  };

  return (
    <div className="group flex flex-col items-start gap-1.5">
      <div className="flex items-start gap-3">
        <Avatar name="Tikjap AI" className="mt-1" />
        <div className="min-w-0 max-w-full sm:max-w-[85%]">
          <div className={cn("rounded-2xl rounded-tl-md bg-surface px-4 py-2.5", isError && "border border-danger/25 bg-danger/5")}>
            {isError ? (
              <div className="flex items-start gap-2 text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p className="text-sm">{message.content || "The response failed. You can try again below."}</p>
              </div>
            ) : message.content ? (
              <Markdown content={message.content} />
            ) : (
              <p className="text-muted">Thinking…</p>
            )}
            {isStreaming ? <span className="tk-cursor ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 rounded bg-muted align-middle" aria-hidden /> : null}
          </div>
          <AttachmentList message={message} />
        </div>
      </div>
      {!isStreaming ? (
        <div className="ml-11 flex flex-wrap items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <CopyButton text={message.content} />
          {message.status === "complete" || message.status === "stopped" ? (
            <>
              <button
                type="button"
                onClick={() => onRegenerate(message.id)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-fg"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                Regenerate
              </button>
              {message.status === "complete" ? (
                <button
                  type="button"
                  onClick={() => onContinue(message.id)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface hover:text-fg"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onContinue(message.id)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-surface"
                >
                  <StopCircle className="h-3.5 w-3.5" aria-hidden />
                  Resume
                </button>
              )}
            </>
          ) : null}
          {!isPendingId && conversationId ? (
            <>
              <button
                type="button"
                onClick={toggleBookmark}
                aria-label={bookmarked ? "Remove bookmark" : "Bookmark message"}
                aria-pressed={bookmarked}
                className={cn(
                  "rounded-md p-1.5 transition-colors hover:bg-surface",
                  bookmarked ? "text-accent" : "text-muted hover:text-fg"
                )}
              >
                {bookmarked ? <BookmarkCheck className="h-3.5 w-3.5" aria-hidden /> : <Bookmark className="h-3.5 w-3.5" aria-hidden />}
              </button>
              <button
                type="button"
                onClick={() => sendFeedback(1)}
                aria-label="Good response"
                aria-pressed={feedback === 1}
                className={cn(
                  "rounded-md p-1.5 transition-colors hover:bg-surface",
                  feedback === 1 ? "text-success" : "text-muted hover:text-fg"
                )}
              >
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => sendFeedback(-1)}
                aria-label="Bad response"
                aria-pressed={feedback === -1}
                className={cn(
                  "rounded-md p-1.5 transition-colors hover:bg-surface",
                  feedback === -1 ? "text-danger" : "text-muted hover:text-fg"
                )}
              >
                <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
              </button>
            </>
          ) : null}
          {latencySeconds ? (
            <span className="px-1 text-[11px] tabular-nums text-muted" title={`${message.latencyMs} ms`}>
              {latencySeconds}s
            </span>
          ) : null}
          {showTimestamp ? <span className="px-1 text-[11px] text-muted">{formatTime(message.createdAt)}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function MessageItem({
  message,
  conversationId,
  onRegenerate,
  onContinue,
  onEdit,
  showTimestamp,
}: {
  message: ChatMessage;
  conversationId?: string;
  onRegenerate: (messageId: string) => void;
  onContinue: (messageId: string) => void;
  onEdit: (messageId: string, content: string) => void;
  showTimestamp: boolean;
}) {
  if (message.role === "user") {
    return <UserMessage message={message} onEdit={onEdit} showTimestamp={showTimestamp} />;
  }
  return (
    <AssistantMessage
      message={message}
      conversationId={conversationId}
      onRegenerate={onRegenerate}
      onContinue={onContinue}
      showTimestamp={showTimestamp}
    />
  );
}
