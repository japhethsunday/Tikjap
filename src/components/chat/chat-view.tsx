"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useConversation, useCreateConversation, useDeleteConversation, useRenameConversation, toErrorMessage } from "@/hooks/use-conversations";
import { useModels, useMessages, useAiPreferences } from "@/hooks/use-models";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/components/providers/auth";
import { useToast } from "@/components/providers/toast";
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

  const models = modelsData?.models ?? [];
  const defaultModelId = preferences?.preferences.defaultModelId ?? models.find((m) => m.isDefault)?.id ?? models[0]?.id ?? "";
  const [modelId, setModelId] = useState(defaultModelId);
  const effectiveModelId = modelId || defaultModelId;

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const selectedModel = models.find((m) => m.id === effectiveModelId);
  const allowImages = Boolean(selectedModel?.capabilities.vision);

  const chat = useChat({
    conversationId,
    messages: messagesData?.messages ?? [],
    isLoadingMessages,
    modelId: effectiveModelId,
    streamingEnabled: preferences?.preferences.streamingEnabled ?? true,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.visibleMessages, chat.isStreaming]);

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

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:px-4">
        <button
          type="button"
          onClick={() => router.push("/chat")}
          aria-label="Open conversation menu"
          className="rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-fg lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{conversation?.conversation.title ?? "New chat"}</p>
        </div>
        <ModelSelect models={models} value={effectiveModelId} onChange={setModelId} loading={modelsData === undefined} />
        {conversationId && conversation ? (
          <ConversationMenu
            onRename={() => {
              setRenameValue(conversation.conversation.title);
              setRenameOpen(true);
            }}
            onDelete={handleDelete}
          />
        ) : null}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {isLoadingMessages ? (
          <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
            <Skeleton className="h-16 w-2/3" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="ml-auto h-16 w-1/2" />
          </div>
        ) : chat.visibleMessages.length === 0 && !chat.isStreaming ? (
          <ChatEmptyState onPick={(prompt) => void handleSend(prompt, [])} />
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6">
            {chat.visibleMessages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                onRegenerate={chat.regenerate}
                onEdit={chat.editAndResend}
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
}

function useShowTimestamps(): { showTimestamps: boolean } {
  const { data } = useAiPreferences();
  return { showTimestamps: data?.preferences.showTimestamps ?? true };
}

function ConversationMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
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