"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  FileText,
  Globe,
  Plus,
  Trash2,
} from "lucide-react";
import { Card, Button, Input, Textarea, Skeleton } from "@/components/ui";
import { Dialog } from "@/components/ui/overlays";
import { useToast } from "@/components/providers/toast";
import {
  useProjects,
  useCreateProject,
  useProjectSources,
  useAddProjectSource,
  useDeleteProjectSource,
  useProjectActivity,
} from "@/hooks/use-platform";
import { timeAgo } from "@/lib/utils";
import { toErrorMessage } from "@/hooks/use-conversations";

export default function ProjectsPage() {
  const { data, isLoading } = useProjects();
  const createProject = useCreateProject();
  const [activeId, setActiveId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const projects = data?.projects ?? [];
  const active = projects.find((project) => project.id === activeId);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-fg">Projects</h1>
          <p className="mt-0.5 text-sm text-muted">Group conversations and give them shared knowledge.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
          New project
        </Button>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted">No projects yet. Create one to organize chats by topic.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => setActiveId(project.id)}
              className="rounded-2xl border border-line p-4 text-left transition-colors hover:bg-surface"
            >
              <p className="text-sm font-medium text-fg">{project.name}</p>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{project.description || "No description"}</p>
              <p className="mt-3 text-[11px] text-muted">Updated {timeAgo(project.updatedAt)}</p>
            </button>
          ))}
        </div>
      )}

      {active ? (
        <ProjectDetail projectId={active.id} name={active.name} onClose={() => setActiveId(undefined)} />
      ) : null}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New project"
        description="Projects group conversations and can carry instructions + knowledge sources."
      >
        <CreateProjectForm
          onDone={() => setCreateOpen(false)}
          onCreate={(input) =>
            createProject.mutateAsync(input).then((result) => setActiveId(result.project.id))
          }
          creating={createProject.isPending}
        />
      </Dialog>
    </main>
  );
}

function CreateProjectForm({
  onDone,
  onCreate,
  creating,
}: {
  onDone: () => void;
  onCreate: (input: { name: string; description?: string; instructions?: string }) => Promise<unknown>;
  creating: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const { toast } = useToast();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        void onCreate({ name: name.trim(), description: description.trim(), instructions: instructions.trim() })
          .then(() => onDone())
          .catch((error) => toast({ kind: "error", title: "Could not create project", description: toErrorMessage(error) }));
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" autoFocus maxLength={120} aria-label="Project name" />
      <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)" maxLength={500} aria-label="Description" />
      <Textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Instructions the AI should follow in this project (optional)"
        rows={3}
        maxLength={4000}
        aria-label="Instructions"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || creating}>
          {creating ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}

function ProjectDetail({ projectId, name, onClose }: { projectId: string; name: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: sourcesData, isLoading: loadingSources } = useProjectSources(projectId);
  const addSource = useAddProjectSource();
  const deleteSource = useDeleteProjectSource();
  const { data: activityData } = useProjectActivity(projectId);
  const [mode, setMode] = useState<"text" | "url">("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");

  const sources = sourcesData?.sources ?? [];
  const activity = activityData?.activity ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["project-sources", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["project-activity", projectId] });
  };

  const submitSource = () => {
    if (mode === "url") {
      if (!url.trim()) return;
      addSource.mutate(
        { projectId, url: url.trim(), fetchUrl: true, title: title.trim() || undefined },
        {
          onSuccess: () => {
            setUrl("");
            setTitle("");
            invalidate();
            toast({ kind: "success", title: "URL imported" });
          },
          onError: (error) => toast({ kind: "error", title: "Import failed", description: toErrorMessage(error) }),
        }
      );
      return;
    }
    if (!content.trim()) return;
    addSource.mutate(
      { projectId, content, title: title.trim() || undefined },
      {
        onSuccess: () => {
          setContent("");
          setTitle("");
          invalidate();
          toast({ kind: "success", title: "Knowledge added" });
        },
        onError: (error) => toast({ kind: "error", title: "Could not save source", description: toErrorMessage(error) }),
      }
    );
  };

  return (
    <Dialog open onClose={onClose} title={name} description="Knowledge sources are retrieved into chats that belong to this project.">
      <div className="space-y-5">
        <section aria-label="Add knowledge source" className="space-y-2">
          <div className="flex gap-1">
            {(["text", "url"] as const).map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => setMode(entry)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  mode === entry ? "bg-elevated text-fg ring-1 ring-line" : "text-muted hover:text-fg"
                }`}
              >
                {entry === "text" ? "Paste text" : "Fetch URL"}
              </button>
            ))}
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" maxLength={160} aria-label="Source title" />
          {mode === "text" ? (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste notes, docs or transcripts…"
              rows={4}
              aria-label="Source content"
            />
          ) : (
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/article" type="url" aria-label="Source URL" />
          )}
          <Button onClick={submitSource} disabled={addSource.isPending}>
            {addSource.isPending ? "Saving…" : "Add source"}
          </Button>
        </section>

        <section aria-label="Knowledge sources">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-fg">
            <FileText className="h-4 w-4" aria-hidden />
            Sources ({sources.length})
          </h3>
          {loadingSources ? (
            <Skeleton className="h-12 w-full" />
          ) : sources.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
              No knowledge yet — relevant snippets are pulled into replies once added.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {sources.map((source) => (
                <li key={source.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                  {source.url ? <Globe className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /> : <FileText className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{source.title}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">{(source.chars / 1000).toFixed(1)}k chars</span>
                  <button
                    type="button"
                    aria-label={`Remove ${source.title}`}
                    onClick={() =>
                      deleteSource.mutate(
                        { projectId, sourceId: source.id },
                        { onSuccess: invalidate, onError: (error) => toast({ kind: "error", title: "Delete failed", description: toErrorMessage(error) }) }
                      )
                    }
                    className="rounded-md p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Recent activity">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-fg">
            <Activity className="h-4 w-4" aria-hidden />
            Recent activity
          </h3>
          {activity.length === 0 ? (
            <p className="text-xs text-muted">Nothing logged yet.</p>
          ) : (
            <ul className="space-y-1 text-xs text-muted">
              {activity.slice(0, 8).map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-2">
                  <span>{entry.action.replace(/[._]/g, " ")}</span>
                  <span className="shrink-0">{timeAgo(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex justify-between">
          <Link href="/chat" className="text-xs text-muted hover:text-fg">
            Start a chat in this project from any conversation menu.
          </Link>
          <Button variant="ghost" onClick={onClose}>
            <ArrowLeft className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            Back to projects
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
