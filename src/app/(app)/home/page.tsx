"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUp,
  Code2,
  Database,
  FileText,
  FolderOpen,
  Globe,
  Paperclip,
  PenLine,
  Zap,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useConversations, useCreateConversation } from "@/hooks/use-conversations";
import { useFiles, useProjects, useSavedPrompts, useStorageUsage } from "@/hooks/use-platform";
import { useModels } from "@/hooks/use-models";
import { Skeleton } from "@/components/ui";
import { cn, formatBytes, timeAgo } from "@/lib/utils";
import type { ToolPermission } from "@/lib/types";

/**
 * The workspace home.
 *
 * The primary element is a composer, not a search box: the job of this screen
 * is to start work. Search lives in the sidebar, which owns the conversation
 * list — having it in both places made the two compete for the same intent.
 *
 * Everything rendered is backed by a live query. Sections with no data are
 * omitted entirely rather than showing a placeholder that describes what would
 * be there, and a quick action whose tool the deployment cannot run is hidden
 * rather than shown greyed out. An empty account therefore sees a composer and
 * nothing else, which is the honest state of it.
 */

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
  tool?: ToolPermission;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "research",
    label: "Research",
    icon: <Globe className="h-3.5 w-3.5" aria-hidden />,
    prompt: "Research this topic and give me a sourced summary: ",
    tool: "deep_research",
  },
  {
    id: "analyze",
    label: "Analyze data",
    icon: <Database className="h-3.5 w-3.5" aria-hidden />,
    prompt: "Attach a CSV or JSON file and I will profile it — types, distributions and correlations.",
    tool: "data_analysis",
  },
  {
    id: "code",
    label: "Code",
    icon: <Code2 className="h-3.5 w-3.5" aria-hidden />,
    prompt: "Help me write and verify some code. Here is what I need: ",
    tool: "code_execution",
  },
  {
    id: "write",
    label: "Write",
    icon: <PenLine className="h-3.5 w-3.5" aria-hidden />,
    prompt: "Help me write ",
  },
  {
    id: "files",
    label: "Upload files",
    icon: <Paperclip className="h-3.5 w-3.5" aria-hidden />,
    prompt: "",
    tool: "file_analysis",
  },
];

