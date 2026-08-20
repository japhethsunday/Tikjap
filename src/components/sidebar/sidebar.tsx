"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquarePlus, Search, Settings, Shield, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useConversations } from "@/hooks/use-conversations";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/primitives";
import { Dropdown, DropdownItem } from "@/components/ui/overlays";
import { timeAgo, cn, debounce } from "@/lib/utils";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchQuery = query ? debouncedQuery : "";
  const { conversations, isLoading } = useConversations(searchQuery || undefined);

  const updateQuery = useMemo(() => debounce(setDebouncedQuery, 250), []);

  const activeId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : undefined;

  const go = (path: string) => {
    router.push(path);
    onClose();
  };

  const handleLogout = async () => {
    await logout();
    onClose();
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
          "fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-line bg-surface transition-transform lg:static lg:translate-x-0",
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
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-xs font-bold text-white">
              T
            </span>
            Tikjap AI
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
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="w-full rounded-lg border border-line bg-elevated py-2 pl-9 pr-3 text-sm text-fg placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-8 text-center text-xs text-muted">
              {debouncedQuery ? "No conversations match your search." : "No conversations yet. Start a new chat!"}
            </p>
          ) : (
            <ul className="space-y-0.5">
              {conversations.map((conversation) => {
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
                      <p className="truncate text-sm font-medium text-fg">{conversation.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {conversation.messageCount} message{conversation.messageCount === 1 ? "" : "s"} • {timeAgo(conversation.updatedAt)}
                      </p>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
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