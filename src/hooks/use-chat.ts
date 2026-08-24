"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { readSseEvents } from "@/lib/api/stream";
import { errorMessage } from "@/lib/api";
import type { ChatMessage, ContextStats, MessageStatus, StreamChunk } from "@/lib/types";

function localId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Chronological order: oldest first. Ties (same-millisecond timestamps from
 * optimistic inserts) fall back to role order — a user message always sorts
 * before the assistant reply it triggered — then stable insertion order.
 */
function compareMessages(a: ChatMessage, b: ChatMessage): number {
  const byTime = a.createdAt.localeCompare(b.createdAt);
  if (byTime !== 0) return byTime;
  const rank = (message: ChatMessage) => (message.role === "assistant" ? 1 : 0);
  return rank(a) - rank(b);
}

function mergeMessages(server: ChatMessage[], pending: ChatMessage[], hidden: Set<string>): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of server) byId.set(message.id, message);
  for (const message of pending) byId.set(message.id, message); // pending wins
  return Array.from(byId.values())
    .filter((m) => !hidden.has(m.id))
    .sort(compareMessages);
}

export interface UseChatOptions {
  conversationId?: string;
  messages: ChatMessage[];
  isLoadingMessages: boolean;
  modelId: string;
  streamingEnabled: boolean;
  assistantId?: string;
  /** Tool ids currently switched on in the composer. */
  enabledTools?: string[];
}

interface StreamRequest {
  content: string;
  attachmentIds: string[];
  regenerateMessageId?: string;
  removeFromMessageId?: string;
  continueFromMessageId?: string;
  /** Explicit model override — used when a queued send must keep the model picked before navigation. */
  modelId?: string;
}

export interface UseChatResult {
  visibleMessages: ChatMessage[];
  status: "idle" | "streaming" | "error";
  error?: string;
  isStreaming: boolean;
  contextStats?: ContextStats;
  notice?: string;
  dismissNotice: () => void;
  send: (content: string, attachmentIds?: string[], options?: { modelId?: string }) => void;
  regenerate: (assistantMessageId: string) => void;
  continueMessage: (assistantMessageId: string) => void;
  editAndResend: (userMessageId: string, content: string) => void;
  retryLast: () => void;
  stop: () => void;
}

