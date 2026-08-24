import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * End-to-end coverage of the orchestration loop:
 *
 *   prompt → planner asks for a tool → tool executes → observation returned
 *
 * The upstream planner is stubbed (it is an HTTP call to the inference
 * gateway), but everything downstream is the real code path: the real
 * registry, the real rate limiter, and the real QuickJS sandbox actually
 * running the code the "model" asked for.
 */

const planMock = vi.fn();

vi.mock("../../providers/nim", () => ({
  planWithTools: (...args: unknown[]) => planMock(...args),
}));

import { orchestrate, type OrchestrateParams } from "../orchestrator";

function makeParams(overrides: Partial<OrchestrateParams> = {}): OrchestrateParams {
  return {
    userId: `user-${Math.random().toString(36).slice(2)}`,
    conversationId: "conv-1",
    messageId: "msg-1",
    prompt: "what is 6 * 7?",
    history: [],
    enabledTools: ["code_execution"],
    attachments: [],
    upstreamModel: "test-model",
    signal: new AbortController().signal,
    onToolStart: () => undefined,
    onToolProgress: () => undefined,
    onToolEnd: () => undefined,
    ...overrides,
  };
}

beforeEach(() => {
  planMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("orchestrate", () => {
  it("does nothing when no tools are enabled", async () => {
    const result = await orchestrate(makeParams({ enabledTools: [] }));
    expect(result.calls).toEqual([]);
    expect(result.observations).toEqual([]);
    expect(planMock).not.toHaveBeenCalled();
  });

  it("returns no observations when the planner asks for nothing", async () => {
    planMock.mockResolvedValue({ toolCalls: [], content: "no tool needed" });
    const result = await orchestrate(makeParams());
    expect(result.calls).toEqual([]);
    expect(result.observations).toEqual([]);
  });

  it("runs the requested tool and feeds a real result back as an observation", async () => {
    planMock.mockResolvedValue({
      toolCalls: [{ id: "call_1", name: "code_execution", arguments: { code: "6 * 7" } }],
      content: "",
    });

    const result = await orchestrate(makeParams());

    expect(result.calls).toHaveLength(1);
    expect(result.calls[0].toolId).toBe("code_execution");
    expect(result.calls[0].ok).toBe(true);
    // The sandbox genuinely executed; 42 is computed, not echoed from the plan.
    expect(result.calls[0].summary).toContain("42");

    // Observations are appended as system messages plus the grounding note.
    expect(result.observations).toHaveLength(2);
    expect(result.observations[0].role).toBe("system");
    expect(result.observations[0].content).toContain("Code Execution");
    expect(result.observations[0].content).toContain("42");
    expect(result.observations[1].content).toMatch(/authoritative/i);
  });

  it("emits start, progress and end events in order", async () => {
    planMock.mockResolvedValue({
      toolCalls: [{ id: "call_1", name: "code_execution", arguments: { code: "1+1" } }],
      content: "",
    });

    const events: string[] = [];
    await orchestrate(
      makeParams({
        onToolStart: (call) => events.push(`start:${call.toolId}`),
        onToolProgress: (_id, progress) => events.push(`progress:${progress.stage}`),
        onToolEnd: (record) => events.push(`end:${record.ok}`),
      })
    );

    expect(events[0]).toBe("start:code_execution");
    expect(events).toContain("progress:executing");
    expect(events[events.length - 1]).toBe("end:true");
  });

  it("drops tool calls the user did not enable", async () => {
    planMock.mockResolvedValue({
      toolCalls: [
        { id: "a", name: "web_search", arguments: { query: "x" } },
        { id: "b", name: "code_execution", arguments: { code: "1" } },
      ],
      content: "",
    });

    // Only code_execution is enabled; a planner asking for web_search anyway
    // must not cause it to run.
    const result = await orchestrate(makeParams({ enabledTools: ["code_execution"] }));
    expect(result.calls.map((call) => call.toolId)).toEqual(["code_execution"]);
  });

  it("ignores a hallucinated tool name", async () => {
    planMock.mockResolvedValue({
      toolCalls: [{ id: "a", name: "delete_everything", arguments: {} }],
      content: "",
    });
    const result = await orchestrate(makeParams());
    expect(result.calls).toEqual([]);
  });

  it("caps the number of tool calls in one turn", async () => {
    planMock.mockResolvedValue({
      toolCalls: Array.from({ length: 10 }, (_, index) => ({
        id: `call_${index}`,
        name: "code_execution",
        arguments: { code: String(index) },
      })),
      content: "",
    });
    const result = await orchestrate(makeParams());
    expect(result.calls.length).toBeLessThanOrEqual(4);
  });

  it("records a failing tool as a failed observation rather than throwing", async () => {
    planMock.mockResolvedValue({
      toolCalls: [{ id: "call_1", name: "code_execution", arguments: { code: "throw new Error('nope')" } }],
      content: "",
    });

    const result = await orchestrate(makeParams());
    expect(result.calls[0].ok).toBe(false);
    expect(result.observations[0].content).toContain("(failed)");
  });

  it("falls back to an untooled answer when planning fails", async () => {
    planMock.mockRejectedValue(new Error("gateway down"));
    const result = await orchestrate(makeParams());
    expect(result.calls).toEqual([]);
    expect(result.observations).toEqual([]);
  });

  it("stops executing once the turn is aborted", async () => {
    planMock.mockResolvedValue({
      toolCalls: [
        { id: "a", name: "code_execution", arguments: { code: "1" } },
        { id: "b", name: "code_execution", arguments: { code: "2" } },
      ],
      content: "",
    });
    const controller = new AbortController();
    controller.abort();
    const result = await orchestrate(makeParams({ signal: controller.signal }));
    expect(result.calls).toEqual([]);
  });

  it("tells the planner about attachments so it can address them by id", async () => {
    planMock.mockResolvedValue({ toolCalls: [], content: "" });
    await orchestrate(
      makeParams({
        enabledTools: ["data_analysis"],
        attachments: [{ fileId: "file-123", name: "sales.csv", size: 10, mimeType: "text/csv" }],
      })
    );
    const [request] = planMock.mock.calls[0] as [{ messages: Array<{ content: string }> }];
    expect(request.messages[0].content).toContain("sales.csv");
    expect(request.messages[0].content).toContain("file-123");
  });

  it("offers the planner only the tools the user enabled", async () => {
    planMock.mockResolvedValue({ toolCalls: [], content: "" });
    await orchestrate(makeParams({ enabledTools: ["code_execution", "data_analysis"] }));
    const [request] = planMock.mock.calls[0] as [
      { tools: Array<{ function: { name: string } }> },
    ];
    expect(request.tools.map((tool) => tool.function.name).sort()).toEqual([
      "code_execution",
      "data_analysis",
    ]);
  });
});
