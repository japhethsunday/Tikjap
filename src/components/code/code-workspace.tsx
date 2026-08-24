"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileCode2,
  FolderTree,
  GitCompare,
  Loader2,
  Menu,
  Play,
  Save,
  Terminal,
  X,
} from "lucide-react";
import { useToast } from "@/components/providers/toast";
import { useToggleSidebar } from "@/components/sidebar/sidebar-context";
import {
  useDeleteProjectFile,
  useProjectFiles,
  useProjects,
  useRunProjectFile,
  useUpdateProjectFile,
  useWriteProjectFile,
} from "@/hooks/use-platform";
import { Button, Spinner } from "@/components/ui";
import { Dropdown } from "@/components/ui/overlays";
import { FileExplorer } from "./file-explorer";
import { DiffView } from "./diff-view";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CodeRunResult, ProjectFile } from "@/lib/types";

/**
 * The Code workspace.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ project picker                     run / save │
 *   ├───────────────┬───────────────────────────────┤
 *   │ file explorer │ tabs + editor                 │
 *   │               ├───────────────────────────────┤
 *   │               │ output / diff                 │
 *   └───────────────┴───────────────────────────────┘
 *
 * Files persist to project_files, which is RLS-scoped per user. The Run button
 * executes through the same QuickJS WASM sandbox the chat tool uses, so it is
 * JavaScript only — there is no filesystem, network or package installation in
 * that sandbox, and the button says so rather than pretending otherwise.
 */

type BottomTab = "output" | "diff";

interface OpenTab {
  id: string;
  path: string;
}

