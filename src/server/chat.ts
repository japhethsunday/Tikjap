import { getData, persist, uid, nowISO, type ConversationRecord, type FileRecord, type UserRecord } from "./db";
import { HttpError } from "./http";
import { getModel, defaultModel } from "./models";
import { assertWithinLimits, recordRequest, recordUsage } from "./usage";
import { titleFromContent, formatBytes } from "@/lib/utils";
import type { AIModel, AttachmentRef, ChatMessage, MessageUsage, StreamChunk } from "@/lib/types";

export function publicConversation(record: ConversationRecord, messageCount: number) {
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    model: record.model,
    messageCount,
  };
}

function getConversationOrThrow(store: Awaited<ReturnType<typeof getData>>, userId: string, id: string): ConversationRecord {
  const conversation = store.conversations.find((c) => c.id === id && c.userId === userId);
  if (!conversation) throw new HttpError(404, "not_found", "Conversation not found.");
  return conversation;
}

function getFileOrThrow(store: Awaited<ReturnType<typeof getData>>, userId: string, fileId: string): FileRecord {
  const file = store.files.find((f) => f.id === fileId && f.userId === userId);
  if (!file) throw new HttpError(404, "not_found", "Uploaded file not found.");
  return file;
}

function messageCount(store: Awaited<ReturnType<typeof getData>>, conversationId: string): number {
  return store.messages.filter((m) => m.conversationId === conversationId && m.role !== "system").length;
}

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    const time = a.createdAt.localeCompare(b.createdAt);
    return time !== 0 ? time : a.id.localeCompare(b.id);
  });
}

export async function listConversations(userId: string, query?: string) {
  const store = await getData();
  let conversations = store.conversations.filter((c) => c.userId === userId);
  if (query?.trim()) {
    const q = query.trim().toLowerCase();
    conversations = conversations.filter((c) => c.title.toLowerCase().includes(q));
  }
  return conversations
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((c) => publicConversation(c, messageCount(store, c.id)));
}

