import { HttpError } from "./errors";
import {
  createConversation as storeCreateConversation,
  createMemory as storeCreateMemory,
  deleteConversation as storeDeleteConversation,
  deleteMessagesFrom,
  getAssistant,
  getProfilePlan,
  getProject,
  getConversation as storeGetConversation,
  getConversationRow,
  getFile,
  getLastUserMessage,
  getSavedPrompt,
  getMessageRow,
  incrementAssistantRuns,
  insertMessage,
  listConversations as storeListConversations,
  listMemories,
  listMessages as storeListMessages,
  messageCountFor,
  renameConversation as storeRenameConversation,
  retrieveFromSources,
  uid,
  updateConversationFields,
  updateConversation,
  updateConversationRow,
  updateMessage,
  type ConversationRow,
  type ListConversationsOptions,
  type ServerUser,
} from "./store";
import { createServiceClient } from "./supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getModel, defaultModel, getUpstream } from "./models";
import { TIKJAP_IDENTITY_PROMPT } from "./identity";
import { complete, nimProvider } from "./providers/nim";
import { orchestrate, type ToolCallRecord } from "./tools/orchestrator";
import { ChatMessageInput, ProviderError, PROVIDER_DOWN_MESSAGE } from "./providers/types";
import { assertWithinLimits, recordRequest, recordUsage } from "./usage";
import { readFileContent } from "./files";
import { titleFromContent } from "@/lib/utils";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/constants";
import type {
  AIModel,
  AttachmentRef,
  MessageUsage,
  StreamChunk,
} from "@/lib/types";
import type { ToolPermission } from "@/lib/tools/types";

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
  continueFromMessageId?: string;
  assistantId?: string;
  /** Tool ids the user switched on in the composer for this turn. */
  enabledTools?: ToolPermission[];
  /** Set for Code workspace turns; unlocks the project file tools. */
  projectId?: string;
  signal?: AbortSignal;
}

export interface GenerationResult {
  stream: ReadableStream<Uint8Array>;
  assistantMessageId: string;
}

/**
 * Output ceiling per plan, in tokens. Previously this clipped the fabricated
 * demo text by character count; with real inference it belongs on the upstream
 * request so the model stops rather than being truncated mid-sentence.
 */
const PLAN_OUTPUT_TOKEN_CAPS: Record<string, number> = { free: 800, pro: 4_000, team: 8_000 };

function planOutputTokenCap(plan: string, modelCeiling: number): number {
  return Math.min(modelCeiling, PLAN_OUTPUT_TOKEN_CAPS[plan] ?? PLAN_OUTPUT_TOKEN_CAPS.free);
}

