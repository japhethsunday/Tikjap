"use client";

import { useMemo, useState } from "react";
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
import { useCreateConversation } from "@/hooks/use-conversations";
import { useFiles, useProjects, useSavedPrompts, useStorageUsage } from "@/hooks/use-platform";
import { useModels } from "@/hooks/use-models";
import { cn, formatBytes } from "@/lib/utils";
import type { ToolPermission } from "@/lib/types";

/**
 * The workspace home.
 *
 * One job: start work. The composer is the centred hero, and everything that
 * already lives somewhere else is left there — the sidebar owns conversation
 * search and the recent-conversation list, so repeating either here put the
 * same five rows on screen twice.
 *
 * What remains below the composer is the material the sidebar does not show:
 * projects, uploaded files and saved prompts. Each renders only when it has
 * content, so an empty account gets a composer and nothing else, which is the
 * honest state of it.
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
    <div className="mb-2 flex items-baseline justify-between gap-3">
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

  const createConversation = useCreateConversation();
  const { data: projectsData } = useProjects();
  const { data: filesData } = useFiles();
  const { data: promptsData } = useSavedPrompts();
  const { data: storage } = useStorageUsage();
  const { data: modelsData } = useModels();

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
  const hasShelf = projects.length > 0 || files.length > 0 || prompts.length > 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 sm:px-6">
        {/* The composer sits in the optical centre of the page rather than
            pinned under the heading with the rest of the screen left empty. */}
        <div className="flex flex-1 flex-col justify-center py-12">
          <h1 className="mb-5 text-center text-2xl font-semibold tracking-tight text-fg sm:text-[30px]">
            {greeting}
          </h1>

          <form
            onSubmit={submit}
            className="rounded-2xl border border-line bg-elevated shadow-sm transition-colors focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/20"
          >
            <label htmlFor="home-composer" className="sr-only">
              What would you like to work on?
            </label>
            <textarea
              id="home-composer"
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="What would you like to work on?"
              className="w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-relaxed text-fg placeholder:text-muted/60 focus:outline-none"
            />
            <div className="flex items-end justify-between gap-3 px-3 pb-3">
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

        {/* Secondary material, below the fold on a short viewport. Nothing here
            duplicates the sidebar. */}
        {hasShelf ? (
          <div className="grid gap-7 border-t border-line py-8 sm:grid-cols-2 lg:grid-cols-3">
            {projects.length > 0 ? (
              <section>
                <SectionHeader title="Projects" action="Open" onAction={() => router.push("/projects")} />
                <ul className="space-y-0.5">
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

            {files.length > 0 ? (
              <section>
                <SectionHeader title="Files" />
                <ul className="space-y-0.5">
                  {files.slice(0, 4).map((file) => (
                    <li key={file.id} className="flex items-center gap-2.5 px-2 py-1.5 text-[13px]">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted">{formatBytes(file.size)}</span>
                    </li>
                  ))}
                </ul>
                {storage && storage.fileCount > 4 ? (
                  <p className="mt-1.5 px-2 text-[11px] text-muted">
                    {formatBytes(storage.usedBytes)} across {storage.fileCount} files
                  </p>
                ) : null}
              </section>
            ) : null}

            {prompts.length > 0 ? (
              <section>
                <SectionHeader title="Saved" action="All" onAction={() => router.push("/bookmarks")} />
                <ul className="space-y-0.5">
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
  );
}
