"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckSquare,
  Folder,
  FolderOpen,
  MessageSquarePlus,
  Pin,
  Search,
  Settings,
  Shield,
  Square,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useToast } from "@/components/providers/toast";
import { api } from "@/lib/api";
import { useConversations, toErrorMessage } from "@/hooks/use-conversations";
import { useProjects } from "@/hooks/use-platform";
import { Avatar } from "@/components/ui/avatar";
import { LogoMark } from "@/components/logo";
import { Spinner } from "@/components/ui/primitives";
import { Dropdown, DropdownItem } from "@/components/ui/overlays";
import { timeAgo, cn, debounce } from "@/lib/utils";
import type { SearchHit } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

type SidebarView = "all" | "pinned" | "archived";

const VIEWS: { id: SidebarView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pinned", label: "Pinned" },
  { id: "archived", label: "Archived" },
];

const COLOR_OPTIONS = ["", "red", "amber", "green", "blue", "violet"];

const COLOR_DOT: Record<string, string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
};

function dateGroup(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "Older";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (time >= startOfToday) return "Today";
  if (time >= startOfToday - day) return "Yesterday";
  if (time >= startOfToday - 7 * day) return "Previous 7 days";
  if (time >= startOfToday - 30 * day) return "Previous 30 days";
  return "Older";
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [view, setView] = useState<SidebarView>("all");
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const searchQuery = query ? debouncedQuery : "";
  const { data: projectsData } = useProjects();
  const projects = projectsData?.projects ?? [];
  const { conversations, isLoading } = useConversations({
    query: searchQuery || undefined,
    filter: view === "all" ? undefined : view,
    projectId,
  });

  const { data: messageSearchData } = useQuery({
    queryKey: ["message-search", debouncedQuery],
    queryFn: () => api.conversations.search(debouncedQuery),
    enabled: Boolean(searchQuery) && searchQuery.length >= 3,
  });
  const messageHits: SearchHit[] = searchQuery ? (messageSearchData?.results ?? []) : [];

  const updateQuery = useMemo(() => debounce(setDebouncedQuery, 250), []);

  const activeId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : undefined;
  const activeProject = projects?.find((project) => project.id === projectId);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof conversations>();
    for (const conversation of conversations) {
      const group = dateGroup(conversation.updatedAt);
      const bucket = groups.get(group);
      if (bucket) bucket.push(conversation);
      else groups.set(group, [conversation]);
    }
    return [...groups.entries()];
  }, [conversations]);

  const go = (path: string) => {
    router.push(path);
    onClose();
  };

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const invalidateConversations = () => {
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const runBulk = async (action: "archive" | "unarchive" | "delete" | "pin" | "unpin") => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    try {
      await api.conversations.bulk(action, ids);
      toast({ kind: "success", title: `${ids.length} conversation${ids.length === 1 ? "" : "s"} updated` });
      setSelectedIds(new Set());
      setBulkMode(false);
      invalidateConversations();
    } catch (error) {
      toast({ kind: "error", title: "Bulk action failed", description: toErrorMessage(error) });
    }
  };

  const applyTagToSelection = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const tag = window.prompt("Tag to add:", "");
    if (!tag?.trim()) return;
    try {
      await api.conversations.tag(ids, tag.trim());
      toast({ kind: "success", title: `Tagged ${ids.length} conversations` });
      invalidateConversations();
    } catch (error) {
      toast({ kind: "error", title: "Could not apply tag", description: toErrorMessage(error) });
    }
  };

  const applyColorToSelection = async (color: string) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    try {
      await Promise.all(ids.map((id) => api.conversations.update(id, { color })));
      toast({ kind: "success", title: "Color applied" });
      invalidateConversations();
    } catch (error) {
      toast({ kind: "error", title: "Could not apply color", description: toErrorMessage(error) });
    }
  };

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-line bg-surface transition-transform lg:static lg:translate-x-0 print:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Conversations"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-3">
          <button
            type="button"
            onClick={() => go("/chat")}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-fg transition-colors hover:bg-surface"
          >
            <LogoMark size={24} />
            Tikjap<span className="font-normal text-muted"> AI</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-line/40 hover:text-fg lg:hidden"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-2 p-3">
          <button
            type="button"
            onClick={() => go("/chat")}
            className="flex w-full items-center gap-2 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden />
            New chat
          </button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                updateQuery(event.target.value);
              }}
              placeholder="Search titles and messages"
              aria-label="Search conversations and messages"
              className="w-full rounded-lg border border-line bg-elevated py-2 pl-9 pr-3 text-sm text-fg placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <div className="mb-2 flex gap-1" role="tablist" aria-label="Conversation filters">
            {VIEWS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={view === entry.id}
                onClick={() => setView(entry.id)}
                className={cn(
                  "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                  view === entry.id ? "bg-elevated text-fg ring-1 ring-line" : "text-muted hover:bg-elevated/60 hover:text-fg"
                )}
              >
                {entry.label}
              </button>
            ))}
            <button
              type="button"
              role="tab"
              aria-selected={bulkMode}
              aria-label="Toggle bulk selection"
              onClick={() => {
                setBulkMode((current) => !current);
                setSelectedIds(new Set());
              }}
              className={cn(
                "rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                bulkMode ? "bg-elevated text-fg ring-1 ring-line" : "text-muted hover:bg-elevated/60 hover:text-fg"
              )}
            >
              <CheckSquare className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          {bulkMode && selectedIds.size > 0 ? (
            <div className="mb-3 space-y-2 rounded-xl border border-line p-2">
              <p className="text-[11px] font-medium text-muted">{selectedIds.size} selected</p>
              <div className="flex flex-wrap gap-1">
                <BulkAction label="Pin" onClick={() => void runBulk("pin")} />
                <BulkAction label="Archive" onClick={() => void runBulk("archive")} />
                <BulkAction label="Unarchive" onClick={() => void runBulk("unarchive")} />
                <BulkAction icon={<Tag className="h-3 w-3" aria-hidden />} label="Tag" onClick={() => void applyTagToSelection()} />
                <BulkAction icon={<Trash2 className="h-3 w-3" aria-hidden />} label="Delete" danger onClick={() => void runBulk("delete")} />
              </div>
              <div className="flex items-center gap-1.5">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color || "none"}
                    type="button"
                    aria-label={color ? `Apply ${color} label` : "Clear color"}
                    onClick={() => void applyColorToSelection(color)}
                    className={cn(
                      "h-4 w-4 rounded-full border border-line",
                      color ? COLOR_DOT[color] : "bg-transparent"
                    )}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {projects && projects.length > 0 ? (
            <div className="mb-3">
              <div className="flex flex-wrap gap-1">
                {projectId ? (
                  <button
                    type="button"
                    onClick={() => setProjectId(undefined)}
                    className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent ring-1 ring-accent/30"
                  >
                    <FolderOpen className="h-3 w-3" aria-hidden />
                    {activeProject?.name ?? "Project"}
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                ) : (
                  projects.slice(0, 6).map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setProjectId(project.id)}
                      title={project.name}
                      className="inline-flex max-w-36 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-elevated hover:text-fg"
                    >
                      <Folder className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">{project.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted">
              {debouncedQuery
                ? "No conversations match your search."
                : view === "archived"
                  ? "No archived conversations."
                  : view === "pinned"
                    ? "Pin conversations to find them here."
                    : projectId
                      ? "No conversations in this project yet."
                      : "No conversations yet. Start a new chat!"}
            </p>
          ) : bulkMode ? (
            <ul className="space-y-0.5">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => toggleSelected(conversation.id)}
                    aria-pressed={selectedIds.has(conversation.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                      selectedIds.has(conversation.id) ? "bg-elevated ring-1 ring-line" : "hover:bg-elevated/60"
                    )}
                  >
                    {selectedIds.has(conversation.id) ? (
                      <CheckSquare className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                    ) : (
                      <Square className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{conversation.title}</span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"} • {timeAgo(conversation.updatedAt)}
                      </span>
                    </span>
                    {conversation.color && COLOR_DOT[conversation.color] ? (
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", COLOR_DOT[conversation.color])} aria-hidden />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            grouped.map(([label, items]) => (
              <section key={label} className="mb-3">
                <h3 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</h3>
                <ul className="space-y-0.5">
                  {items.map((conversation) => {
                    const active = conversation.id === activeId;
                    return (
                      <li key={conversation.id}>
                        <a
                          href={`/chat/${conversation.id}`}
                          onClick={(event) => {
                            event.preventDefault();
                            go(`/chat/${conversation.id}`);
                          }}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "block w-full rounded-lg px-3 py-2 text-left transition-colors",
                            active ? "bg-elevated shadow-sm ring-1 ring-line" : "hover:bg-elevated/60"
                          )}
                        >
                          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-fg">
                            {conversation.pinned ? <Pin className="h-3 w-3 shrink-0 text-accent" aria-hidden /> : null}
                            {conversation.color && COLOR_DOT[conversation.color] ? (
                              <span className={cn("h-2 w-2 shrink-0 rounded-full", COLOR_DOT[conversation.color])} aria-hidden />
                            ) : null}
                            <span className="truncate">{conversation.title}</span>
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
                            <span className="truncate">
                              {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"} • {timeAgo(conversation.updatedAt)}
                            </span>
                            {(conversation.tags ?? []).slice(0, 2).map((tag) => (
                              <span key={tag} className="shrink-0 rounded-full bg-elevated px-1.5 py-0.5 text-[10px] text-muted ring-1 ring-line">
                                #{tag}
                              </span>
                            ))}
                          </p>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}

          {messageHits.length > 0 ? (
            <section className="mb-3">
              <h3 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Matching messages</h3>
              <ul className="space-y-0.5">
                {messageHits.slice(0, 8).map((hit) => (
                  <li key={hit.messageId}>
                    <a
                      href={`/chat/${hit.conversationId}`}
                      onClick={(event) => {
                        event.preventDefault();
                        go(`/chat/${hit.conversationId}`);
                      }}
                      className="block rounded-lg px-3 py-2 transition-colors hover:bg-elevated/60"
                    >
                      <p className="truncate text-xs font-medium text-fg">{hit.conversationTitle}</p>
                      <p className="line-clamp-2 text-[11px] text-muted">{hit.snippet}</p>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </nav>

        <div className="border-t border-line p-3">
          <Dropdown
            align="start"
            trigger={({ ref, toggle, "aria-expanded": expanded }) => (
              <button
                ref={ref}
                type="button"
                aria-expanded={expanded}
                aria-label="Open account menu"
                onClick={toggle}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-elevated/60"
              >
                <Avatar name={user?.name ?? "?"} src={user?.avatarUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{user?.name}</span>
                  <span className="block truncate text-xs text-muted">{user?.email}</span>
                </span>
              </button>
            )}
            className="bottom-full top-auto mb-1.5 left-0 right-auto min-w-56"
          >
            {({ close }) => (
              <>
                <DropdownItem
                  icon={<Settings className="h-4 w-4" aria-hidden />}
                  onSelect={() => {
                    close();
                    go("/settings/account");
                  }}
                >
                  Settings
                </DropdownItem>
                {user?.role === "admin" ? (
                  <DropdownItem
                    icon={<Shield className="h-4 w-4" aria-hidden />}
                    onSelect={() => {
                      close();
                      go("/admin");
                    }}
                  >
                    Admin dashboard
                  </DropdownItem>
                ) : null}
                <DropdownItem onSelect={handleLogout}>Sign out</DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      </aside>
    </>
  );
}

function BulkAction({
  label,
  icon,
  onClick,
  danger,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
        danger
          ? "border-danger/30 text-danger hover:bg-danger/10"
          : "border-line text-muted hover:bg-elevated hover:text-fg"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
