import type { ProjectFile } from "@/lib/types";

/**
 * Turns the flat (path, content) rows into the tree the explorer renders.
 *
 * Paths are the source of truth, so directories are inferred rather than
 * stored. That means an empty directory cannot exist — which matches how the
 * files are actually persisted, and avoids a class of bug where the tree and
 * the file list disagree.
 */

export interface TreeFile {
  kind: "file";
  name: string;
  path: string;
  file: ProjectFile;
}

export interface TreeDir {
  kind: "dir";
  name: string;
  path: string;
  children: TreeNode[];
}

export type TreeNode = TreeFile | TreeDir;

/** Directories first, then files, each alphabetical and case-insensitive. */
function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  // Directory lookup keyed by full path, so each level is created once however
  // many files share it.
  const dirs = new Map<string, TreeDir>();

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const segments = file.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    const fileName = segments[segments.length - 1];
    const dirSegments = segments.slice(0, -1);

    let container = root;
    let prefix = "";
    for (const segment of dirSegments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      let dir = dirs.get(prefix);
      if (!dir) {
        dir = { kind: "dir", name: segment, path: prefix, children: [] };
        dirs.set(prefix, dir);
        container.push(dir);
      }
      container = dir.children;
    }

    container.push({ kind: "file", name: fileName, path: file.path, file });
  }

  const sortRecursive = (nodes: TreeNode[]): TreeNode[] => {
    for (const node of nodes) {
      if (node.kind === "dir") sortRecursive(node.children);
    }
    return sortNodes(nodes);
  };

  return sortRecursive(root);
}

/** Every directory path in the tree — used to expand the explorer by default. */
export function collectDirPaths(nodes: TreeNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind === "dir") {
      into.push(node.path);
      collectDirPaths(node.children, into);
    }
  }
  return into;
}
