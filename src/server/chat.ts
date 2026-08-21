import { HttpError } from "./errors";
import {
  createConversation as storeCreateConversation,
  deleteConversation as storeDeleteConversation,
  deleteMessagesFrom,
  getAssistant,
  getProject,
  getConversation as storeGetConversation,
  getConversationRow,
  getFile,
  getLastUserMessage,
  getMessageRow,
  insertMessage,
  listConversations as storeListConversations,
  listMemories,
  listMessages as storeListMessages,
  renameConversation as storeRenameConversation,
  uid,
  updateConversation,
  updateConversationRow,
  updateMessage,
  type ConversationRow,
  type ListConversationsOptions,
  type ServerUser,
} from "./store";
import { createServiceClient } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getModel, defaultModel } from "./models";
import { assertWithinLimits, recordRequest, recordUsage } from "./usage";
import { titleFromContent, formatBytes } from "@/lib/utils";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/constants";
import type { AIModel, AttachmentRef, MessageUsage, StreamChunk } from "@/lib/types";

export async function listConversations(userId: string, options: ListConversationsOptions = {}) {
  return storeListConversations(userId, options);
}

export async function createConversation(userId: string, input: { title?: string; modelId?: string; projectId?: string }) {
  return storeCreateConversation(userId, input);
}

export async function getConversation(userId: string, id: string) {
  return storeGetConversation(userId, id);
}

export async function renameConversation(userId: string, id: string, title: string) {
  return storeRenameConversation(userId, id, title);
}

export async function updateConversationSettings(
  userId: string,
  id: string,
  patch: { pinned?: boolean; archived?: boolean; projectId?: string | null }
) {
  await updateConversationRow(userId, id, patch);
  return storeGetConversation(userId, id);
}

export async function deleteConversation(userId: string, id: string) {
  return storeDeleteConversation(userId, id);
}

export async function listMessages(userId: string, conversationId: string) {
  return storeListMessages(userId, conversationId);
}

export interface GenerationParams {
  user: ServerUser;
  conversationId: string;
  content: string;
  modelId: string;
  attachmentIds?: string[];
  regenerateMessageId?: string;
  removeFromMessageId?: string;
  assistantId?: string;
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
      const db = createServiceClient();
      const send = (chunk: StreamChunk) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        } catch {
          // stream already closed
        }
      };

      let assistantMessageId: string | undefined;
      let promptText = content;
      let attachmentRefs: AttachmentRef[] = [];
      let title: string | undefined;

      try {
        let conversation: ConversationRow;
        try {
          conversation = await getConversationRow(user.id, conversationId, db);
        } catch (error) {
          send({ type: "error", error: messageOf(error) });
          return;
        }
        title = conversation.title;

        await assertWithinLimits(user.id);

        if (params.removeFromMessageId) {
          await deleteMessagesFrom(conversationId, params.removeFromMessageId, db);
        }

        if (params.regenerateMessageId) {
          const target = await getMessageRow(conversationId, params.regenerateMessageId, db);
          if (!target || target.role !== "assistant") {
            throw new HttpError(404, "not_found", "Message not found.");
          }
          await deleteMessagesFrom(conversationId, params.regenerateMessageId, db);
          const preceding = await getLastUserMessage(conversationId, db);
          if (preceding) {
            promptText = preceding.content;
            attachmentRefs = preceding.attachments ?? [];
          }
        } else {
          attachmentRefs = await resolveAttachments(user.id, params.attachmentIds, db);
          await insertMessage(
            conversationId,
            {
              role: "user",
              content,
              status: "complete",
              model: model.id,
              attachments: attachmentRefs.length ? attachmentRefs : undefined,
            },
            db
          );
          if (conversation.title === "New chat") {
            title = titleFromContent(content);
            await updateConversation(conversationId, { title }, db);
          }
        }

        const assistant = await insertMessage(
          conversationId,
          { role: "assistant", content: "", status: "streaming", model: model.id },
          db
        );
        assistantMessageId = assistant.id;
        await updateConversation(conversationId, { model: model.id }, db);

        const fullText = buildDemoResponse(
          promptText,
          model,
          attachmentRefs,
          params.regenerateMessageId !== undefined,
          await resolveGenerationContext(user.id, conversation, params.assistantId)
        );
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
          await updateMessage(assistantMessageId, { content: fullText, status: "complete", usage }, db);
          await recordUsage(user.id, usage, params.regenerateMessageId ? 0 : 1);
          await recordRequest(user.id, model.id, usage, true);
          send({ type: "usage", usage });
          send({ type: "done", messageId: assistantMessageId, title });
        } else {
          await updateMessage(assistantMessageId, { content: sentText, status: "stopped" }, db);
          send({ type: "done", messageId: assistantMessageId, title, status: "stopped" });
        }
      } catch (error) {
        if (assistantMessageId) {
          await updateMessage(assistantMessageId, { status: "error" }, db).catch(() => undefined);
        }
        await recordRequest(user.id, model.id, { inputTokens: estimateTokens(promptText), outputTokens: 0 }, false).catch(() => undefined);
        send({ type: "error", error: messageOf(error) });
      } finally {
        try {
          controller.close();
        } catch {
          // stream already closed by the client
        }
      }
    },
  });

  return { stream, assistantMessageId: uid() };
}

