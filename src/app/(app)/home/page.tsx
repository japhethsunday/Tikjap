"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Clock,
  Code2,
  Database,
  FileText,
  FolderOpen,
  Globe,
  MessageSquarePlus,
  Paperclip,
  PenLine,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useConversations, useCreateConversation } from "@/hooks/use-conversations";
import { useFiles, useProjects, useSavedPrompts, useStorageUsage } from "@/hooks/use-platform";
import { useModels } from "@/hooks/use-models";
import { Card, Skeleton } from "@/components/ui";
import { cn, formatBytes, timeAgo } from "@/lib/utils";
import type { ToolPermission } from "@/lib/types";

/**
 * The workspace home.
 *
 * Everything on this page is backed by an endpoint that already exists —
 * conversations, projects, files, saved prompts and storage all come from live
 * queries. Nothing is rendered speculatively: a section that has no data shows
 * an empty state that offers the action which would create some, rather than
 * placeholder rows implying features that do not work.
 */

/** A quick action seeds a new conversation with a starter prompt and, where
 *  relevant, pre-enables the tool that does the actual work. */
interface QuickAction {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  prompt: string;
  tool?: ToolPermission;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "ask",
    label: "Ask anything",
    hint: "Start a conversation",
    icon: <Sparkles className="h-4 w-4" aria-hidden />,
    prompt: "",
  },
  {
    id: "research",
    label: "Research",
    hint: "Search and read sources",
    icon: <Globe className="h-4 w-4" aria-hidden />,
    prompt: "Research this topic and give me a sourced summary: ",
    tool: "deep_research",
  },
  {
    id: "analyze",
    label: "Analyze data",
    hint: "Statistics from a file",
    icon: <Database className="h-4 w-4" aria-hidden />,
    prompt: "Attach a CSV or JSON file and I will profile it — types, distributions and correlations.",
    tool: "data_analysis",
  },
  {
    id: "code",
    label: "Code",
    hint: "Write and run code",
    icon: <Code2 className="h-4 w-4" aria-hidden />,
    prompt: "Help me write and verify some code. Here is what I need: ",
    tool: "code_execution",
  },
  {
    id: "write",
    label: "Write",
    hint: "Draft and edit",
    icon: <PenLine className="h-4 w-4" aria-hidden />,
    prompt: "Help me write ",
  },
  {
    id: "files",
    label: "Upload files",
    hint: "Ask about a document",
    icon: <Paperclip className="h-4 w-4" aria-hidden />,
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
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-tight text-fg">{title}</h2>
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

function EmptyState({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line px-4 py-8 text-center">
      <span className="text-muted/60">{icon}</span>
      <p className="text-xs text-muted">{children}</p>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState("");

  const createConversation = useCreateConversation();
  const { conversations: allConversations, isLoading: loadingConversations } = useConversations();
  const { data: projectsData, isLoading: loadingProjects } = useProjects();
  const { data: filesData, isLoading: loadingFiles } = useFiles();
  const { data: promptsData } = useSavedPrompts();
  const { data: storage } = useStorageUsage();
  const { data: modelsData } = useModels();

  // Newest first; the list endpoint has no limit param, so trim client-side.
  const conversations = allConversations.slice(0, 6);
  const projects = (projectsData?.projects ?? []).filter((project) => !project.archived);
  const files = filesData?.files ?? [];
  const prompts = promptsData?.prompts ?? [];

  // Tools the deployment can actually run — a quick action whose tool is
  // unavailable is dimmed rather than hidden, so the capability is discoverable
  // but never silently does nothing.
  const unavailableTools = useMemo(() => {
    const set = new Set<string>();
    for (const entry of modelsData?.tools ?? []) {
      if (!entry.available) set.add(entry.id);
    }
    return set;
  }, [modelsData]);

  const firstName = (user?.name ?? "").trim().split(/\s+/)[0];
  const greeting = firstName ? `Welcome back, ${firstName}` : "Welcome back";

  const startTask = async (action: QuickAction) => {
    try {
      const { conversation } = await createConversation.mutateAsync({});
      const params = new URLSearchParams();
      if (action.prompt) params.set("prompt", action.prompt);
      if (action.tool) params.set("tool", action.tool);
      const qs = params.toString();
      router.push(`/chat/${conversation.id}${qs ? `?${qs}` : ""}`);
    } catch {
      // Creation failed (offline, rate limited). Fall back to the new-chat
      // screen rather than leaving the click dead.
      router.push("/chat");
    }
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    // The sidebar already owns conversation search and reads ?q=.
    router.push(term ? `/chat?q=${encodeURIComponent(term)}` : "/chat");
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{greeting}</h1>
          <p className="mt-1.5 text-sm text-muted">What would you like to work on?</p>
        </header>

        {/* Start a task without navigating anywhere first. */}
        <div className="mb-8 space-y-3">
          <form onSubmit={submitSearch} className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your conversations…"
              aria-label="Search conversations"
              className="w-full rounded-2xl border border-line bg-elevated py-3.5 pl-11 pr-4 text-sm text-fg shadow-sm transition-colors placeholder:text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
          </form>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <button
              type="button"
              onClick={() => void startTask(QUICK_ACTIONS[0])}
              disabled={createConversation.isPending}
              className="col-span-2 flex items-center gap-2.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-fg shadow-sm transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60 sm:col-span-1"
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
              New chat
            </button>
            {QUICK_ACTIONS.slice(1).map((action) => {
              const blocked = action.tool ? unavailableTools.has(action.tool) : false;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => void startTask(action)}
                  disabled={blocked || createConversation.isPending}
                  title={blocked ? `${action.label} is not configured on this deployment` : action.hint}
                  className={cn(
                    "group flex flex-col items-start gap-1 rounded-xl border border-line bg-elevated px-3.5 py-3 text-left transition-all",
                    blocked
                      ? "cursor-not-allowed opacity-45"
                      : "hover:border-accent/40 hover:bg-surface active:scale-[0.99]"
                  )}
                >
                  <span className="text-accent">{action.icon}</span>
                  <span className="text-[13px] font-medium text-fg">{action.label}</span>
                  <span className="text-[11px] text-muted">{blocked ? "Not configured" : action.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          {/* ---------------- Continue previous work ---------------- */}
          <section>
            <SectionHeader title="Continue where you left off" action="All chats" onAction={() => router.push("/chat")} />
            {loadingConversations ? (
              <div className="space-y-2">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <EmptyState icon={<MessageSquarePlus className="h-5 w-5" aria-hidden />}>
                No conversations yet — start one above.
              </EmptyState>
            ) : (
              <ul className="space-y-2">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/chat/${conversation.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-line bg-elevated px-4 py-3 text-left transition-all hover:border-accent/40 hover:bg-surface"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-fg">{conversation.title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted">
                          {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"} ·{" "}
                          {timeAgo(conversation.updatedAt)}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="space-y-6">
            {/* ---------------- Projects ---------------- */}
            <section>
              <SectionHeader title="Projects" action="Open" onAction={() => router.push("/projects")} />
              {loadingProjects ? (
                <Skeleton className="h-20 w-full rounded-xl" />
              ) : projects.length === 0 ? (
                <EmptyState icon={<FolderOpen className="h-5 w-5" aria-hidden />}>
                  No projects yet.
                </EmptyState>
              ) : (
                <ul className="space-y-2">
                  {projects.slice(0, 4).map((project) => (
                    <li key={project.id}>
                      <button
                        type="button"
                        onClick={() => router.push("/projects")}
                        className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-elevated px-3.5 py-2.5 text-left transition-colors hover:bg-surface"
                      >
                        <FolderOpen className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{project.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ---------------- Files ---------------- */}
            <section>
              <SectionHeader title="Files" />
              {loadingFiles ? (
                <Skeleton className="h-20 w-full rounded-xl" />
              ) : files.length === 0 ? (
                <EmptyState icon={<FileText className="h-5 w-5" aria-hidden />}>
                  Attach a file in any chat and it appears here.
                </EmptyState>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {files.slice(0, 4).map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px]"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
                        <span className="shrink-0 text-[11px] text-muted">{formatBytes(file.size)}</span>
                      </li>
                    ))}
                  </ul>
                  {storage ? (
                    <p className="mt-2 px-2 text-[11px] text-muted">
                      {formatBytes(storage.usedBytes)} used across {storage.fileCount} file
                      {storage.fileCount === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </>
              )}
            </section>

            {/* ---------------- Saved prompts ---------------- */}
            {prompts.length > 0 ? (
              <section>
                <SectionHeader title="Saved" />
                <ul className="space-y-1.5">
                  {prompts.slice(0, 4).map((prompt) => (
                    <li key={prompt.id}>
                      <button
                        type="button"
                        onClick={() =>
                          void startTask({
                            id: prompt.id,
                            label: prompt.title,
                            hint: "",
                            icon: null,
                            prompt: prompt.body,
                          })
                        }
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface"
                      >
                        <Zap className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-fg">{prompt.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* ---------------- Usage ---------------- */}
            {storage ? (
              <Card className="p-4">
                <p className="flex items-center gap-2 text-xs font-medium text-muted">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  Activity
                </p>
                <p className="mt-2 text-[13px] text-fg">
                  {conversations.length} recent conversation{conversations.length === 1 ? "" : "s"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {formatBytes(storage.usedBytes)} stored · {projects.length} project
                  {projects.length === 1 ? "" : "s"}
                </p>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
