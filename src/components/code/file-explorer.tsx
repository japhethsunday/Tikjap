"use client";

import { useMemo, useState } from "react";
import { ChevronRight, File as FileIcon, FolderClosed, FolderOpen, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildTree, collectDirPaths, type TreeNode } from "@/lib/code/tree";
import type { ProjectFile } from "@/lib/types";

interface FileExplorerProps {
  files: ProjectFile[];
  activePath?: string;
  onOpen: (file: ProjectFile) => void;
  onCreate: () => void;
  onDelete: (file: ProjectFile) => void;
  dirtyPaths: Set<string>;
}

export function FileExplorer({ files, activePath, onOpen, onCreate, onDelete, dirtyPaths }: FileExplorerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return files;
    return files.filter((file) => file.path.toLowerCase().includes(term));
  }, [files, query]);

  const tree = useMemo(() => buildTree(filtered), [filtered]);

  // Everything starts expanded; searching re-expands so matches deep in the
  // tree are visible without clicking through each level.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const allDirs = useMemo(() => collectDirPaths(tree), [tree]);
  const effectiveCollapsed = query.trim() ? new Set<string>() : collapsed;

  const toggleDir = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const indent = { paddingLeft: `${depth * 12 + 8}px` };
      if (node.kind === "dir") {
        const isCollapsed = effectiveCollapsed.has(node.path);
        return (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => toggleDir(node.path)}
              aria-expanded={!isCollapsed}
              style={indent}
              className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[13px] text-muted transition-colors hover:bg-elevated hover:text-fg"
            >
              <ChevronRight
                className={cn("h-3 w-3 shrink-0 transition-transform", !isCollapsed && "rotate-90")}
                aria-hidden
              />
              {isCollapsed ? (
                <FolderClosed className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <span className="truncate">{node.name}</span>
            </button>
            {!isCollapsed ? <ul>{renderNodes(node.children, depth + 1)}</ul> : null}
          </li>
        );
      }

      const active = node.path === activePath;
      const dirty = dirtyPaths.has(node.path);
      return (
        <li key={node.path} className="group/file relative">
          <button
            type="button"
            onClick={() => onOpen(node.file)}
            aria-current={active ? "true" : undefined}
            style={indent}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md py-1 pr-8 text-left text-[13px] transition-colors",
              active ? "bg-elevated font-medium text-fg" : "text-muted hover:bg-elevated/70 hover:text-fg"
            )}
          >
            <span className="w-3 shrink-0" aria-hidden />
            <FileIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{node.name}</span>
            {dirty ? (
              <span
                className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                aria-label="Unsaved changes"
              />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => onDelete(node.file)}
            aria-label={`Delete ${node.path}`}
            className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1 text-muted transition-colors hover:bg-danger/10 hover:text-danger group-hover/file:block"
          >
            <Trash2 className="h-3 w-3" aria-hidden />
          </button>
        </li>
      );
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 px-3 pb-2 pt-3">
        <h2 className="flex-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Files</h2>
        <button
          type="button"
          onClick={onCreate}
          aria-label="New file"
          className="rounded-md p-1 text-muted transition-colors hover:bg-elevated hover:text-fg"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a file…"
            aria-label="Search files in this project"
            className="w-full rounded-lg border border-line bg-canvas py-1.5 pl-8 pr-2 text-xs text-fg placeholder:text-muted/60 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      </div>

      <nav aria-label="Project files" className="min-h-0 flex-1 overflow-y-auto pb-3">
        {files.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">
            No files yet. Create one to get started.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">No files match “{query}”.</p>
        ) : (
          <ul>{renderNodes(tree, 0)}</ul>
        )}
      </nav>

      {files.length > 0 ? (
        <p className="border-t border-line px-3 py-2 text-[11px] text-muted">
          {files.length} file{files.length === 1 ? "" : "s"}
          {allDirs.length ? ` · ${allDirs.length} folder${allDirs.length === 1 ? "" : "s"}` : ""}
        </p>
      ) : null}
    </div>
  );
}