export function useChat({
  conversationId,
  messages,
  modelId,
  streamingEnabled,
  assistantId,
  enabledTools,
}: UseChatOptions): UseChatResult {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [error, setError] = useState<string>();
  const [contextStats, setContextStats] = useState<ContextStats>();
  const [notice, setNotice] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const lastRequestRef = useRef<{ content: string; attachmentIds: string[]; conversationId: string } | null>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const [lastConversation, setLastConversation] = useState(conversationId);
  if (conversationId !== lastConversation) {
    // Adjust state during render when switching conversations (React-documented pattern).
    setLastConversation(conversationId);
    setPending([]);
    setHidden(new Set());
    setContextStats(undefined);
    setNotice(undefined);
  }

  const visibleMessages = useMemo(
    () => mergeMessages(messages, pending, hidden),
    [messages, pending, hidden]
  );

  const invalidate = useCallback(() => {
    if (conversationId) {
      void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  }, [conversationId, queryClient]);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(undefined), 6000);
  }, []);

  const dismissNotice = useCallback(() => setNotice(undefined), []);

  const runStream = useCallback(
    async (request: StreamRequest) => {
      if (!conversationId) return;
      const requestModelId = request.modelId ?? modelId;
      const controller = new AbortController();
      abortRef.current = controller;
      setError(undefined);
      setStatus("streaming");

      const continuing = Boolean(request.continueFromMessageId);
      let streamAssistantId = localId("assistant");
      // Monotonic client timestamps: the assistant placeholder must always sort
      // strictly after the user message it responds to, even within the same ms.
      const nowMs = Date.now();

      let seedContent = "";
      if (continuing) {
        streamAssistantId = request.continueFromMessageId!;
        const target = [...pending, ...messages].find((m) => m.id === streamAssistantId);
        seedContent = target?.content ?? "";
      }

      const assistantMessage: ChatMessage = {
        id: streamAssistantId,
        conversationId,
        role: "assistant",
        content: seedContent,
        status: "streaming",
        model: requestModelId,
        createdAt: new Date(nowMs + 1).toISOString(),
      };

      if (request.regenerateMessageId) {
        setHidden((current) => new Set(current).add(request.regenerateMessageId!));
      }
      if (request.removeFromMessageId) {
        setHidden((current) => {
          const next = new Set(current);
          next.add(request.removeFromMessageId!);
          return next;
        });
      }
      // Do NOT create optimistic user message — server inserts it.
      // Only the assistant message is created optimistically for streaming.
      setPending((current) => {
        const withoutStreamTarget = current.filter((m) => m.id !== streamAssistantId);
        return [...withoutStreamTarget, assistantMessage];
      });

      let accumulated = seedContent;
      const optimisticAssistantId = assistantMessage.id;
      try {
        const { reader } = await api.messages.start(
          conversationId,
          {
            content: request.content,
            modelId: requestModelId,
            attachments: request.attachmentIds.length ? request.attachmentIds : undefined,
            regenerate: Boolean(request.regenerateMessageId),
            regenerateMessageId: request.regenerateMessageId,
            continue: continuing,
            continueMessageId: request.continueFromMessageId,
            removeFromMessageId: request.removeFromMessageId,
            assistantId,
            enabledTools: enabledTools?.length ? enabledTools : undefined,
          },
          { signal: controller.signal }
        );

        for await (const chunk of readSseEvents(reader, controller.signal)) {
          handleChunk(chunk);
        }

        if (controller.signal.aborted) {
          setPending((current) =>
            current
              .filter((m) => m.id !== optimisticAssistantId)
              .map((m) => (m.id === streamAssistantId ? { ...m, status: "stopped", content: accumulated } : m))
          );
          setStatus("idle");
        } else {
          setPending((current) =>
            current
              .filter((m) => m.id !== optimisticAssistantId)
              .map((m) =>
                m.id === streamAssistantId
                  ? { ...m, status: (accumulated ? "complete" : "error") as MessageStatus, content: accumulated }
                  : m
              )
          );
          setStatus("idle");
          invalidate();
        }
      } catch (streamError) {
        if (controller.signal.aborted) {
          setPending((current) =>
            current
              .filter((m) => m.id !== optimisticAssistantId)
              .map((m) => (m.id === streamAssistantId ? { ...m, status: "stopped", content: accumulated } : m))
          );
          setStatus("idle");
        } else {
          const message = errorMessage(streamError);
          setPending((current) =>
            current
              .filter((m) => m.id !== optimisticAssistantId)
              .map((m) => (m.id === streamAssistantId ? { ...m, status: "error", content: accumulated } : m))
          );
          setError(message);
          setStatus("error");
        }
        invalidate();
      } finally {
        abortRef.current = null;
      }

      function handleChunk(chunk: StreamChunk) {
        if (chunk.type === "delta") {
          accumulated += chunk.content ?? "";
          if (streamingEnabled) {
            setPending((current) =>
              current.map((m) => (m.id === streamAssistantId ? { ...m, content: accumulated } : m))
            );
          }
        } else if (chunk.type === "usage" && chunk.usage) {
          setPending((current) =>
            current.map((m) => (m.id === streamAssistantId ? { ...m, usage: chunk.usage } : m))
          );
        } else if (chunk.type === "tool" && chunk.tool) {
          const event = chunk.tool;
          setPending((current) =>
            current.map((m) => {
              if (m.id !== streamAssistantId) return m;
              const existing = m.toolCalls ?? [];
              const index = existing.findIndex((call) => call.id === event.id);
              if (index === -1) return { ...m, toolCalls: [...existing, event] };
              // Progress events carry no toolId; merge so the label survives.
              const merged = { ...existing[index], ...event, toolId: event.toolId || existing[index].toolId };
              const next = [...existing];
              next[index] = merged;
              return { ...m, toolCalls: next };
            })
          );
        } else if (chunk.type === "context" && chunk.context) {
          setContextStats(chunk.context);
        } else if (chunk.type === "notice" && chunk.notice) {
          showNotice(chunk.notice);
        } else if (chunk.type === "done") {
          const finalStatus: MessageStatus = chunk.status ?? "complete";
          setPending((current) =>
            current
              .filter((m) => m.id !== optimisticAssistantId)
              .map((m) =>
                m.id === streamAssistantId
                  ? { ...m, status: finalStatus, content: accumulated, latencyMs: chunk.latencyMs ?? m.latencyMs }
                  : m
              )
          );
          setStatus("idle");
          invalidate();
        } else if (chunk.type === "error") {
          setPending((current) =>
            current
              .filter((m) => m.id !== optimisticAssistantId)
              .map((m) => (m.id === streamAssistantId ? { ...m, status: "error" } : m))
          );
          setError(chunk.error ?? "Something went wrong.");
          setStatus("error");
        }
      }
    },
    [
      conversationId,
      modelId,
      streamingEnabled,
      assistantId,
      enabledTools,
      invalidate,
      showNotice,
      pending,
      messages,
    ]
  );

  const send = useCallback(
    (content: string, attachmentIds: string[] = [], options: { modelId?: string } = {}) => {
      if (!conversationId) return;
      if (!content.trim() && !attachmentIds.length) return;
      const trimmed = content.trim();
      lastRequestRef.current = { content: trimmed, attachmentIds, conversationId };
      void runStream({ content: trimmed, attachmentIds, modelId: options.modelId });
    },
    [conversationId, runStream]
  );

  const regenerate = useCallback(
    (assistantMessageId: string) => {
      const target = visibleMessages.find((m) => m.id === assistantMessageId);
      if (!target) return;
      const preceding = [...visibleMessages]
        .reverse()
        .find((m) => m.role === "user");
      const content = preceding?.content ?? "";
      const attachmentIds = (preceding?.attachments ?? []).map((a) => a.fileId).filter(Boolean);
      lastRequestRef.current = { content, attachmentIds, conversationId: conversationId ?? "" };
      void runStream({ content, attachmentIds, regenerateMessageId: assistantMessageId });
    },
    [visibleMessages, conversationId, runStream]
  );

  const continueMessage = useCallback(
    (assistantMessageId: string) => {
      if (!conversationId) return;
      void runStream({ content: "", attachmentIds: [], continueFromMessageId: assistantMessageId });
    },
    [conversationId, runStream]
  );

  const retryLast = useCallback(() => {
    const last = lastRequestRef.current;
    if (!last || !conversationId) return;
    void runStream({ content: last.content, attachmentIds: last.attachmentIds });
  }, [conversationId, runStream]);

  const editAndResend = useCallback(
    (userMessageId: string, content: string) => {
      const target = visibleMessages.find((m) => m.id === userMessageId && m.role === "user");
      if (!target) return;
      const attachmentIds = (target.attachments ?? []).map((a) => a.fileId).filter(Boolean);
      setHidden((current) => {
        const next = new Set(current);
        const targetIndex = visibleMessages.findIndex((m) => m.id === userMessageId);
        visibleMessages.slice(targetIndex).forEach((m) => next.add(m.id));
        return next;
      });
      lastRequestRef.current = { content, attachmentIds, conversationId: conversationId ?? "" };
      void runStream({ content, attachmentIds, removeFromMessageId: userMessageId });
    },
    [visibleMessages, conversationId, runStream]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    if (conversationId) {
      void api.conversations.stopGeneration(conversationId).catch(() => undefined);
    }
  }, [conversationId]);

  const isStreaming = status === "streaming";

  return {
    visibleMessages,
    status,
    error,
    isStreaming,
    contextStats,
    notice,
    dismissNotice,
    send,
    regenerate,
    continueMessage,
    editAndResend,
    retryLast,
    stop,
  };
}