async function resolveAttachments(userId: string, attachmentIds?: string[], db: SupabaseClient = createServiceClient()): Promise<AttachmentRef[]> {
  if (!attachmentIds?.length) return [];
  if (attachmentIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new HttpError(400, "validation", `Up to ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`);
  }
  const refs: AttachmentRef[] = [];
  for (const fileId of attachmentIds) {
    const file = await getFile(userId, fileId, db);
    refs.push({ fileId: file.id, name: file.name, size: file.size, mimeType: file.mime_type });
  }
  return refs;
}

/**
 * Gathers user-owned context for a generation: custom assistant instructions,
 * project instructions (when the conversation lives in a project), and the
 * user's saved memories. Everything is owner-scoped; nothing crosses accounts.
 */
async function resolveGenerationContext(
  userId: string,
  conversation: ConversationRow,
  assistantId?: string
): Promise<string[]> {
  const parts: string[] = [];
  try {
    if (assistantId) {
      const assistant = await getAssistant(userId, assistantId);
      if (assistant.instructions.trim()) {
        parts.push(`Assistant "${assistant.name}" instructions:\n${assistant.instructions.trim()}`);
      }
    }
    if (conversation.project_id) {
      const project = await getProject(userId, conversation.project_id);
      if (project.instructions.trim()) {
        parts.push(`Project "${project.name}" instructions:\n${project.instructions.trim()}`);
      }
    }
    const memories = await listMemories(userId);
    if (memories.length) {
      parts.push(`Things to remember about the user:\n${memories.slice(0, 20).map((m) => `- ${m.content}`).join("\n")}`);
    }
  } catch (error) {
    console.error("[chat/context]", error instanceof Error ? error.message : error);
  }
  return parts;
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

function buildDemoResponse(
  prompt: string,
  model: AIModel,
  attachments: AttachmentRef[],
  isRegenerate: boolean,
  contextParts: string[] = []
): string {
  const seed = hashSeed(prompt + model.id + (isRegenerate ? "-regen" : ""));
  const topic = summarizeTopic(prompt);
  const variations = [
    `Here's a quick overview of **${topic}** and how I can help with it.`,
    `Good question about *${topic}* — here's what I know.`,
    `Let me break down **${topic}** into the parts that matter most.`,
  ];
  const intro = variations[seed % variations.length];

  const contextBlock = contextParts.length
    ? `${contextParts.map((part) => `> ${part.replace(/\n/g, "\n> ")}\n`).join("")}\n`
    : "";

  const bullets = [
    "**Fast streaming** — responses appear token by token, so you can read as I write.",
    "**Full markdown** — headings, lists, tables, code blocks, and quotes all render cleanly.",
    "**Typed everywhere** — the frontend and backend share strict TypeScript contracts.",
  ];

  const codeSample = model.capabilities.toolUse
    ? `async function answer(query: string) {
  const result = await think(query);
  return result.reply; // streamed to the UI
}`
    : `function hello(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(hello("${topic.split(" ")[0]}"));`;

  const lines: string[] = [];
  if (contextBlock) {
    lines.push(contextBlock.trimEnd());
    lines.push("");
  }
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