export async function createConversation(userId: string, input: { title?: string; modelId?: string }) {
  const store = await getData();
  const model = input.modelId ? getModel(input.modelId) : undefined;
  const conversation: ConversationRecord = {
    id: uid(),
    userId,
    title: input.title?.trim() ? input.title.trim().slice(0, 120) : "New chat",
    model: model?.id ?? defaultModel().id,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  store.conversations.push(conversation);
  await persist();
  return publicConversation(conversation, 0);
}

export async function getConversation(userId: string, id: string) {
  const store = await getData();
  const conversation = getConversationOrThrow(store, userId, id);
  return publicConversation(conversation, messageCount(store, id));
}

export async function renameConversation(userId: string, id: string, title: string) {
  const store = await getData();
  const conversation = getConversationOrThrow(store, userId, id);
  const cleaned = title.trim().slice(0, 120);
  if (!cleaned) throw new HttpError(400, "validation", "Title cannot be empty.");
  conversation.title = cleaned;
  conversation.updatedAt = nowISO();
  await persist();
  return publicConversation(conversation, messageCount(store, id));
}

export async function deleteConversation(userId: string, id: string) {
  const store = await getData();
  getConversationOrThrow(store, userId, id);
  store.conversations = store.conversations.filter((c) => !(c.id === id && c.userId === userId));
  store.messages = store.messages.filter((m) => m.conversationId !== id);
  await persist();
}

export async function listMessages(userId: string, conversationId: string) {
  const store = await getData();
  getConversationOrThrow(store, userId, conversationId);
  return sortMessages(store.messages.filter((m) => m.conversationId === conversationId));
}

export interface GenerationParams {
  user: UserRecord;
  conversationId: string;
  content: string;
  modelId: string;
  attachmentIds?: string[];
  regenerateMessageId?: string;
  removeFromMessageId?: string;
  signal?: AbortSignal;
}

export interface GenerationResult {
  stream: ReadableStream<Uint8Array>;
  assistantMessageId: string;
}

export function startGeneration(params: GenerationParams): GenerationResult {
  const { user, conversationId, modelId, signal } = params;
  const content = params.content.trim();
  const encoder = new TextEncoder();

  if (!content) throw new HttpError(400, "validation", "Message cannot be empty.");
  const model = getModel(modelId) ?? defaultModel();
  if (!getModel(modelId)) throw new HttpError(400, "validation", "Unknown model.");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: StreamChunk) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      };
      const store = await getData();
      let conversation: ConversationRecord;
      try {
        conversation = getConversationOrThrow(store, user.id, conversationId);
      } catch (error) {
        try {
          send({ type: "error", error: messageOf(error) });
          controller.close();
        } catch {
          // stream already closed
        }
        return;
      }

      let assistantMessageId: string | undefined;
      let promptText = content;
      let attachmentRefs: AttachmentRef[] = [];
      try {
        await assertWithinLimits(user.id);

        if (params.removeFromMessageId) {
          removeFromConversation(store, conversationId, params.removeFromMessageId);
        }

        if (params.regenerateMessageId) {
          const target = store.messages.find(
            (m) => m.id === params.regenerateMessageId && m.conversationId === conversationId && m.role === "assistant"
          );
          if (!target) throw new HttpError(404, "not_found", "Message not found.");
          const messages = store.messages;
          const remaining: ChatMessage[] = [];
          let removing = false;
          for (const message of messages) {
            if (message.id === params.regenerateMessageId) {
              removing = true;
              continue;
            }
            if (removing && message.conversationId === conversationId) continue;
            remaining.push(message);
          }
          store.messages = remaining;
          const preceding = [...remaining].reverse().find((m) => m.conversationId === conversationId && m.role === "user");
          if (preceding) {
            promptText = preceding.content;
            attachmentRefs = preceding.attachments ?? [];
          }
        } else {
          attachmentRefs = await resolveAttachments(store, user.id, params.attachmentIds);
          store.messages.push({
            id: uid(),
            conversationId,
            role: "user",
            content,
            status: "complete",
            model: model.id,
            attachments: attachmentRefs.length ? attachmentRefs : undefined,
            createdAt: nowISO(),
          });
          if (conversation.title === "New chat") {
            conversation.title = titleFromContent(content);
          }
        }

        assistantMessageId = uid();
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          conversationId,
          role: "assistant",
          content: "",
          status: "streaming",
          model: model.id,
          createdAt: nowISO(),
        };
        store.messages.push(assistantMessage);
        conversation.model = model.id;
        conversation.updatedAt = nowISO();
        await persist();

        const fullText = buildDemoResponse(promptText, model, attachmentRefs, params.regenerateMessageId !== undefined);
        const tokens = fullText.match(/\S+\s*/g) ?? [fullText];
        const inputTokens = estimateTokens(promptText);
        const outputTokens = estimateTokens(fullText);
        const usage: MessageUsage = { inputTokens, outputTokens };
        let sentText = "";

        for (const token of tokens) {
          if (signal?.aborted) break;
          send({ type: "delta", content: token });
          sentText += token;
          await sleep(14 + (token.length % 9) * 2);
        }

        if (!signal?.aborted) {
          assistantMessage.content = fullText;
          assistantMessage.status = "complete";
          assistantMessage.usage = usage;
          await persist();
          await recordUsage(user.id, usage, params.regenerateMessageId ? 0 : 1);
          await recordRequest(user.id, model.id, usage, true);
          await persist();
          send({ type: "usage", usage });
          send({ type: "done", messageId: assistantMessageId, title: conversation.title });
        } else {
          assistantMessage.content = sentText;
          assistantMessage.status = "stopped";
          await persist();
          send({ type: "done", messageId: assistantMessageId, title: conversation.title, status: "stopped" });
        }
        try {
          controller.close();
        } catch {
          // stream already closed by the client
        }
      } catch (error) {
        if (assistantMessageId) {
          const stored = store.messages.find((m) => m.id === assistantMessageId);
          if (stored) {
            stored.status = "error";
            await persist();
          }
        }
        await recordRequest(user.id, model.id, { inputTokens: estimateTokens(promptText), outputTokens: 0 }, false).catch(() => undefined);
        try {
          send({ type: "error", error: messageOf(error) });
          controller.close();
        } catch {
          // stream already closed by the client
        }
      }
    },
  });

  return { stream, assistantMessageId: uid() };
}

