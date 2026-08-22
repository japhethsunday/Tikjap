"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { readSseEvents } from "@/lib/api/stream";
import { errorMessage } from "@/lib/api";
import type { AttachmentRef, ChatMessage, ContextStats, MessageStatus, StreamChunk } from "@/lib/types";

function localId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mergeMessages(server: ChatMessage[], pending: ChatMessage[], hidden: Set<string>): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of server) byId.set(message.id, message);
  for (const message of pending) byId.set(message.id, message); // pending wins
  const merged = Array.from(byId.values()).filter((m) => !hidden.has(m.id));
  return merged.sort((a, b) => {
    const time = a.createdAt.localeCompare(b.createdAt);
    return time !== 0 ? time : a.id.localeCompare(b.id);
  });
}

export interface UseChatOptions {
  conversationId?: string;
  messages: ChatMessage[];
  isLoadingMessages: boolean;
  modelId: string;
  streamingEnabled: boolean;
  assistantId?: string;
}

interface StreamRequest {
  content: string;
  attachmentIds: string[];
  regenerateMessageId?: string;
  removeFromMessageId?: string;
  continueFromMessageId?: string;
}

export interface UseChatResult {
  visibleMessages: ChatMessage[];
  status: "idle" | "streaming" | "error";
  error?: string;
  isStreaming: boolean;
  contextStats?: ContextStats;
  notice?: string;
  dismissNotice: () => void;
  send: (content: string, attachmentIds?: string[]) => void;
  regenerate: (assistantMessageId: string) => void;
  continueMessage: (assistantMessageId: string) => void;
  editAndResend: (userMessageId: string, content: string) => void;
  retryLast: () => void;
  stop: () => void;
}

export function useChat({ conversationId, messages, modelId, streamingEnabled, assistantId }: UseChatOptions): UseChatResult {
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
      const controller = new AbortController();
      abortRef.current = controller;
      setError(undefined);
      setStatus("streaming");

      const continuing = Boolean(request.continueFromMessageId);
      let streamAssistantId = localId("assistant");

      const userMessage: ChatMessage | null =
        request.regenerateMessageId || continuing
          ? null
          : {
              id: localId("user"),
              conversationId,
              role: "user",
              content: request.content,
              status: "complete",
              model: modelId,
              attachments: request.attachmentIds.length
                ? (request.attachmentIds.map((id) => ({ fileId: id, name: "", size: 0, mimeType: "" }) as AttachmentRef) as AttachmentRef[])
                : undefined,
              createdAt: new Date().toISOString(),
            };

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
        model: modelId,
        createdAt: new Date().toISOString(),
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
      if (userMessage) {
        setPending((current) => [...current, userMessage]);
      }
      setPending((current) => {
        const withoutStreamTarget = current.filter((m) => m.id !== streamAssistantId);
        return [...withoutStreamTarget, assistantMessage];
      });

      let accumulated = seedContent;
      try {
        const { reader } = await api.messages.start(
          conversationId,
          {
            content: request.content,
            modelId,
            attachments: request.attachmentIds.length ? request.attachmentIds : undefined,
            regenerate: Boolean(request.regenerateMessageId),
            regenerateMessageId: request.regenerateMessageId,
            continue: continuing,
            continueMessageId: request.continueFromMessageId,
            removeFromMessageId: request.removeFromMessageId,
            assistantId,
          },
          { signal: controller.signal }
        );

        for await (const chunk of readSseEvents(reader, controller.signal)) {
          handleChunk(chunk);
        }

        if (controller.signal.aborted) {
          setPending((current) =>
            current.map((m) => (m.id === streamAssistantId ? { ...m, status: "stopped", content: accumulated } : m))
          );
          setStatus("idle");
        } else {
          setPending((current) =>
            current.map((m) =>
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
          // User stopped generation; finalize as stopped.
          setPending((current) =>
            current.map((m) => (m.id === streamAssistantId ? { ...m, status: "stopped", content: accumulated } : m))
          );
        } else {
          const message = errorMessage(streamError);
          setPending((current) =>
            current.map((m) => (m.id === streamAssistantId ? { ...m, status: "error", content: accumulated } : m))
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
        } else if (chunk.type === "context" && chunk.context) {
          setContextStats(chunk.context);
        } else if (chunk.type === "notice" && chunk.notice) {
          showNotice(chunk.notice);
        } else if (chunk.type === "done") {
          const finalStatus: MessageStatus = chunk.status ?? "complete";
          setPending((current) =>
            current.map((m) =>
              m.id === streamAssistantId
                ? { ...m, status: finalStatus, content: accumulated, latencyMs: chunk.latencyMs ?? m.latencyMs }
                : m
            )
          );
          setStatus("idle");
          invalidate();
        } else if (chunk.type === "error") {
          setPending((current) =>
            current.map((m) => (m.id === streamAssistantId ? { ...m, status: "error" } : m))
          );
          setError(chunk.error ?? "Something went wrong.");
          setStatus("error");
        }
      }
    },
    [conversationId, modelId, streamingEnabled, assistantId, invalidate, showNotice, pending, messages]
  );

  const send = useCallback(
    (content: string, attachmentIds: string[] = []) => {
      if (!conversationId) return;
      if (!content.trim() && !attachmentIds.length) return;
      const trimmed = content.trim();
      lastRequestRef.current = { content: trimmed, attachmentIds, conversationId };
      void runStream({ content: trimmed, attachmentIds });
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
  }, []);

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
