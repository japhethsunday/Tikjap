import {
  deleteProjectFile,
  listProjectFiles,
  runProjectFile,
  writeProjectFile,
} from "../code";
import { HttpError } from "../errors";
import type { ServerToolDefinition, ToolRunResult } from "./types";

/**
 * The file tools available inside the Code workspace.
 *
 * These are the only tools that write anything durable on the user's behalf, so
 * three properties matter:
 *
 *  - Every one goes through src/server/code.ts, which checks project ownership
 *    before touching a row. A tool cannot reach a project the caller does not
 *    own even if the model asks it to.
 *  - They are marked `requiresProject`, so they are never offered to the
 *    planner on an ordinary chat turn — a conversation outside the workspace
 *    has no path to project files at all.
 *  - A write reports the before and after size so the answer can describe the
 *    change honestly, and the UI can show a diff rather than taking the model's
 *    word for what it did.
 */

const MAX_READ_CHARS = 40_000;

function failure(error: unknown, fallback: string): ToolRunResult {
  // HttpError messages are already written for a user to read.
  if (error instanceof HttpError) return { ok: false, summary: error.message };
  return { ok: false, summary: fallback };
}

export const listFilesTool: ServerToolDefinition = {
  id: "code_list_files",
  name: "List Project Files",
  description:
    "List every file in the current project with its path and size. Use this first to understand the project's structure before reading or changing anything.",
  requiresProject: true,
  parameters: { type: "object", properties: {}, required: [] },
  async run(_input, context): Promise<ToolRunResult> {
    if (!context.projectId) return { ok: false, summary: "No project is open." };
    context.onProgress({ stage: "listing", progress: 0.5, message: "Reading project structure" });
    try {
      const files = await listProjectFiles(context.userId, context.projectId);
      if (files.length === 0) {
        return { ok: true, summary: "The project has no files yet.", data: { files: [] } };
      }
      const summary = [
        `The project contains ${files.length} file${files.length === 1 ? "" : "s"}:`,
        "",
        ...files.map((file) => `- ${file.path} (${file.sizeBytes} bytes${file.language ? `, ${file.language}` : ""})`),
      ].join("\n");
      return {
        ok: true,
        summary,
        data: { files: files.map((file) => ({ path: file.path, sizeBytes: file.sizeBytes })) },
      };
    } catch (error) {
      return failure(error, "Could not list the project's files.");
    }
  },
};

export const readFileTool: ServerToolDefinition = {
  id: "code_read_file",
  name: "Read Project File",
  description:
    "Read the full contents of one file in the current project by its path. Always read a file before editing it, so the rewrite is based on what is actually there.",
  requiresProject: true,
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Path of the file to read, e.g. src/index.js" } },
    required: ["path"],
  },
  async run(input, context): Promise<ToolRunResult> {
    if (!context.projectId) return { ok: false, summary: "No project is open." };
    const path = String(input.path ?? "").trim();
    if (!path) return { ok: false, summary: "No file path was given." };

    context.onProgress({ stage: "reading", progress: 0.5, message: `Reading ${path}` });
    try {
      const files = await listProjectFiles(context.userId, context.projectId);
      const file = files.find((entry) => entry.path === path);
      if (!file) {
        // Naming the nearby paths turns a dead end into a recoverable step.
        const nearby = files
          .filter((entry) => entry.path.includes(path) || path.includes(entry.path.split("/").pop() ?? ""))
          .slice(0, 5)
          .map((entry) => entry.path);
        return {
          ok: false,
          summary:
            `There is no file at "${path}".` +
            (nearby.length ? ` Did you mean one of: ${nearby.join(", ")}?` : " Use List Project Files to see what exists."),
        };
      }
      const truncated = file.content.length > MAX_READ_CHARS;
      const content = truncated ? file.content.slice(0, MAX_READ_CHARS) : file.content;
      return {
        ok: true,
        summary: [
          `Contents of ${file.path}:`,
          "",
          "```" + (file.language ?? ""),
          content,
          "```",
          truncated ? "\n[file truncated]" : "",
        ].join("\n"),
        data: { path: file.path, sizeBytes: file.sizeBytes, truncated },
      };
    } catch (error) {
      return failure(error, "Could not read that file.");
    }
  },
};