export function startGeneration(params: GenerationParams): GenerationResult {
  const { user, conversationId, signal } = params;
  const content = params.content.trim();
  const requestedModelId = params.modelId;
  const encoder = new TextEncoder();

  const model = getModel(requestedModelId) ?? defaultModel();
  const fellBack = !getModel(requestedModelId);

  // request.signal does not fire on client disconnects in route handlers, so
  // generation stop is driven by this controller: stream cancel(), enqueue
  // failures, or the upstream request signal all trip it.
  const stopController = new AbortController();
  if (signal?.aborted) stopController.abort();
  signal?.addEventListener("abort", () => stopController.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const db = createServiceClient();
      const send = (chunk: StreamChunk) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        } catch {
          stopController.abort();
        }
      };

      let assistantMessageId: string | undefined;
      let promptText = content;
      let attachmentRefs: AttachmentRef[] = [];
      let title: string | undefined;
      const startedAt = Date.now();
      let firstTokenAt = 0;

      try {
        // These two are independent — the conversation lookup and the quota
        // check touch different tables. Running them in sequence cost a full
        // round trip each, which is the dominant latency now that every query
        // is a network hop rather than a local call.
        let conversation: ConversationRow;
        try {
          const [row] = await Promise.all([
            getConversationRow(user.id, conversationId, db),
            assertWithinLimits(user.id),
          ]);
          conversation = row;
        } catch (error) {
          send({ type: "error", error: messageOf(error) });
          return;
        }
        title = conversation.title;

        if (fellBack && requestedModelId) {
          send({ type: "notice", notice: `The selected model is unavailable; used ${model.name} instead.` });
        }

        let priorContent = "";
        let csvSection = "";
        if (params.removeFromMessageId) {
          await deleteMessagesFrom(conversationId, params.removeFromMessageId, db);
        }

        if (params.continueFromMessageId) {
          const target = await getMessageRow(conversationId, params.continueFromMessageId, db);
          if (!target || target.role !== "assistant") throw new HttpError(404, "not_found", "Message not found.");
          priorContent = target.content;
          assistantMessageId = target.id;
          attachmentRefs = target.attachments ?? [];
          const preceding = await getLastUserMessage(conversationId, db);
          if (preceding) promptText = preceding.content;
        } else if (params.regenerateMessageId) {
          const target = await getMessageRow(conversationId, params.regenerateMessageId, db);
          if (!target || target.role !== "assistant") throw new HttpError(404, "not_found", "Message not found.");
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

        if (!assistantMessageId) {
          const assistant = await insertMessage(
            conversationId,
            { role: "assistant", content: "", status: "streaming", model: model.id },
            db
          );
          assistantMessageId = assistant.id;
        }
        await updateConversation(conversationId, { model: model.id }, db);

        const contextInfo = await resolveGenerationContext(user.id, conversation, params.assistantId, promptText || priorContent);
        if (attachmentRefs.length) {
          csvSection = await buildCsvSection(user.id, attachmentRefs);
        }
        send({
          type: "context",
          context: {
            messages: contextInfo.messageCount,
            memories: contextInfo.memoryCount,
            sources: contextInfo.sourceCount,
            estimatedTokens: estimateTokens(promptText) + estimateTokens(contextInfo.parts.join("\n")),
          },
        });
        if (params.assistantId) await incrementAssistantRunsSafe(user.id, params.assistantId);

        const upstream = getUpstream(model.id);
        const gatewayConfigured = Boolean(
          (process.env.AI_GATEWAY_API_KEY ?? process.env.NVIDIA_API_KEY ?? "").trim()
        );
        let fullText = "";
        let sentText = "";
        let stopRequested = false;
        let toolCalls: ToolCallRecord[] = [];

        if (upstream && gatewayConfigured) {
          // Real inference path: route through the internal provider, streaming
          // normalized deltas. Upstream model ids never leave the server.
          let history: Awaited<ReturnType<typeof storeListMessages>> = [];
          try {
            history = await storeListMessages(user.id, conversationId);
          } catch {
            history = [];
          }
          const providerMessages: ChatMessageInput[] = [
            { role: "system", content: TIKJAP_IDENTITY_PROMPT },
          ];
          if (upstream.system) {
            providerMessages.push({ role: "system", content: upstream.system });
          }
          if (contextInfo.parts.length) {
            providerMessages.push({ role: "system", content: contextInfo.parts.join("\n\n") });
          }
          if (csvSection) {
            // Tabular attachments are summarized into the prompt so text-only
            // tiers can still reason about them.
            providerMessages.push({ role: "system", content: csvSection });
          }
          for (const message of history.slice(-16)) {
            if (message.role === "system" || !message.content.trim()) continue;
            if (message.id === assistantMessageId) continue;
            providerMessages.push({
              role: message.role === "assistant" ? "assistant" : "user",
              content: message.content.slice(0, 12_000),
            });
          }
          if (!providerMessages.some((message) => message.role === "user")) {
            providerMessages.push({ role: "user", content: promptText || priorContent || "Hello" });
          }
          // Vision-capable tiers receive actual image content for the current
          // message; text-only tiers keep the plain-text history.
          const currentImages = model.capabilities.vision ? await loadImageParts(user.id, attachmentRefs) : [];
          if (currentImages.length && providerMessages.length && providerMessages[providerMessages.length - 1].role === "user") {
            const last = providerMessages[providerMessages.length - 1];
            const baseText = typeof last.content === "string" ? last.content : "";
            providerMessages[providerMessages.length - 1] = {
              role: "user",
              content: [
                { type: "text", text: baseText || "Analyze the attached image(s)." },
                ...currentImages,
              ],
            };
          }

          // ---- Tool orchestration -------------------------------------
          // User → Tikjap API → orchestrator → tool → tool result → AI answer.
          // Runs before the answer stream so the model sees real observations.
          if (((params.enabledTools?.length ?? 0) > 0 || params.projectId) && model.capabilities.toolUse) {
            const emitTool = (event: NonNullable<StreamChunk["tool"]>) => send({ type: "tool", tool: event });
            try {
              const orchestration = await orchestrate({
                userId: user.id,
                conversationId,
                messageId: assistantMessageId,
                prompt: promptText || priorContent,
                history: providerMessages.filter(
                  (message): message is { role: "user" | "assistant"; content: string } =>
                    message.role !== "system" && typeof message.content === "string"
                ),
                enabledTools: params.enabledTools ?? [],
                attachments: attachmentRefs,
                projectId: params.projectId,
                upstreamModel: upstream.model,
                signal: stopController.signal,
                onToolStart: (call) =>
                  emitTool({ id: call.id, toolId: call.toolId, input: call.input, status: "running" }),
                onToolProgress: (callId, progress) =>
                  emitTool({
                    id: callId,
                    toolId: "",
                    status: "running",
                    stage: progress.stage,
                    progress: progress.progress,
                    message: progress.message,
                    sources: progress.sources,
                  }),
                onToolEnd: (record) =>
                  emitTool({
                    id: record.id,
                    toolId: record.toolId,
                    status: record.ok ? "completed" : "failed",
                    progress: 1,
                    data: record.data,
                    sources: record.sources,
                    durationMs: record.durationMs,
                  }),
              });
              toolCalls = orchestration.calls;
              providerMessages.push(...orchestration.observations);
              if (orchestration.notice) send({ type: "notice", notice: orchestration.notice });
            } catch (error) {
              // A broken orchestrator must never cost the user their answer.
              console.error("[chat/tools]", String(error).slice(0, 200));
            }
          }

          try {
            let streamed = "";
            let deltaCount = 0;
            for await (const part of nimProvider.streamChat({
              model: upstream.model,
              messages: providerMessages,
              maxTokens: planOutputTokenCap(
                await getProfilePlan(user.id).catch(() => "free" as const),
                Math.min(model.maxOutputTokens, upstream.maxTokens ?? 8_000)
              ),
              temperature: upstream.temperature ?? 0.7,
              topP: upstream.topP ?? 0.95,
              thinking: upstream.thinking,
              signal: stopController.signal,
            })) {
              if (stopController.signal.aborted) break;
              if (!part.delta) continue;
              if (!firstTokenAt) firstTokenAt = Date.now();
              streamed += part.delta;
              sentText += part.delta;
              send({ type: "delta", content: part.delta });
              deltaCount += 1;
              if (deltaCount % 25 === 0) {
                const row = await getMessageRow(conversationId, assistantMessageId, db).catch(() => undefined);
                if (row && row.status !== "streaming") {
                  stopRequested = true;
                  break;
                }
              }
            }
            if (!stopRequested && !stopController.signal.aborted && !streamed.trim()) {
              throw new ProviderError("unavailable", 502, PROVIDER_DOWN_MESSAGE, "empty completion");
            }
            fullText = priorContent ? `${priorContent}\n\n${streamed}` : streamed;
          } catch (error) {
            const providerError = error instanceof ProviderError ? error : undefined;
            console.error(
              "[chat/provider]",
              JSON.stringify({
                model: model.id,
                code: providerError?.code ?? "unknown",
                detail: (providerError?.detail ?? String(error)).slice(0, 300),
              })
            );
            await updateMessage(assistantMessageId, { status: "error" }, db).catch(() => undefined);
            await recordRequest(user.id, model.id, { inputTokens: estimateTokens(promptText), outputTokens: 0 }, false).catch(() => undefined);
            send({ type: "error", error: providerError?.userMessage ?? PROVIDER_DOWN_MESSAGE });
            return;
          }
        } else {
          // No inference gateway configured. Fabricating an answer here would
          // be indistinguishable from a real one to the user, so fail loudly
          // instead — a visible misconfiguration beats a convincing fake.
          console.error("[chat] no inference gateway configured (AI_GATEWAY_API_KEY is unset)");
          await updateMessage(assistantMessageId, { status: "error" }, db).catch(() => undefined);
          send({
            type: "error",
            error:
              "Tikjap's inference backend is not configured on this deployment. Set AI_GATEWAY_API_KEY to enable chat.",
          });
          return;
        }

        const latencyMs = Date.now() - startedAt;
        const inputTokens = estimateTokens(promptText);
        const outputTokens = estimateTokens(fullText);
        const usage: MessageUsage = { inputTokens, outputTokens };

        if (!stopController.signal.aborted && !stopRequested) {
          await updateMessage(
            assistantMessageId,
            {
              content: fullText,
              status: "complete",
              usage,
              latencyMs,
              // Persist a trimmed record: the full observation text is already
              // reflected in the answer, so storing it would bloat every row.
              ...(toolCalls.length
                ? {
                    toolCalls: toolCalls.map((call) => ({
                      id: call.id,
                      toolId: call.toolId,
                      status: call.ok ? "completed" : "failed",
                      data: call.data,
                      sources: call.sources,
                      durationMs: call.durationMs,
                    })),
                  }
                : {}),
            },
            db
          );
          await recordUsage(user.id, usage, params.regenerateMessageId ? 0 : 1);
          await recordRequest(user.id, model.id, usage, true);
          send({ type: "usage", usage });
          if (!conversation.incognito) {
            await maybeAutoSummarize(user.id, conversationId, promptText, db).catch(() => undefined);
            await extractMemoriesFromMessage(user.id, promptText, db).catch(() => undefined);
          }
          send({ type: "done", messageId: assistantMessageId, title, latencyMs });
        } else {
          const stoppedContent = priorContent ? `${priorContent}\n\n${sentText}` : sentText;
          await updateMessage(assistantMessageId, { content: stoppedContent, status: "stopped", latencyMs }, db);
          send({ type: "done", messageId: assistantMessageId, title, status: "stopped", latencyMs });
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
    cancel() {
      stopController.abort();
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
 * project instructions, keyword-retrieved project knowledge excerpts, and the
 * user's approved memories. Everything is owner-scoped.
 */
async function resolveGenerationContext(
  userId: string,
  conversation: ConversationRow,
  assistantId?: string,
  promptText = ""
): Promise<{ parts: string[]; memoryCount: number; sourceCount: number; messageCount: number }> {
  const parts: string[] = [];
  let memoryCount = 0;
  let sourceCount = 0;
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
      const hits = await retrieveFromSources(userId, conversation.project_id, promptText, 4);
      sourceCount = hits.length;
      if (hits.length) {
        const excerpts = hits.map((hit) => `[${hit.title}]\n${hit.chunk}`).join("\n---\n");
        parts.push(`Project knowledge excerpts:\n${excerpts}`);
      }
    }
    const memories = await listMemories(userId, { status: "approved" });
    memoryCount = memories.length;
    if (memories.length) {
      parts.push(`Things to remember about the user:\n${memories.slice(0, 20).map((m) => `- ${m.content}`).join("\n")}`);
    }
    const messageCount = await messageCountFor(conversation.id);
    return { parts, memoryCount, sourceCount, messageCount };
  } catch (error) {
    console.error("[chat/context]", error instanceof Error ? error.message : error);
    return { parts, memoryCount, sourceCount, messageCount: 0 };
  }
}

async function incrementAssistantRunsSafe(userId: string, assistantId: string): Promise<void> {
  try {
    await incrementAssistantRuns(userId, assistantId);
  } catch {
    // non-fatal
  }
}

async function maybeAutoSummarize(
  userId: string,
  conversationId: string,
  latestPrompt: string,
  db: SupabaseClient
): Promise<void> {
  const count = await messageCountFor(conversationId, db);
  if (count === 0 || count % 10 !== 0) return;
  const summary = `Discussion about "${summarizeTopic(latestPrompt)}" — ${count} messages so far.`;
  await updateConversationFields(userId, conversationId, { summary }, db);
}

const MEMORY_PATTERNS: RegExp[] = [
  /\bremember (?:that )?(.{5,300})/i,
  /\bi prefer (.{3,200})/i,
  /\bmy name is ([^.\n]{2,80})/i,
];

async function extractMemoriesFromMessage(userId: string, content: string, db: SupabaseClient): Promise<void> {
  void db;
  const candidates: string[] = [];
  for (const pattern of MEMORY_PATTERNS) {
    const match = content.match(pattern);
    if (match?.[1]) candidates.push(match[1].trim().replace(/[.!?]+$/, ""));
  }
  if (!candidates.length) return;
  const pending = await listMemories(userId, { status: "pending" });
  let slots = Math.max(0, 3 - pending.length);
  for (const candidate of candidates) {
    if (slots <= 0) break;
    await storeCreateMemory(userId, candidate, { priority: 1, status: "pending", source: "auto" });
    slots -= 1;
  }
}

async function buildCsvSection(userId: string, attachments: AttachmentRef[]): Promise<string> {
  const csv = attachments.find(
    (a) => (a.mimeType ?? "").includes("csv") || a.name.toLowerCase().endsWith(".csv")
  );
  if (!csv) return "";
  try {
    const { buffer } = await readFileContent(userId, csv.fileId);
    const text = buffer.subarray(0, 20_000).toString("utf8");
    const rows = text.split(/\r?\n/).filter(Boolean).slice(0, 8);
    if (!rows.length) return "";
    const parseRow = (line: string) =>
      line.split(",").slice(0, 6).map((cell) => escapePipe(cell.trim().slice(0, 40)));
    const header = parseRow(rows[0]);
    const lines = [
      `| ${header.join(" | ")} |`,
      `| ${header.map(() => "---").join(" | ")} |`,
      ...rows.slice(1).map((row) => `| ${parseRow(row).join(" | ")} |`),
    ];
    return `## CSV preview: ${escapePipe(csv.name)}\n\n${lines.join("\n")}\n\n*Showing the first ${rows.length - 1} data rows.*`;
  } catch {
    return "";
  }
}

export interface ComparisonEntry {
  modelId: string;
  modelName: string;
  content: string;
  latencyMs: number;
}

export async function runComparison(
  userId: string,
  conversationId: string,
  content: string,
  modelIds: string[]
): Promise<ComparisonEntry[]> {
  const trimmed = content.trim();
  if (!trimmed) throw new HttpError(400, "validation", "Message cannot be empty.");
  const db = createServiceClient();
  const conversation = await getConversationRow(userId, conversationId, db);
  const picked = [...new Set(modelIds)]
    .slice(0, 3)
    .map((id) => getModel(id))
    .filter((m): m is AIModel => Boolean(m));
  if (!picked.length) throw new HttpError(400, "validation", "No valid models selected.");
  const contextInfo = await resolveGenerationContext(userId, conversation, undefined, trimmed);
  return Promise.all(
    picked.map(async (model) => {
      const startedAt = Date.now();
      const text = await completeWithModel(model, trimmed, contextInfo.parts);
      return { modelId: model.id, modelName: model.name, content: text, latencyMs: Math.max(1, Date.now() - startedAt) };
    })
  );
}

export async function getConversationContextPreview(userId: string, conversationId: string) {
  const db = createServiceClient();
  const conversation = await getConversationRow(userId, conversationId, db);
  const info = await resolveGenerationContext(userId, conversation, undefined, "");
  return {
    stats: {
      messages: info.messageCount,
      memories: info.memoryCount,
      sources: info.sourceCount,
      estimatedTokens: estimateTokens(info.parts.join("\n")),
    },
  };
}

export async function runScheduledPrompt(userId: string, promptId: string) {
  const db = createServiceClient();
  const prompt = await getSavedPrompt(userId, promptId);
  const model = defaultModel();
  const conversation = await storeCreateConversation(userId, {
    title: `Scheduled: ${prompt.title}`.slice(0, 120),
    modelId: model.id,
  });
  const conversationRow = await getConversationRow(userId, conversation.id, db);
  const contextInfo = await resolveGenerationContext(userId, conversationRow, undefined, prompt.body);
  await insertMessage(
    conversation.id,
    { role: "user", content: prompt.body, status: "complete", model: model.id },
    db
  );
  const text = await completeWithModel(model, prompt.body, contextInfo.parts);
  const message = await insertMessage(
    conversation.id,
    { role: "assistant", content: text, status: "complete", model: model.id },
    db
  );
  return { conversationId: conversation.id, messageId: message.id };
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

const MAX_IMAGES_PER_MESSAGE = 3;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Loads image attachments as inline data URLs for vision-capable models. */
async function loadImageParts(userId: string, attachments: AttachmentRef[]): Promise<Array<{ type: "image_url"; image_url: { url: string } }>> {
  const images = attachments.filter((a) => (a.mimeType ?? "").startsWith("image/")).slice(0, MAX_IMAGES_PER_MESSAGE);
  const parts: Array<{ type: "image_url"; image_url: { url: string } }> = [];
  for (const image of images) {
    if (image.size > MAX_IMAGE_BYTES) continue;
    try {
      const { buffer } = await readFileContent(userId, image.fileId);
      parts.push({
        type: "image_url",
        image_url: { url: `data:${image.mimeType};base64,${buffer.toString("base64")}` },
      });
    } catch {
      // Skip unreadable images rather than failing the whole generation.
    }
  }
  return parts;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function summarizeTopic(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim().replace(/[^a-zA-Z0-9\s'-]/g, "");
  const words = clean.split(" ").filter(Boolean).slice(0, 6);
  return words.length ? words.join(" ").toLowerCase() : "your question";
}

function escapePipe(text: string): string {
  return text.replace(/\|/g, "\\|");
}

/**
 * Runs a real completion for a Tikjap model tier, applying that tier's system
 * contract. Used by model comparison and scheduled prompts, which need a whole
 * answer rather than a stream.
 */
async function completeWithModel(model: AIModel, prompt: string, contextParts: string[]): Promise<string> {
  const upstream = getUpstream(model.id);
  const configured = Boolean((process.env.AI_GATEWAY_API_KEY ?? process.env.NVIDIA_API_KEY ?? "").trim());
  if (!upstream || !configured) {
    throw new HttpError(503, "unavailable", "Tikjap's inference backend is not configured on this deployment.");
  }

  const messages: ChatMessageInput[] = [
    { role: "system", content: TIKJAP_IDENTITY_PROMPT },
    { role: "system", content: upstream.system },
  ];
  if (contextParts.length) messages.push({ role: "system", content: contextParts.join("\n\n") });
  messages.push({ role: "user", content: prompt });

  try {
    return await complete({
      model: upstream.model,
      messages,
      maxTokens: Math.min(model.maxOutputTokens, upstream.maxTokens ?? 4_000),
      temperature: upstream.temperature ?? 0.7,
      topP: upstream.topP,
    });
  } catch (error) {
    const providerError = error instanceof ProviderError ? error : undefined;
    throw new HttpError(503, "unavailable", providerError?.userMessage ?? PROVIDER_DOWN_MESSAGE);
  }
}
