"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  Bot,
  Columns3,
  Download,
  Link2,
  Menu,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Printer,
  Trash2,
} from "lucide-react";
import {
  useConversation,
  useCreateConversation,
  useDeleteConversation,
  useRenameConversation,
  useUpdateConversation,
  toErrorMessage,
} from "@/hooks/use-conversations";
import { useModels, useMessages, useAiPreferences } from "@/hooks/use-models";
import { useAssistants } from "@/hooks/use-platform";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/components/providers/auth";
import { useToast } from "@/components/providers/toast";
import { api } from "@/lib/api";
import type { ComparisonResult } from "@/lib/types";
import { ModelSelect } from "./model-select";
import { Composer } from "./composer";
import { MessageItem } from "./message";
import { ChatEmptyState } from "./empty-state";
import { Dropdown, DropdownItem, Dialog } from "@/components/ui/overlays";
import { Button, Input, Skeleton } from "@/components/ui";

let outbox: { text: string; attachmentIds: string[] } | null = null;

export function ChatView({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const { showTimestamps } = useShowTimestamps();
  const { data: modelsData } = useModels();
  const { data: preferences } = useAiPreferences();
  const { data: conversation } = useConversation(conversationId ?? "");
  const { data: messagesData, isLoading: isLoadingMessages } = useMessages(conversationId);
  const createConversation = useCreateConversation();
  const deleteConversation = useDeleteConversation();
  const renameConversation = useRenameConversation();
  const updateConversation = useUpdateConversation();
  const { data: assistantsData } = useAssistants();
  const assistants = assistantsData?.assistants ?? [];

  const models = modelsData?.models ?? [];
  const defaultModelId = preferences?.preferences.defaultModelId ?? models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? "";
  const [modelId, setModelId] = useState(defaultModelId);
  const effectiveModelId = modelId || defaultModelId;
  const [assistantId, setAssistantId] = useState<string | undefined>(undefined);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const selectedModel = models.find((m) => m.id === effectiveModelId);
  const allowImages = Boolean(selectedModel?.capabilities.vision);

  const chat = useChat({
    conversationId,
    messages: messagesData?.messages ?? [],
    isLoadingMessages,
    modelId: effectiveModelId,
    streamingEnabled: preferences?.preferences.streamingEnabled ?? true,
    assistantId,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    nearBottomRef.current = true;
    setShowJumpToLatest(false);
  };

  useEffect(() => {
    if (nearBottomRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [chat.visibleMessages, chat.isStreaming]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = distance < 120;
    setShowJumpToLatest(distance >= 240);
  };

  const handleSend = async (content: string, attachmentIds: string[]) => {
    if (!conversationId) {
      try {
        const { conversation: created } = await createConversation.mutateAsync({ modelId: effectiveModelId });
        router.replace(`/chat/${created.id}`);
        outbox = { text: content, attachmentIds };
      } catch (error) {
        toast({ kind: "error", title: "Could not start a conversation", description: toErrorMessage(error) });
      }
      return;
    }
    chat.send(content, attachmentIds);
  };

  useEffect(() => {
    if (conversationId && outbox) {
      const { text, attachmentIds } = outbox;
      outbox = null;
      chat.send(text, attachmentIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const comparePrompt =
    [...chat.visibleMessages].reverse().find((m) => m.role === "user")?.content ?? "";

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
        <button
          type="button"
          onClick={() => router.push("/chat")}
          aria-label="Open conversations list"
          className="rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-fg lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{conversation?.conversation?.title ?? "New chat"}</p>
          {chat.contextStats ? (
            <p className="truncate text-[11px] text-muted">
              context · {chat.contextStats.messages} messages · {chat.contextStats.memories} memories ·{" "}
              {chat.contextStats.sources} sources · ~{chat.contextStats.estimatedTokens.toLocaleString()} tokens
            </p>
          ) : null}
        </div>
        <ModelSelect models={models} value={effectiveModelId} onChange={setModelId} loading={modelsData === undefined} />
        {assistants.length > 0 ? (
          <Dropdown
            trigger={({ ref, toggle, "aria-expanded": expanded }) => (
              <button
                ref={ref}
                type="button"
                aria-expanded={expanded}
                aria-label="Select assistant"
                onClick={toggle}
                className={
                  assistantId
                    ? "rounded-lg p-2 text-accent transition-colors hover:bg-surface"
                    : "rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-fg"
                }
              >
                <Bot className="h-5 w-5" aria-hidden />
              </button>
            )}
          >
            {({ close }) => (
              <>
                <DropdownItem
                  onSelect={() => {
                    setAssistantId(undefined);
                    close();
                  }}
                >
                  No assistant
                </DropdownItem>
                {assistants.map((assistant) => (
                  <DropdownItem
                    key={assistant.id}
                    onSelect={() => {
                      setAssistantId(assistant.id);
                      close();
                    }}
                  >
                    {assistant.name}
                  </DropdownItem>
                ))}
              </>
            )}
          </Dropdown>
        ) : null}
        {conversationId && conversation ? (
          <>
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              aria-label="Compare models on last message"
              title="Compare models"
              className="hidden rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-fg sm:block"
            >
              <Columns3 className="h-5 w-5" aria-hidden />
            </button>
            <ConversationMenu
              conversation={conversation.conversation}
              onRename={() => {
                setRenameValue(conversation.conversation.title);
                setRenameOpen(true);
              }}
              onDelete={handleDelete}
              onTogglePin={() =>
                updateConversation.mutate(
                  { id: conversationId, pinned: !conversation.conversation.pinned },
                  {
                    onError: (error) => toast({ kind: "error", title: "Could not update conversation", description: toErrorMessage(error) }),
                  }
                )
              }
              onToggleArchive={() =>
                updateConversation.mutate(
                  { id: conversationId, archived: !conversation.conversation.archived },
                  {
                    onSuccess: () => {
                      if (!conversation.conversation.archived) router.replace("/chat");
                    },
                    onError: (error) => toast({ kind: "error", title: "Could not update conversation", description: toErrorMessage(error) }),
                  }
                )
              }
              onExport={() => handleExport(conversation.conversation.title, chat.visibleMessages)}
              onShare={() => setShareOpen(true)}
              onCompare={() => setCompareOpen(true)}
              onPrint={() => window.print()}
            />
          </>
        ) : null}
      </header>

      {chat.notice ? (
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2 text-xs text-muted">
          <span>{chat.notice}</span>
          <button type="button" onClick={chat.dismissNotice} className="shrink-0 font-medium text-fg hover:underline">
            Dismiss
          </button>
        </div>
      ) : null}

      <div ref={scrollRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto">
        {isLoadingMessages ? (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
            <Skeleton className="h-16 w-2/3" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="ml-auto h-16 w-1/2" />
          </div>
        ) : chat.visibleMessages.length === 0 && !chat.isStreaming ? (
          <ChatEmptyState onPick={(prompt) => void handleSend(prompt, [])} />
        ) : (
          <>
            <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6">
              {chat.visibleMessages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  conversationId={conversationId}
                  onRegenerate={chat.regenerate}
                  onContinue={chat.continueMessage}
                  onEdit={chat.editAndResend}
                  onRetry={chat.retryLast}
                  showTimestamp={showTimestamps}
                />
              ))}
              {chat.error && !chat.isStreaming ? (
                <div className="flex justify-center">
                  <Button variant="secondary" size="sm" onClick={chat.retryLast}>
                    Retry last message
                  </Button>
                </div>
              ) : null}
            </div>
            {showJumpToLatest ? (
              <button
                type="button"
                onClick={() => scrollToBottom()}
                className="sticky bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-canvas px-3.5 py-1.5 text-xs font-medium text-fg shadow-lg transition-colors hover:bg-surface"
              >
                <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                Scroll to latest
              </button>
            ) : null}
          </>
        )}
      </div>

      <Composer
        onSend={handleSend}
        onStop={chat.stop}
        isStreaming={chat.isStreaming}
        disabled={!user}
        disabledReason={user ? undefined : "Sign in to start chatting"}
        allowImages={allowImages}
      />

      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename conversation"
        description="Give this conversation a clearer name."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (renameValue.trim() && conversationId) {
              void renameConversation.mutateAsync({ id: conversationId, title: renameValue.trim() }).catch((error) => {
                toast({ kind: "error", title: "Could not rename", description: toErrorMessage(error) });
              });
              setRenameOpen(false);
            }
          }}
          className="space-y-4"
        >
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            autoFocus
            maxLength={120}
            aria-label="Conversation name"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!renameValue.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>

      {conversationId && compareOpen ? (
        <CompareDialog
          open={compareOpen}
          onClose={() => setCompareOpen(false)}
          conversationId={conversationId}
          promptText={comparePrompt}
          models={models.map((m) => ({ id: m.id, name: m.name }))}
        />
      ) : null}

      {conversationId && shareOpen ? (
        <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} conversationId={conversationId} />
      ) : null}
    </div>
  );

  function handleDelete() {
    if (!conversationId) return;
    deleteConversation.mutate(conversationId, {
      onSuccess: () => {
        router.replace("/chat");
        toast({ kind: "success", title: "Conversation deleted" });
      },
      onError: (error) => {
        toast({ kind: "error", title: "Could not delete", description: toErrorMessage(error) });
      },
    });
  }

  function handleExport(title: string, messages: { role: string; content: string }[]) {
    const lines = [`# ${title}`, ""];
    for (const message of messages) {
      const label = message.role === "user" ? "You" : message.role === "assistant" ? "Tikjap AI" : message.role;
      lines.push(`**${label}:**`, "", message.content, "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "conversation"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

function useShowTimestamps(): { showTimestamps: boolean } {
  const { data } = useAiPreferences();
  return { showTimestamps: data?.preferences.showTimestamps ?? true };
}

function CompareDialog({
  open,
  onClose,
  conversationId,
  promptText,
  models,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  promptText: string;
  models: Array<{ id: string; name: string }>;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>(models.slice(0, 2).map((m) => m.id));
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [running, setRunning] = useState(false);

  const toggle = (id: string) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : current.length >= 3 ? current : [...current, id]
    );
  };

  const run = async () => {
    if (!promptText.trim() || selected.length === 0) return;
    setRunning(true);
    setResults([]);
    try {
      const { results: comparisonResults } = await api.conversations.compare(conversationId, promptText, selected);
      setResults(comparisonResults);
    } catch (error) {
      toast({ kind: "error", title: "Comparison failed", description: toErrorMessage(error) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Compare models" description={`Re-run the latest prompt across up to three models.`}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => toggle(model.id)}
              aria-pressed={selected.includes(model.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selected.includes(model.id)
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-line text-muted hover:border-fg hover:text-fg"
              }`}
            >
              {model.name}
            </button>
          ))}
        </div>
        {!promptText.trim() ? <p className="text-xs text-muted">Send a message first, then compare models on it.</p> : null}
        <div className="flex justify-end">
          <Button onClick={run} disabled={!selected.length || !promptText.trim() || running}>
            {running ? "Running…" : "Run comparison"}
          </Button>
        </div>
        {results.length > 0 ? (
          <div className={`grid gap-3 ${results.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {results.map((result) => (
              <div key={result.modelId} className="rounded-xl border border-line p-3">
                <p className="mb-1 flex items-center justify-between text-sm font-medium text-fg">
                  <span>{result.modelName}</span>
                  <span className="text-[11px] tabular-nums text-muted">{(result.latencyMs / 1000).toFixed(1)}s</span>
                </p>
                <div className="max-h-64 overflow-y-auto text-xs text-muted">
                  <MarkdownLite content={result.content} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function MarkdownLite({ content }: { content: string }) {
  return <p className="whitespace-pre-wrap">{content}</p>;
}

function ShareDialog({
  open,
  onClose,
  conversationId,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
}) {
  const { toast } = useToast();
  const [expiresInHours, setExpiresInHours] = useState(0);
  const [password, setPassword] = useState("");
  const [link, setLink] = useState<string>();
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const result = await api.conversations.createShare(conversationId, {
        expiresInHours: expiresInHours || undefined,
        password: password.trim() || undefined,
      });
      setLink(`${window.location.origin}${result.url}`);
      void api.conversations.shares(conversationId).catch(() => undefined);
    } catch (error) {
      toast({ kind: "error", title: "Could not create link", description: toErrorMessage(error) });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share conversation"
      description="Anyone with this read-only link can view the conversation."
    >
      <div className="space-y-4">
        <label className="block text-sm text-muted">
          Expires after
          <select
            value={expiresInHours}
            onChange={(event) => setExpiresInHours(Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg"
          >
            <option value={0}>Never</option>
            <option value={24}>24 hours</option>
            <option value={24 * 7}>7 days</option>
            <option value={24 * 30}>30 days</option>
          </select>
        </label>
        <Input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Optional password"
          maxLength={80}
          aria-label="Share password"
        />
        {link ? (
          <div className="space-y-2">
            <code className="block break-all rounded-lg border border-line bg-surface px-3 py-2 text-xs text-muted">{link}</code>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => {
                  toast({ kind: "success", title: "Link copied" });
                });
              }}
            >
              Copy link
            </Button>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {!link ? (
            <Button onClick={create} disabled={creating}>
              <Link2 className="mr-1.5 inline h-4 w-4" aria-hidden />
              {creating ? "Creating…" : "Create link"}
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

function ConversationMenu({
  conversation,
  onRename,
  onDelete,
  onTogglePin,
  onToggleArchive,
  onExport,
  onShare,
  onCompare,
  onPrint,
}: {
  conversation: { pinned?: boolean; archived?: boolean };
  onRename: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onExport: () => void;
  onShare: () => void;
  onCompare: () => void;
  onPrint: () => void;
}) {
  return (
    <Dropdown
      trigger={({ ref, toggle, "aria-expanded": expanded }) => (
        <button
          ref={ref}
          type="button"
          aria-expanded={expanded}
          aria-label="Conversation actions"
          onClick={toggle}
          className="rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-fg"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <DropdownItem
            icon={<Pencil className="h-4 w-4" aria-hidden />}
            onSelect={() => {
              close();
              onRename();
            }}
          >
            Rename
          </DropdownItem>
          <DropdownItem
            icon={conversation.pinned ? <PinOff className="h-4 w-4" aria-hidden /> : <Pin className="h-4 w-4" aria-hidden />}
            onSelect={() => {
              close();
              onTogglePin();
            }}
          >
            {conversation.pinned ? "Unpin" : "Pin to top"}
          </DropdownItem>
          <DropdownItem
            icon={<Columns3 className="h-4 w-4" aria-hidden />}
            onSelect={() => {
              close();
              onCompare();
            }}
          >
            Compare models
          </DropdownItem>
          <DropdownItem
            icon={<Link2 className="h-4 w-4" aria-hidden />}
            onSelect={() => {
              close();
              onShare();
            }}
          >
            Share…
          </DropdownItem>
          <DropdownItem
            icon={<Printer className="h-4 w-4" aria-hidden />}
            onSelect={() => {
              close();
              onPrint();
            }}
          >
            Print / PDF
          </DropdownItem>
          <DropdownItem
            icon={conversation.archived ? <ArchiveRestore className="h-4 w-4" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
            onSelect={() => {
              close();
              onToggleArchive();
            }}
          >
            {conversation.archived ? "Unarchive" : "Archive"}
          </DropdownItem>
          <DropdownItem
            icon={<Download className="h-4 w-4" aria-hidden />}
            onSelect={() => {
              close();
              onExport();
            }}
          >
            Export as Markdown
          </DropdownItem>
          <DropdownItem
            icon={<Trash2 className="h-4 w-4" aria-hidden />}
            danger
            onSelect={() => {
              close();
              onDelete();
            }}
          >
            Delete conversation
          </DropdownItem>
        </>
      )}
    </Dropdown>
  );
}
