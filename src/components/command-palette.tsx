"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Search, Settings, Folder, Bookmark } from "lucide-react";
import { api } from "@/lib/api";
import { useConversations } from "@/hooks/use-conversations";
import { useProjects } from "@/hooks/use-platform";
import type { SearchHit } from "@/lib/types";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const { conversations } = useConversations({});
  const { data: projectsData } = useProjects();
  const { data: searchData } = useQuerySafe(query);

  const commands = useMemo<Command[]>(() => {
    const projects = projectsData?.projects ?? [];
    const messageHits: SearchHit[] = query.trim().length >= 3 ? (searchData?.results ?? []) : [];
    const navCommands: Command[] = [
      {
        id: "nav-new-chat",
        label: "Start a new chat",
        icon: <MessageSquare className="h-4 w-4" aria-hidden />,
        run: () => router.push("/chat"),
      },
      {
        id: "nav-projects",
        label: "Open projects",
        icon: <Folder className="h-4 w-4" aria-hidden />,
        run: () => router.push("/projects"),
      },
      {
        id: "nav-settings",
        label: "Open settings",
        icon: <Settings className="h-4 w-4" aria-hidden />,
        run: () => router.push("/settings/account"),
      },
      {
        id: "nav-bookmarks",
        label: "Browse bookmarks",
        hint: "starred messages",
        icon: <Bookmark className="h-4 w-4" aria-hidden />,
        run: () => router.push("/bookmarks"),
      },
    ];
    const conversationCommands: Command[] = conversations
      .filter((conversation) =>
        query ? conversation.title.toLowerCase().includes(query.toLowerCase()) : true
      )
      .slice(0, 8)
      .map((conversation) => ({
        id: `conv-${conversation.id}`,
        label: conversation.title,
        hint: `${conversation.messageCount} messages`,
        icon: <MessageSquare className="h-4 w-4" aria-hidden />,
        run: () => router.push(`/chat/${conversation.id}`),
      }));
    const projectCommands: Command[] = projects
      .filter((project) => (query ? project.name.toLowerCase().includes(query.toLowerCase()) : true))
      .slice(0, 4)
      .map((project) => ({
        id: `proj-${project.id}`,
        label: project.name,
        hint: "project",
        icon: <Folder className="h-4 w-4" aria-hidden />,
        run: () => router.push("/projects"),
      }));
    const messageCommands: Command[] = messageHits.slice(0, 5).map((hit) => ({
      id: `msg-${hit.messageId}`,
      label: hit.snippet,
      hint: hit.conversationTitle,
      icon: <Search className="h-4 w-4" aria-hidden />,
      run: () => router.push(`/chat/${hit.conversationId}`),
    }));
    return [...navCommands, ...conversationCommands, ...projectCommands, ...messageCommands];
  }, [conversations, projectsData, searchData, query, router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 px-4 pt-[12vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-elevated shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, commands.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              commands[activeIndex]?.run();
              setOpen(false);
              setQuery("");
            }
          }}
          placeholder="Search chats, projects and actions…"
          aria-label="Search commands"
          className="w-full border-b border-line bg-transparent px-4 py-3.5 text-sm text-fg placeholder:text-muted/70 focus:outline-none"
        />
        <ul role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {commands.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted">Nothing found.</li>
          ) : (
            commands.map((command, index) => (
              <li key={command.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    command.run();
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    index === activeIndex ? "bg-surface text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  <span className="shrink-0 text-muted">{command.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{command.label}</span>
                  {command.hint ? <span className="shrink-0 text-[11px] text-muted">{command.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
          ↑↓ to navigate · Enter to open · Esc to close
        </p>
      </div>
    </div>
  );
}

function useQuerySafe(query: string) {
  return useQuery({
    queryKey: ["palette-message-search", query],
    queryFn: () => api.conversations.search(query),
    enabled: query.trim().length >= 3,
  });
}