function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-fg"
        >
          {action}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const createConversation = useCreateConversation();
  const { conversations: allConversations, isLoading: loadingConversations } = useConversations();
  const { data: projectsData, isLoading: loadingProjects } = useProjects();
  const { data: filesData } = useFiles();
  const { data: promptsData } = useSavedPrompts();
  const { data: storage } = useStorageUsage();
  const { data: modelsData } = useModels();

  // Newest first; the list endpoint has no limit param, so trim client-side.
  const conversations = allConversations.slice(0, 6);
  const projects = (projectsData?.projects ?? []).filter((project) => !project.archived);
  const files = filesData?.files ?? [];
  const prompts = promptsData?.prompts ?? [];

  // Tools this deployment can actually run. An action whose tool is missing is
  // dropped from the list — offering a button that cannot work is worse than
  // not offering it, and the chat tool menu still explains what is unavailable.
  const actions = useMemo(() => {
    const unavailable = new Set<string>();
    for (const entry of modelsData?.tools ?? []) {
      if (!entry.available) unavailable.add(entry.id);
    }
    return QUICK_ACTIONS.filter((action) => !action.tool || !unavailable.has(action.tool));
  }, [modelsData]);

  const firstName = (user?.name ?? "").trim().split(/\s+/)[0];
  const greeting = firstName ? `Welcome back, ${firstName}` : "Welcome back";

  const start = async (prompt: string, tool?: ToolPermission) => {
    try {
      const { conversation } = await createConversation.mutateAsync({});
      const params = new URLSearchParams();
      if (prompt) params.set("prompt", prompt);
      if (tool) params.set("tool", tool);
      const qs = params.toString();
      router.push(`/chat/${conversation.id}${qs ? `?${qs}` : ""}`);
    } catch {
      // Creation failed (offline, rate limited). Fall back to the new-chat
      // screen rather than leaving the click dead.
      router.push("/chat");
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void start(draft.trim());
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line — the same contract as the chat
    // composer, so the gesture learned here keeps working there.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void start(draft.trim());
    }
  };

  const busy = createConversation.isPending;
  const hasAside = projects.length > 0 || files.length > 0 || prompts.length > 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{greeting}</h1>
        </header>

        {/* The primary action: start work, without navigating first. */}
        <div className="mb-10">
          <form
            onSubmit={submit}
            className="rounded-2xl border border-line bg-elevated shadow-sm transition-colors focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20"
          >
            <label htmlFor="home-composer" className="sr-only">
              What would you like to work on?
            </label>
            <textarea
              id="home-composer"
              ref={textareaRef}
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="What would you like to work on?"
              className="w-full resize-none bg-transparent px-4 pt-3.5 text-sm leading-relaxed text-fg placeholder:text-muted/60 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-3 px-3 pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {actions.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => void start(action.prompt, action.tool)}
                    disabled={busy}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1",
                      "text-[12px] font-medium text-muted transition-colors",
                      "hover:border-accent/40 hover:bg-surface hover:text-fg disabled:opacity-50"
                    )}
                  >
                    <span className="text-accent">{action.icon}</span>
                    {action.label}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={busy}
                aria-label="Start"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg shadow-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </form>
        </div>

        <div className={cn("grid gap-8", hasAside && "lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]")}>
          {/* ---------------- Continue previous work ---------------- */}
          <section>
            <SectionHeader
              title="Recent"
              action={conversations.length > 0 ? "All chats" : undefined}
              onAction={() => router.push("/chat")}
            />
            {loadingConversations ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : conversations.length === 0 ? (
              <p className="text-sm text-muted">Your conversations will appear here.</p>
            ) : (
              // One bordered container with dividers rather than a stack of
              // floating cards: the same rows at a fraction of the visual noise.
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-elevated">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/chat/${conversation.id}`)}
                      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
                        {conversation.title}
                      </span>
                      <span className="hidden shrink-0 text-[11px] tabular-nums text-muted sm:inline">
                        {conversation.messageCount} msg
                      </span>
                      <span className="shrink-0 text-[11px] text-muted">{timeAgo(conversation.updatedAt)}</span>
                      <ArrowRight
                        className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {hasAside ? (
            <div className="space-y-7">
              {/* ---------------- Projects ---------------- */}
              {loadingProjects ? null : projects.length > 0 ? (
                <section>
                  <SectionHeader title="Projects" action="Open" onAction={() => router.push("/projects")} />
                  <ul className="space-y-1">
                    {projects.slice(0, 4).map((project) => (
                      <li key={project.id}>
                        <button
                          type="button"
                          onClick={() => router.push("/projects")}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{project.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* ---------------- Files ---------------- */}
              {files.length > 0 ? (
                <section>
                  <SectionHeader title="Files" />
                  <ul className="space-y-1">
                    {files.slice(0, 4).map((file) => (
                      <li key={file.id} className="flex items-center gap-2.5 px-2 py-1.5 text-[13px]">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-muted">{formatBytes(file.size)}</span>
                      </li>
                    ))}
                  </ul>
                  {storage && storage.fileCount > files.slice(0, 4).length ? (
                    <p className="mt-1.5 px-2 text-[11px] text-muted">
                      {formatBytes(storage.usedBytes)} across {storage.fileCount} files
                    </p>
                  ) : null}
                </section>
              ) : null}

              {/* ---------------- Saved prompts ---------------- */}
              {prompts.length > 0 ? (
                <section>
                  <SectionHeader title="Saved" action="All" onAction={() => router.push("/bookmarks")} />
                  <ul className="space-y-1">
                    {prompts.slice(0, 4).map((prompt) => (
                      <li key={prompt.id}>
                        <button
                          type="button"
                          onClick={() => void start(prompt.body)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface"
                        >
                          <Zap className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{prompt.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