async function resolveAttachments(
  store: Awaited<ReturnType<typeof getData>>,
  userId: string,
  attachmentIds?: string[]
): Promise<AttachmentRef[]> {
  if (!attachmentIds?.length) return [];
  const refs: AttachmentRef[] = [];
  for (const fileId of attachmentIds) {
    const file = getFileOrThrow(store, userId, fileId);
    refs.push({ fileId: file.id, name: file.name, size: file.size, mimeType: file.mimeType });
  }
  return refs;
}

function removeFromConversation(
  store: Awaited<ReturnType<typeof getData>>,
  conversationId: string,
  messageId: string
): void {
  const messages = store.messages;
  const remaining: ChatMessage[] = [];
  let removing = false;
  for (const message of messages) {
    if (message.id === messageId) {
      removing = true;
      continue;
    }
    if (removing && message.conversationId === conversationId) continue;
    remaining.push(message);
  }
  store.messages = remaining;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.startsWith("rate_limit:")) {
      return error.message.includes("messages")
        ? "You have reached today's message limit. Upgrade your plan or try again tomorrow."
        : "You have reached today's token limit. Upgrade your plan or try again tomorrow.";
    }
    return error.message;
  }
  return "Something went wrong.";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function hashSeed(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildDemoResponse(prompt: string, model: AIModel, attachments: AttachmentRef[], isRegenerate: boolean): string {
  const seed = hashSeed(prompt + model.id + (isRegenerate ? "-regen" : ""));
  const topic = summarizeTopic(prompt);
  const variations = [
    `Here's a quick overview of **${topic}** and how I can help with it.`,
    `Good question about *${topic}* — here's what I know.`,
    `Let me break down **${topic}** into the parts that matter most.`,
  ];
  const intro = variations[seed % variations.length];

  const bullets = [
    "**Fast streaming** — responses appear token by token, so you can read as I write.",
    "**Full markdown** — headings, lists, tables, code blocks, and quotes all render cleanly.",
    "**Typed everywhere** — the frontend and backend share strict TypeScript contracts.",
  ];

  const codeSample =
    model.capabilities.toolUse
      ? `async function answer(query: string) {
  const result = await think(query);
  return result.reply; // streamed to the UI
}`
      : `function hello(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(hello("${topic.split(" ")[0]}"));`;

  const lines: string[] = [];
  lines.push(`# ${capitalize(topic)}`);
  lines.push("");
  lines.push(intro);
  lines.push("");

  if (attachments.length > 0) {
    lines.push("## Files analyzed");
    lines.push("");
    lines.push(`I looked at ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}:`);
    lines.push("");
    lines.push("| File | Size | Type |");
    lines.push("| --- | --- | --- |");
    for (const attachment of attachments) {
      lines.push(`| ${escapePipe(attachment.name)} | ${formatBytes(attachment.size)} | ${attachment.mimeType || "file"} |`);
    }
    lines.push("");
    lines.push(`Ask me follow-up questions about **${escapePipe(attachments[0].name)}** and I'll dig deeper into the details.`);
    lines.push("");
  }

  lines.push("## What you get");
  lines.push("");
  for (const bullet of bullets) lines.push(`- ${bullet}`);
  lines.push("");

  lines.push("## Example");
  lines.push("");
  lines.push("```ts");
  lines.push(codeSample);
  lines.push("```");
  lines.push("");

  lines.push("## At a glance");
  lines.push("");
  lines.push(`| Property | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Model | ${model.name} |`);
  lines.push(`| Context window | ${model.contextWindow.toLocaleString()} tokens |`);
  lines.push(`| Streaming | ${model.capabilities.streaming ? "Yes" : "No"} |`);
  lines.push(`| Documents | ${model.capabilities.files ? "Supported" : "Not supported"} |`);
  lines.push("");

  lines.push(`> This reply was produced by the reference backend bundled with this app${isRegenerate ? " after a regenerate request" : ""}.`);
  lines.push("");
  lines.push("Want me to expand any section, rewrite it differently, or turn this into a plan? Just say the word.");

  return lines.join("\n");
}

function summarizeTopic(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim().replace(/[^a-zA-Z0-9\s'-]/g, "");
  const words = clean.split(" ").filter(Boolean).slice(0, 6);
  return words.length ? words.join(" ").toLowerCase() : "your question";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function escapePipe(text: string): string {
  return text.replace(/\|/g, "\\|");
}