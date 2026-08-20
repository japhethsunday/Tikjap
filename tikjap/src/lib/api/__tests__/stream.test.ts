import { describe, it, expect } from "vitest";
import { readSseEvents } from "@/lib/api/stream";

function streamFrom(text: string) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return stream.getReader();
}

describe("readSseEvents", () => {
  it("parses a single data event", async () => {
    const reader = streamFrom('data: {"type":"delta","content":"hi"}\n\n');
    const chunks = [];
    for await (const chunk of readSseEvents(reader)) chunks.push(chunk);
    expect(chunks).toEqual([{ type: "delta", content: "hi" }]);
  });

  it("parses multiple events split by blank lines", async () => {
    const reader = streamFrom(
      'data: {"type":"delta","content":"a"}\n\n' +
        'data: {"type":"delta","content":"b"}\n\n' +
        'data: {"type":"done","messageId":"m1"}\n\n'
    );
    const chunks = [];
    for await (const chunk of readSseEvents(reader)) chunks.push(chunk);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual({ type: "delta", content: "a" });
    expect(chunks[2]).toEqual({ type: "done", messageId: "m1" });
  });

  it("handles events split across chunk boundaries", async () => {
    const text = 'data: {"type":"delta","content":"partial"}\n\n';
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // deliver in awkward slices
        for (let i = 0; i < bytes.length; i += 3) {
          controller.enqueue(bytes.slice(i, i + 3));
        }
        controller.close();
      },
    });
    const chunks = [];
    for await (const chunk of readSseEvents(stream.getReader())) chunks.push(chunk);
    expect(chunks).toEqual([{ type: "delta", content: "partial" }]);
  });

  it("handles trailing buffer without a closing blank line", async () => {
    const reader = streamFrom('data: {"type":"usage","usage":{"inputTokens":1,"outputTokens":2}}');
    const chunks = [];
    for await (const chunk of readSseEvents(reader)) chunks.push(chunk);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("usage");
  });

  it("ignores comments and non-data lines", async () => {
    const reader = streamFrom(
      ": keepalive\n" + 'data: {"type":"delta","content":"ok"}\n\n'
    );
    const chunks = [];
    for await (const chunk of readSseEvents(reader)) chunks.push(chunk);
    expect(chunks).toEqual([{ type: "delta", content: "ok" }]);
  });

  it("skips malformed JSON", async () => {
    const reader = streamFrom('data: not-json\n\ndata: {"type":"done"}\n\n');
    const chunks = [];
    for await (const chunk of readSseEvents(reader)) chunks.push(chunk);
    expect(chunks).toEqual([{ type: "done" }]);
  });

  it("stops early when the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const reader = streamFrom('data: {"type":"delta","content":"x"}\n\n');
    const chunks = [];
    for await (const chunk of readSseEvents(reader, controller.signal)) chunks.push(chunk);
    expect(chunks).toHaveLength(0);
  });
});