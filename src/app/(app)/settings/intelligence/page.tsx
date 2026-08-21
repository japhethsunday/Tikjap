"use client";

import { useState } from "react";
import { BrainCircuit, Bot, ScrollText, Trash2 } from "lucide-react";
import {
  useMemories,
  useCreateMemory,
  useDeleteMemory,
  useAssistants,
  useCreateAssistant,
  useDeleteAssistant,
  useSavedPrompts,
  useCreateSavedPrompt,
  useDeleteSavedPrompt,
} from "@/hooks/use-platform";
import { toErrorMessage } from "@/hooks/use-conversations";
import { useToast } from "@/components/providers/toast";
import { Button, Card, Input, Skeleton } from "@/components/ui";

export default function IntelligencePage() {
  const { toast } = useToast();

  return (
    <div className="space-y-8">
      <MemoriesSection />
      <AssistantsSection />
      <PromptsSection />
    </div>
  );

  function MemoriesSection() {
    const { data, isLoading } = useMemories();
    const createMemory = useCreateMemory();
    const deleteMemory = useDeleteMemory();
    const [content, setContent] = useState("");
    const memories = data?.memories ?? [];

    const add = () => {
      const value = content.trim();
      if (!value) return;
      createMemory.mutate(value, {
        onSuccess: () => {
          setContent("");
          toast({ kind: "success", title: "Memory saved" });
        },
        onError: (error) => toast({ kind: "error", title: "Could not save memory", description: toErrorMessage(error) }),
      });
    };

    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="text-base font-semibold text-fg">Memory</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Facts Tikjap AI should remember in every conversation — your preferences, context, and standing instructions.
        </p>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="e.g. I prefer concise answers with code examples"
            maxLength={500}
            aria-label="New memory"
          />
          <Button type="submit" loading={createMemory.isPending} disabled={!content.trim()}>
            Add
          </Button>
        </form>

        {isLoading ? (
          <Skeleton className="mt-4 h-16 w-full" />
        ) : memories.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No memories saved yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {memories.map((memory) => (
              <li key={memory.id} className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <p className="min-w-0 break-words text-sm text-fg">{memory.content}</p>
                <button
                  type="button"
                  aria-label="Delete memory"
                  onClick={() =>
                    deleteMemory.mutate(memory.id, {
                      onError: (error) => toast({ kind: "error", title: "Could not delete memory", description: toErrorMessage(error) }),
                    })
                  }
                  className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-line/40 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  function AssistantsSection() {
    const { data, isLoading } = useAssistants();
    const createAssistant = useCreateAssistant();
    const deleteAssistant = useDeleteAssistant();
    const [name, setName] = useState("");
    const [instructions, setInstructions] = useState("");
    const assistants = data?.assistants ?? [];

    const add = () => {
      const trimmedName = name.trim();
      if (!trimmedName) return;
      createAssistant.mutate(
        { name: trimmedName, instructions: instructions.trim() || undefined },
        {
          onSuccess: () => {
            setName("");
            setInstructions("");
            toast({ kind: "success", title: "Assistant created" });
          },
          onError: (error) => toast({ kind: "error", title: "Could not create assistant", description: toErrorMessage(error) }),
        }
      );
    };

    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="text-base font-semibold text-fg">Custom assistants</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Personas with their own instructions. Pick one from the chat header to apply it to your next messages.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Assistant name" maxLength={80} aria-label="Assistant name" />
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="How should this assistant behave? e.g. You are a senior TypeScript engineer…"
            maxLength={4000}
            rows={3}
            aria-label="Assistant instructions"
            className="w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <Button type="submit" loading={createAssistant.isPending} disabled={!name.trim()}>
            Create assistant
          </Button>
        </form>

        {isLoading ? (
          <Skeleton className="mt-4 h-16 w-full" />
        ) : assistants.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No custom assistants yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {assistants.map((assistant) => (
              <li key={assistant.id} className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{assistant.name}</p>
                  {assistant.instructions ? <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted">{assistant.instructions}</p> : null}
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${assistant.name}`}
                  onClick={() =>
                    deleteAssistant.mutate(assistant.id, {
                      onError: (error) => toast({ kind: "error", title: "Could not delete assistant", description: toErrorMessage(error) }),
                    })
                  }
                  className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-line/40 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  function PromptsSection() {
    const { data, isLoading } = useSavedPrompts();
    const createPrompt = useCreateSavedPrompt();
    const deletePrompt = useDeleteSavedPrompt();
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const prompts = data?.prompts ?? [];

    const add = () => {
      const trimmedTitle = title.trim();
      const trimmedBody = body.trim();
      if (!trimmedTitle || !trimmedBody) return;
      createPrompt.mutate(
        { title: trimmedTitle, body: trimmedBody },
        {
          onSuccess: () => {
            setTitle("");
            setBody("");
            toast({ kind: "success", title: "Prompt saved" });
          },
          onError: (error) => toast({ kind: "error", title: "Could not save prompt", description: toErrorMessage(error) }),
        }
      );
    };

    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-accent" aria-hidden />
          <h2 className="text-base font-semibold text-fg">Saved prompts</h2>
        </div>
        <p className="mt-1 text-sm text-muted">Reusable prompt templates you can copy into any conversation.</p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Prompt title" maxLength={120} aria-label="Prompt title" />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="The prompt text…"
            maxLength={4000}
            rows={3}
            aria-label="Prompt body"
            className="w-full rounded-lg border border-line bg-elevated px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <Button type="submit" loading={createPrompt.isPending} disabled={!title.trim() || !body.trim()}>
            Save prompt
          </Button>
        </form>

        {isLoading ? (
          <Skeleton className="mt-4 h-16 w-full" />
        ) : prompts.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No saved prompts yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {prompts.map((prompt) => (
              <li key={prompt.id} className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{prompt.title}</p>
                  <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted">{prompt.body}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(prompt.body)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-elevated"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${prompt.title}`}
                    onClick={() =>
                      deletePrompt.mutate(prompt.id, {
                        onError: (error) => toast({ kind: "error", title: "Could not delete prompt", description: toErrorMessage(error) }),
                      })
                    }
                    className="rounded-md p-1.5 text-muted transition-colors hover:bg-line/40 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }
}
