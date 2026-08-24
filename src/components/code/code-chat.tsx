"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ChevronsUpDown, Server, Sparkles, Square } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useConversation, useCreateConversation } from "@/hooks/use-conversations";
import { useMessages, useModels } from "@/hooks/use-models";
import { Dropdown } from "@/components/ui/overlays";
import { Button, Spinner } from "@/components/ui";
import { Markdown } from "@/components/chat/markdown";
import { ToolActivity } from "@/components/tools/tool-activity";
import { cn } from "@/lib/utils";

/**
 * The coding assistant pane.
 *
 * It reuses the same conversation infrastructure as ordinary chat — same
 * useChat hook, same streaming, same persistence — and adds one thing: the
 * project id travels with every turn, which is what unlocks the file tools
 * server-side. The tools are not opt-in here; opening a project is the consent,
 * and they are unavailable anywhere else.
 *
 * The conversation is created lazily on the first message so merely opening the
 * workspace does not litter the sidebar with empty threads.
 */
export function CodeChat({
  projectId,
  projectName,
  onFilesChanged,
}: {
  projectId: string | undefined;
  projectName?: string;
  /** Fired when a tool reports a write, so the explorer and editor refresh. */
  onFilesChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: modelsData } = useModels();
  const models = useMemo(
    () => (modelsData?.models ?? []).filter((model) => model.capabilities.toolUse),
    [modelsData]
  );

  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const createConversation = useCreateConversation();
  const { data: conversation } = useConversation(conversationId ?? "");
  const { data: messagesData, isLoading: loadingMessages } = useMessages(conversationId);

  const defaultModelId = models.find((model) => model.isDefault)?.id ?? models[0]?.id ?? "";
  const [modelId, setModelId] = useState("");
  const effectiveModelId = modelId || conversation?.conversation?.model || defaultModelId;
  const selectedModel = models.find((model) => model.id === effectiveModelId);

  const [value, setValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = useChat({
    conversationId,
    messages: messagesData?.messages ?? [],
    isLoadingMessages: loadingMessages,
    modelId: effectiveModelId,
    streamingEnabled: true,
    projectId,
  });

  // A new project means a new thread; the previous one belonged elsewhere.
  const previousProject = useRef(projectId);
  useEffect(() => {
    if (previousProject.current !== projectId) {
      previousProject.current = projectId;
      setConversationId(undefined);
    }
  }, [projectId]);

  // Refresh the file tree whenever a turn reports a write, so the editor shows
  // what the assistant actually did rather than a stale copy.
  const lastSeenWrite = useRef<string | undefined>(undefined);
  useEffect(() => {
    const writes = chat.visibleMessages
      .flatMap((message) => message.toolCalls ?? [])
      .filter((call) => call.toolId === "code_write_file" || call.toolId === "code_delete_file");
    const latest = writes[writes.length - 1];
    if (latest && latest.status !== "running" && latest.id !== lastSeenWrite.current) {
      lastSeenWrite.current = latest.id;
      void queryClient.invalidateQueries({ queryKey: ["project-files", projectId] });
      onFilesChanged();
    }
  }, [chat.visibleMessages, projectId, queryClient, onFilesChanged]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.visibleMessages.length, chat.isStreaming]);

  const send = async () => {
    const content = value.trim();
    if (!content || chat.isStreaming) return;
    setValue("");

    if (conversationId) {
      chat.send(content);
      return;
    }
    // First message in this project: make the thread, then send into it.
    try {
      const { conversation: created } = await createConversation.mutateAsync({
        title: projectName ? `Code · ${projectName}` : "Code",
        modelId: effectiveModelId,
        projectId,
      });
      setConversationId(created.id);
      // The hook needs the new id before it can stream, so hand the text back
      // to the composer and let the user's next tick send it.
      setValue(content);
    } catch {
      setValue(content);
    }
  };

  const disabled = !projectId;

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-line bg-surface">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
        <Sparkles className="h-4 w-4 text-accent" aria-hidden />
        <h2 className="flex-1 text-[13px] font-semibold text-fg">Assistant</h2>
        <Dropdown
          align="end"
          className="w-64"
          trigger={({ ref, toggle, "aria-expanded": expanded }) => (
            <button
              ref={ref}
              type="button"
              onClick={toggle}
              aria-expanded={expanded}
              aria-haspopup="listbox"
              aria-label={`Model: ${selectedModel?.name ?? "select a model"}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line px-2 text-xs font-medium text-fg transition-colors hover:bg-elevated"
            >
              <Server className="h-3 w-3 text-muted" aria-hidden />
              <span className="max-w-24 truncate">{selectedModel?.name ?? "Model"}</span>
              <ChevronsUpDown className="h-3 w-3 text-muted" aria-hidden />
            </button>
          )}
        >
          {({ close }) => (
            <div role="listbox" aria-label="Select a model">
              <p className="px-3 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                Models that can use tools
              </p>
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  role="option"
                  aria-selected={model.id === effectiveModelId}
                  onClick={() => {
                    setModelId(model.id);
                    close();
                  }}
                  className={cn(
                    "block w-full rounded-lg px-3 py-2 text-left transition-colors",
                    model.id === effectiveModelId ? "bg-elevated" : "hover:bg-elevated/60"
                  )}
                >
                  <span className="block text-sm font-medium text-fg">{model.name}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted">{model.description}</span>
                </button>
              ))}
            </div>
          )}
        </Dropdown>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {chat.visibleMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <Sparkles className="h-6 w-6 text-muted/40" aria-hidden />
            <p className="text-[13px] font-medium text-fg">Ask about this project</p>
            <p className="max-w-56 text-[11px] leading-relaxed text-muted">
              I can read your files, make changes, and run JavaScript to check the result.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {chat.visibleMessages.map((message) => (
              <div key={message.id}>
                {message.role === "user" ? (
                  <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-tr-md bg-elevated px-3 py-2 text-[13px] text-fg">
                    {message.content}
                  </div>
                ) : (
                  <div className="min-w-0">
                    <ToolActivity calls={message.toolCalls} />
                    {message.content ? (
                      <div className="prose-sm text-[13px]">
                        <Markdown content={message.content} />
                      </div>
                    ) : chat.isStreaming ? (
                      <p className="text-[13px] text-muted">Working…</p>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {chat.error ? <p className="mt-3 text-[12px] text-danger">{chat.error}</p> : null}
        {chat.notice ? <p className="mt-3 text-[12px] text-muted">{chat.notice}</p> : null}
      </div>

      <div className="shrink-0 border-t border-line p-2.5">
        <div className="rounded-xl border border-line bg-elevated focus-within:border-accent/50">
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            disabled={disabled}
            placeholder={disabled ? "Open a project to start" : "Ask for a change, or a question…"}
            aria-label="Message the coding assistant"
            className="block max-h-32 w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-relaxed text-fg placeholder:text-muted/60 focus:outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="pl-1 text-[10px] text-muted/70">Enter to send</span>
            {chat.isStreaming ? (
              <Button size="sm" variant="secondary" onClick={chat.stop} aria-label="Stop generating">
                <Square className="h-3 w-3 fill-current" aria-hidden />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void send()}
                disabled={!value.trim() || disabled || createConversation.isPending}
                aria-label="Send"
                className="rounded-lg p-2"
              >
                {createConversation.isPending ? (
                  <Spinner className="h-3 w-3" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