export const writeFileTool: ServerToolDefinition = {
  id: "code_write_file",
  name: "Write Project File",
  description:
    "Create a file or replace its entire contents. You must pass the complete new file, not a fragment or a patch — anything omitted is deleted. Read the file first unless you are creating it.",
  requiresProject: true,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path of the file to write, e.g. src/index.js" },
      content: { type: "string", description: "The complete new contents of the file." },
    },
    required: ["path", "content"],
  },
  async run(input, context): Promise<ToolRunResult> {
    if (!context.projectId) return { ok: false, summary: "No project is open." };
    const path = String(input.path ?? "").trim();
    if (!path) return { ok: false, summary: "No file path was given." };
    if (typeof input.content !== "string") {
      return { ok: false, summary: "No content was given. A write must include the complete file." };
    }

    context.onProgress({ stage: "writing", progress: 0.5, message: `Writing ${path}` });
    try {
      // Capture the previous contents so the client can show a real diff rather
      // than trusting the model's description of its own edit.
      const existing = (await listProjectFiles(context.userId, context.projectId)).find(
        (entry) => entry.path === path
      );
      const file = await writeProjectFile(context.userId, context.projectId, {
        path,
        content: input.content,
      });
      const verb = existing ? "Updated" : "Created";
      return {
        ok: true,
        summary: `${verb} ${file.path} (${file.sizeBytes} bytes). The change is shown to the user as a diff — describe what you changed and why, do not repeat the whole file.`,
        data: {
          path: file.path,
          created: !existing,
          before: existing?.content ?? "",
          after: file.content,
          sizeBytes: file.sizeBytes,
        },
      };
    } catch (error) {
      return failure(error, "Could not write that file.");
    }
  },
};

export const deleteFileTool: ServerToolDefinition = {
  id: "code_delete_file",
  name: "Delete Project File",
  description:
    "Delete one file from the current project. Only use this when the user has asked for the file to be removed.",
  requiresProject: true,
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Path of the file to delete." } },
    required: ["path"],
  },
  async run(input, context): Promise<ToolRunResult> {
    if (!context.projectId) return { ok: false, summary: "No project is open." };
    const path = String(input.path ?? "").trim();
    if (!path) return { ok: false, summary: "No file path was given." };
    try {
      const file = (await listProjectFiles(context.userId, context.projectId)).find(
        (entry) => entry.path === path
      );
      if (!file) return { ok: false, summary: `There is no file at "${path}".` };
      await deleteProjectFile(context.userId, context.projectId, file.id);
      return { ok: true, summary: `Deleted ${path}.`, data: { path, deleted: true } };
    } catch (error) {
      return failure(error, "Could not delete that file.");
    }
  },
};

export const runFileTool: ServerToolDefinition = {
  id: "code_run_file",
  name: "Run Project File",
  description:
    "Execute one JavaScript file from the project in a sandbox and return its console output, return value and any error. Use this to verify a change actually works. Only JavaScript runs — the sandbox has no filesystem, network or package installation.",
  requiresProject: true,
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "Path of the JavaScript file to run." } },
    required: ["path"],
  },
  async run(input, context): Promise<ToolRunResult> {
    if (!context.projectId) return { ok: false, summary: "No project is open." };
    const path = String(input.path ?? "").trim();
    if (!path) return { ok: false, summary: "No file path was given." };

    context.onProgress({ stage: "executing", progress: 0.5, message: `Running ${path}` });
    try {
      const file = (await listProjectFiles(context.userId, context.projectId)).find(
        (entry) => entry.path === path
      );
      if (!file) return { ok: false, summary: `There is no file at "${path}".` };

      const result = await runProjectFile(context.userId, context.projectId, file.id, context.signal);
      const parts = [`Ran ${path} (${result.durationMs} ms):`];
      if (result.logs.length) parts.push("", "Console output:", "```", result.logs.join("\n"), "```");
      if (result.ok && result.result) parts.push("", `Return value: ${result.result}`);
      if (!result.ok) parts.push("", `Error: ${result.error ?? "the script failed"}`);
      parts.push("", "This is real output from an actual execution. Report it accurately, including failures.");

      return {
        ok: result.ok,
        summary: parts.join("\n"),
        data: { path, ...result },
      };
    } catch (error) {
      return failure(error, "Could not run that file.");
    }
  },
};

export const CODE_TOOLS: ServerToolDefinition[] = [
  listFilesTool,
  readFileTool,
  writeFileTool,
  deleteFileTool,
  runFileTool,
];
