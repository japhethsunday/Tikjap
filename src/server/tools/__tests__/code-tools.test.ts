import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The file tools are the only ones that write anything durable, so the
 * properties worth pinning down are: they refuse to act without a project, they
 * pass the caller's own userId through to the ownership check, and they never
 * throw — a failure has to come back as an observation the model can react to.
 */

const listProjectFiles = vi.fn();
const writeProjectFile = vi.fn();
const deleteProjectFile = vi.fn();
const runProjectFile = vi.fn();

vi.mock("../../code", () => ({
  listProjectFiles: (...args: unknown[]) => listProjectFiles(...args),
  writeProjectFile: (...args: unknown[]) => writeProjectFile(...args),
  deleteProjectFile: (...args: unknown[]) => deleteProjectFile(...args),
  runProjectFile: (...args: unknown[]) => runProjectFile(...args),
}));

import { CODE_TOOLS, listFilesTool, readFileTool, runFileTool, writeFileTool } from "../code-tools";
import { HttpError } from "../../errors";
import type { ToolRunContext } from "../types";

function context(overrides: Partial<ToolRunContext> = {}): ToolRunContext {
  return {
    userId: "user-1",
    conversationId: "conv-1",
    messageId: "msg-1",
    attachments: [],
    projectId: "project-1",
    signal: new AbortController().signal,
    onProgress: () => undefined,
    ...overrides,
  };
}

const sampleFile = {
  id: "file-1",
  path: "src/index.js",
  content: "console.log('hi');",
  language: "javascript",
  sizeBytes: 18,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  listProjectFiles.mockReset();
  writeProjectFile.mockReset();
  deleteProjectFile.mockReset();
  runProjectFile.mockReset();
});

describe("code tool definitions", () => {
  it("marks every code tool as requiring a project", () => {
    expect(CODE_TOOLS.every((tool) => tool.requiresProject)).toBe(true);
  });

  it("registers the expected tools", () => {
    expect(CODE_TOOLS.map((tool) => tool.id).sort()).toEqual([
      "code_delete_file",
      "code_list_files",
      "code_read_file",
      "code_run_file",
      "code_write_file",
    ]);
  });
});

describe("project scoping", () => {
  it.each(CODE_TOOLS.map((tool) => [tool.id, tool] as const))(
    "%s refuses to act with no project in context",
    async (_id, tool) => {
      const result = await tool.run({ path: "src/index.js", content: "x" }, context({ projectId: undefined }));
      expect(result.ok).toBe(false);
      expect(result.summary).toMatch(/no project/i);
      // Crucially it must not have reached the data layer at all.
      expect(listProjectFiles).not.toHaveBeenCalled();
      expect(writeProjectFile).not.toHaveBeenCalled();
      expect(deleteProjectFile).not.toHaveBeenCalled();
    }
  );

  it("passes the caller's own userId to the ownership check", async () => {
    listProjectFiles.mockResolvedValue([sampleFile]);
    await listFilesTool.run({}, context({ userId: "user-42", projectId: "project-9" }));
    // A tool cannot substitute another user; the id comes from the session.
    expect(listProjectFiles).toHaveBeenCalledWith("user-42", "project-9");
  });

  it("surfaces an ownership failure as a readable observation, not a throw", async () => {
    listProjectFiles.mockRejectedValue(new HttpError(404, "not_found", "Project not found."));
    const result = await listFilesTool.run({}, context());
    expect(result.ok).toBe(false);
    expect(result.summary).toBe("Project not found.");
  });

  it("does not leak internal detail from an unexpected failure", async () => {
    listProjectFiles.mockRejectedValue(new Error("connection string postgres://secret@host"));
    const result = await listFilesTool.run({}, context());
    expect(result.ok).toBe(false);
    expect(result.summary).not.toContain("postgres://");
  });
});

describe("read", () => {
  it("returns the file contents in a fenced block", async () => {
    listProjectFiles.mockResolvedValue([sampleFile]);
    const result = await readFileTool.run({ path: "src/index.js" }, context());
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("console.log('hi');");
    expect(result.summary).toContain("```javascript");
  });

  it("suggests nearby paths when the file is missing", async () => {
    listProjectFiles.mockResolvedValue([sampleFile]);
    const result = await readFileTool.run({ path: "index.js" }, context());
    expect(result.ok).toBe(false);
    // A dead end the model can recover from beats a bare "not found".
    expect(result.summary).toMatch(/did you mean/i);
    expect(result.summary).toContain("src/index.js");
  });

  it("rejects an empty path", async () => {
    const result = await readFileTool.run({ path: "  " }, context());
    expect(result.ok).toBe(false);
    expect(listProjectFiles).not.toHaveBeenCalled();
  });
});

describe("write", () => {
  it("reports a creation and carries the before/after for the diff", async () => {
    listProjectFiles.mockResolvedValue([]);
    writeProjectFile.mockResolvedValue({ ...sampleFile, path: "src/new.js", content: "const a = 1;", sizeBytes: 12 });

    const result = await writeFileTool.run({ path: "src/new.js", content: "const a = 1;" }, context());
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/^Created src\/new\.js/);
    expect(result.data).toMatchObject({ created: true, before: "", after: "const a = 1;" });
  });

  it("reports an update and includes the previous contents", async () => {
    listProjectFiles.mockResolvedValue([sampleFile]);
    writeProjectFile.mockResolvedValue({ ...sampleFile, content: "console.log('bye');" });

    const result = await writeFileTool.run({ path: "src/index.js", content: "console.log('bye');" }, context());
    expect(result.summary).toMatch(/^Updated/);
    expect(result.data).toMatchObject({ created: false, before: "console.log('hi');" });
  });

  it("refuses a write with no content rather than blanking the file", async () => {
    const result = await writeFileTool.run({ path: "src/index.js" }, context());
    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/complete file/i);
    expect(writeProjectFile).not.toHaveBeenCalled();
  });

  it("allows an intentional empty write", async () => {
    listProjectFiles.mockResolvedValue([sampleFile]);
    writeProjectFile.mockResolvedValue({ ...sampleFile, content: "", sizeBytes: 0 });
    const result = await writeFileTool.run({ path: "src/index.js", content: "" }, context());
    expect(result.ok).toBe(true);
  });
});

describe("run", () => {
  it("reports real output and marks a failure as failed", async () => {
    listProjectFiles.mockResolvedValue([sampleFile]);
    runProjectFile.mockResolvedValue({
      ok: false,
      logs: ["before the error"],
      error: "ReferenceError: x is not defined",
      durationMs: 4,
      timedOut: false,
    });

    const result = await runFileTool.run({ path: "src/index.js" }, context());
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("ReferenceError");
    expect(result.summary).toContain("before the error");
  });

  it("passes the abort signal through so Stop cancels execution", async () => {
    listProjectFiles.mockResolvedValue([sampleFile]);
    runProjectFile.mockResolvedValue({ ok: true, logs: [], durationMs: 1, timedOut: false });
    const controller = new AbortController();
    await runFileTool.run({ path: "src/index.js" }, context({ signal: controller.signal }));
    expect(runProjectFile).toHaveBeenCalledWith("user-1", "project-1", "file-1", controller.signal);
  });
});