export function CodeWorkspace() {
  const router = useRouter();
  const { toast } = useToast();
  const { toggle: toggleSidebar } = useToggleSidebar();

  const { data: projectsData, isLoading: loadingProjects } = useProjects();
  const projects = useMemo(
    () => (projectsData?.projects ?? []).filter((project) => !project.archived),
    [projectsData]
  );

  // `undefined` means "not chosen yet", which falls back to the first project.
  // Deriving this beats writing it from an effect, which would render once with
  // no project and again with one.
  const [chosenProjectId, setChosenProjectId] = useState<string | undefined>(undefined);
  const projectId = chosenProjectId ?? projects[0]?.id;
  const activeProject = projects.find((project) => project.id === projectId);

  const { data: filesData, isLoading: loadingFiles } = useProjectFiles(projectId);
  const files = useMemo(() => filesData?.files ?? [], [filesData]);

  const writeFile = useWriteProjectFile(projectId);
  const updateFile = useUpdateProjectFile(projectId);
  const deleteFile = useDeleteProjectFile(projectId);
  const runFile = useRunProjectFile(projectId);

  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  // Unsaved editor contents, keyed by file id. Saved files are absent here, so
  // "is this dirty" is a map lookup rather than a string comparison everywhere.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [bottomTab, setBottomTab] = useState<BottomTab>("output");
  // Below `md` the explorer becomes a drawer — without it there is no way to
  // reach a file on a phone at all.
  const [filesOpen, setFilesOpen] = useState(false);
  const [run, setRun] = useState<CodeRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const activeFile = files.find((file) => file.id === activeId);
  const activeDraft = activeId !== undefined ? drafts[activeId] : undefined;
  const editorValue = activeDraft ?? activeFile?.content ?? "";
  const isDirty = activeFile !== undefined && activeDraft !== undefined && activeDraft !== activeFile.content;

  const dirtyPaths = useMemo(() => {
    const set = new Set<string>();
    for (const file of files) {
      const draft = drafts[file.id];
      if (draft !== undefined && draft !== file.content) set.add(file.path);
    }
    return set;
  }, [files, drafts]);

  // Switching project must not leave tabs pointing at another project's files.
  // Done in the handler rather than an effect so the reset happens once, on the
  // interaction that caused it.
  const selectProject = useCallback((next: string) => {
    setChosenProjectId(next);
    setTabs([]);
    setActiveId(undefined);
    setDrafts({});
    setRun(null);
    setRunError(null);
  }, []);

  const openFile = useCallback((file: ProjectFile) => {
    setTabs((current) =>
      current.some((tab) => tab.id === file.id) ? current : [...current, { id: file.id, path: file.path }]
    );
    setActiveId(file.id);
    setFilesOpen(false);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((current) => {
        const next = current.filter((tab) => tab.id !== id);
        if (activeId === id) setActiveId(next[next.length - 1]?.id);
        return next;
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    [activeId]
  );

  const save = useCallback(async () => {
    if (!activeFile || !isDirty || activeDraft === undefined) return;
    try {
      await updateFile.mutateAsync({ fileId: activeFile.id, content: activeDraft });
      setDrafts((current) => {
        const next = { ...current };
        delete next[activeFile.id];
        return next;
      });
      toast({ kind: "success", title: `Saved ${activeFile.path}` });
    } catch (error) {
      toast({ kind: "error", title: errorMessage(error) });
    }
  }, [activeFile, activeDraft, isDirty, updateFile, toast]);

  // Cmd/Ctrl+S saves, as in any editor. Prevent the browser's save dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  const createFile = useCallback(async () => {
    const path = window.prompt("New file path", "src/index.js");
    if (!path?.trim()) return;
    try {
      const { file } = await writeFile.mutateAsync({ path: path.trim(), content: "" });
      openFile(file);
    } catch (error) {
      toast({ kind: "error", title: errorMessage(error) });
    }
  }, [writeFile, openFile, toast]);

  const removeFile = useCallback(
    async (file: ProjectFile) => {
      if (!window.confirm(`Delete ${file.path}? This cannot be undone.`)) return;
      try {
        await deleteFile.mutateAsync(file.id);
        closeTab(file.id);
      } catch (error) {
        toast({ kind: "error", title: errorMessage(error) });
      }
    },
    [deleteFile, closeTab, toast]
  );

  const execute = useCallback(async () => {
    if (!activeFile) return;
    setRunError(null);
    setBottomTab("output");
    // Run what is on disk; saving first keeps the output honest.
    if (isDirty) await save();
    try {
      const { run: result } = await runFile.mutateAsync(activeFile.id);
      setRun(result);
    } catch (error) {
      setRun(null);
      setRunError(errorMessage(error));
    }
  }, [activeFile, isDirty, save, runFile]);

  const canRun = activeFile?.language === "javascript";

  if (loadingProjects) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <FileCode2 className="h-8 w-8 text-muted/50" aria-hidden />
        <h1 className="text-lg font-semibold text-fg">No projects yet</h1>
        <p className="max-w-sm text-sm text-muted">
          Code works inside a project, so its files stay together and separate from your chats.
        </p>
        <Button onClick={() => router.push("/projects")}>Create a project</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* -------- top bar -------- */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Open navigation"
          className="rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-fg lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => setFilesOpen(true)}
          aria-label="Browse project files"
          className="rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-fg md:hidden"
        >
          <FolderTree className="h-5 w-5" aria-hidden />
        </button>

        <Dropdown
          align="start"
          trigger={({ ref, toggle, "aria-expanded": expanded }) => (
            <button
              ref={ref}
              type="button"
              onClick={toggle}
              aria-expanded={expanded}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface"
            >
              <FileCode2 className="h-4 w-4 text-muted" aria-hidden />
              <span className="max-w-40 truncate">{activeProject?.name ?? "Select project"}</span>
            </button>
          )}
        >
          {({ close }) => (
            <div className="w-56">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    selectProject(project.id);
                    close();
                  }}
                  className={cn(
                    "block w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    project.id === projectId ? "bg-surface text-fg" : "text-muted hover:bg-surface/60 hover:text-fg"
                  )}
                >
                  {project.name}
                </button>
              ))}
            </div>
          )}
        </Dropdown>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void save()}
            disabled={!isDirty || updateFile.isPending}
            loading={updateFile.isPending}
          >
            <Save className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Save</span>
          </Button>
          <Button
            size="sm"
            onClick={() => void execute()}
            disabled={!canRun || runFile.isPending}
            loading={runFile.isPending}
            title={
              canRun
                ? "Run this file in the sandbox"
                : "Only JavaScript runs here — the sandbox has no other runtimes"
            }
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Run</span>
          </Button>
        </div>
      </header>

      {/* -------- explorer + editor -------- */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-line bg-surface md:block">
          <FileExplorer
            files={files}
            activePath={activeFile?.path}
            onOpen={openFile}
            onCreate={() => void createFile()}
            onDelete={(file) => void removeFile(file)}
            dirtyPaths={dirtyPaths}
          />
        </aside>

        {filesOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="tk-fade-in absolute inset-0 bg-black/60 backdrop-blur-[2px]"
              onClick={() => setFilesOpen(false)}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 flex w-[80%] max-w-72 flex-col border-r border-line bg-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="text-sm font-semibold text-fg">{activeProject?.name ?? "Files"}</span>
                <button
                  type="button"
                  onClick={() => setFilesOpen(false)}
                  aria-label="Close files"
                  className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <FileExplorer
                  files={files}
                  activePath={activeFile?.path}
                  onOpen={openFile}
                  onCreate={() => void createFile()}
                  onDelete={(file) => void removeFile(file)}
                  dirtyPaths={dirtyPaths}
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* tabs */}
          {tabs.length > 0 ? (
            <div className="tk-scroll-x flex shrink-0 border-b border-line" role="tablist" aria-label="Open files">
              {tabs.map((tab) => {
                const file = files.find((entry) => entry.id === tab.id);
                const dirty = file ? dirtyPaths.has(file.path) : false;
                return (
                  <div key={tab.id} className="group/tab relative flex shrink-0 items-center">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab.id === activeId}
                      onClick={() => setActiveId(tab.id)}
                      className={cn(
                        "flex items-center gap-1.5 border-r border-line px-3 py-2 text-xs transition-colors",
                        tab.id === activeId
                          ? "bg-canvas font-medium text-fg"
                          : "text-muted hover:bg-elevated/60 hover:text-fg"
                      )}
                    >
                      <span className="max-w-40 truncate">{file?.path ?? tab.path}</span>
                      {dirty ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="Unsaved" /> : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => closeTab(tab.id)}
                      aria-label={`Close ${tab.path}`}
                      className="absolute right-1 hidden rounded p-0.5 text-muted hover:bg-line/60 hover:text-fg group-hover/tab:block"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* editor */}
          <div className="min-h-0 flex-1">
            {loadingFiles ? (
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            ) : !activeFile ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <FileCode2 className="h-7 w-7 text-muted/40" aria-hidden />
                <p className="text-sm text-muted">
                  {files.length === 0 ? "No files in this project yet." : "Select a file to start editing."}
                </p>
                <Button size="sm" variant="secondary" onClick={() => void createFile()}>
                  New file
                </Button>
              </div>
            ) : (
              <textarea
                ref={editorRef}
                value={editorValue}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [activeFile.id]: event.target.value }))
                }
                spellCheck={false}
                aria-label={`Editing ${activeFile.path}`}
                className="h-full w-full resize-none bg-canvas p-4 font-mono text-[13px] leading-relaxed text-fg outline-none"
              />
            )}
          </div>

          {/* -------- output / diff -------- */}
          <div className="flex h-56 shrink-0 flex-col border-t border-line">
            <div className="flex shrink-0 items-center gap-1 border-b border-line px-2" role="tablist">
              {(
                [
                  { id: "output" as const, label: "Output", icon: <Terminal className="h-3.5 w-3.5" aria-hidden /> },
                  { id: "diff" as const, label: "Changes", icon: <GitCompare className="h-3.5 w-3.5" aria-hidden /> },
                ]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={bottomTab === tab.id}
                  onClick={() => setBottomTab(tab.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium transition-colors",
                    bottomTab === tab.id
                      ? "border-b-2 border-accent text-fg"
                      : "border-b-2 border-transparent text-muted hover:text-fg"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.id === "diff" && isDirty ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                  ) : null}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              {bottomTab === "diff" ? (
                activeFile ? (
                  <DiffView before={activeFile.content} after={editorValue} />
                ) : (
                  <p className="p-4 text-xs text-muted">Open a file to see its changes.</p>
                )
              ) : runFile.isPending ? (
                <p className="flex items-center gap-2 p-4 text-xs text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Running in the sandbox…
                </p>
              ) : runError ? (
                <p className="flex items-start gap-2 p-4 text-xs text-danger">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {runError}
                </p>
              ) : run ? (
                <div className="p-3 font-mono text-[12px] leading-relaxed">
                  <p className={cn("mb-2 flex items-center gap-1.5", run.ok ? "text-emerald-500" : "text-danger")}>
                    {run.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {run.ok ? "Completed" : run.timedOut ? "Timed out" : "Failed"} in {run.durationMs} ms
                  </p>
                  {run.logs.length > 0 ? (
                    <pre className="whitespace-pre-wrap break-words text-fg">{run.logs.join("\n")}</pre>
                  ) : null}
                  {run.error ? <pre className="whitespace-pre-wrap break-words text-danger">{run.error}</pre> : null}
                  {run.ok && run.result ? (
                    <pre className="mt-2 whitespace-pre-wrap break-words text-muted">⇒ {run.result}</pre>
                  ) : null}
                  {run.ok && run.logs.length === 0 && !run.result ? (
                    <p className="text-muted">(no output)</p>
                  ) : null}
                </div>
              ) : (
                <p className="p-4 text-xs text-muted">
                  {canRun
                    ? "Run a file to see its output here."
                    : activeFile
                      ? `${activeFile.path} cannot run here — the sandbox is a JavaScript interpreter with no filesystem or network.`
                      : "Open a JavaScript file to run it."}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
