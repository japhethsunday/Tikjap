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
import { nimProvider } from "./providers/nim";
import { ChatMessageInput, ProviderError, PROVIDER_DOWN_MESSAGE, ToolDefinition } from "./providers/types";
import { assertWithinLimits, recordRequest, recordUsage } from "./usage";
import { readFileContent } from "./files";
import { titleFromContent, formatBytes } from "@/lib/utils";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/constants";
import { getTool, getAllTools, executeTool } from "@/lib/tools";
import type {
  AIModel,
  AttachmentRef,
  MessageUsage,
  StreamChunk,
} from "@/lib/types";

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
  enabledTools?: string[];
  signal?: AbortSignal;
}

export interface GenerationResult {
  stream: ReadableStream<Uint8Array>;
  assistantMessageId: string;
}

const PLAN_OUTPUT_CAPS: Record<string, number> = { free: 1200, pro: 5000, team: 16000 };

export function startGeneration(params: GenerationParams): GenerationResult {
  const { user, conversationId, signal, enabledTools = [] } = params;
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
        let conversation: ConversationRow;
        try {
          conversation = await getConversationRow(user.id, conversationId, db);
        } catch (error) {
          send({ type: "error", error: messageOf(error) });
          return;
        }
        title = conversation.title;

        await assertWithinLimits(user.id);

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

          try {
            // eslint-disable-next-line prefer-const
            let streamed = "";
            // eslint-disable-next-line prefer-const
            let deltaCount = 0;
            let accumulatedToolCalls: Array<{
              index: number;
              id: string;
              type: "function";
              function: { name: string; arguments: string };
            }> = [];
            let pendingToolCalls = false;

            // Get available tools for this model
            const availableTools: ToolDefinition[] = [];
            if (model.capabilities.toolUse && enabledTools.includes("web_search")) {
              const webSearchTool = getTool("web_search");
              if (webSearchTool) {
                availableTools.push({
                  type: "function",
                  function: {
                    name: webSearchTool.id,
                    description: webSearchTool.description,
                    parameters: webSearchTool.inputSchema as { type: "object"; properties: Record<string, { type: string; description: string }>; required: string[] },
                  },
                });
              }
            }

            while (true) {
              accumulatedToolCalls = [];
              pendingToolCalls = false;
              let streamed = "";
              let deltaCount = 0;

              for await (const part of nimProvider.streamChat({
                model: upstream.model,
                messages: providerMessages,
                maxTokens: Math.min(model.maxOutputTokens, upstream.maxTokens ?? 8_000),
                temperature: upstream.temperature ?? 0.7,
                topP: upstream.topP ?? 0.95,
                thinking: upstream.thinking,
                signal: stopController.signal,
                tools: availableTools.length > 0 ? availableTools : undefined,
                toolChoice: availableTools.length > 0 ? "auto" : undefined,
              })) {
                if (stopController.signal.aborted) break;
                if (part.delta) {
                  if (!firstTokenAt) firstTokenAt = Date.now();
                  streamed += part.delta;
                  sentText += part.delta;
                  send({ type: "delta", content: part.delta });
                }
                if (part.toolCalls && part.toolCalls.length > 0) {
                  pendingToolCalls = true;
                  accumulatedToolCalls.push(...part.toolCalls);
                }
                deltaCount += 1;
                if (deltaCount % 25 === 0) {
                  const row = await getMessageRow(conversationId, assistantMessageId, db).catch(() => undefined);
                  if (row && row.status !== "streaming") {
                    stopRequested = true;
                    break;
                  }
                }
              }
              if (stopController.signal.aborted) break;
              if (!stopRequested && !stopController.signal.aborted && !streamed.trim() && accumulatedToolCalls.length === 0) {
                throw new ProviderError("unavailable", 502, PROVIDER_DOWN_MESSAGE, "empty completion");
              }
              fullText = priorContent ? `${priorContent}\n\n${streamed}` : streamed;

              if (!pendingToolCalls || accumulatedToolCalls.length === 0) {
                break;
              }

              // Execute tool calls
              for (const toolCall of accumulatedToolCalls) {
                if (toolCall.type !== "function") continue;
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);

                // Send tool call started event
                send({ type: "notice", notice: `Running ${functionName}...` });

                const toolResult = await executeTool(
                  functionName,
                  functionArgs,
                  {
                    userId: user.id,
                    conversationId,
                    messageId: assistantMessageId,
                    modelId: model.id,
                    abortSignal: stopController.signal,
                  }
                );

                // Add tool result to conversation
                providerMessages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify(toolResult),
                  name: functionName,
                });

                // Send tool result to client
                send({
                  type: "notice",
                  notice: toolResult.success
                    ? `${functionName} completed`
                    : `${functionName} failed: ${toolResult.error}`,
                });
              }
            }
            if (!stopRequested && !stopController.signal.aborted && !fullText.trim()) {
              throw new ProviderError("unavailable", 502, PROVIDER_DOWN_MESSAGE, "empty completion");
            }
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
          // Reference backend — used only when no inference key is configured.
          let continuation = buildDemoResponse(promptText, model, attachmentRefs, params.regenerateMessageId !== undefined, contextInfo.parts);
          if (csvSection) continuation = `${continuation}\n\n${csvSection}`;

          const plan = await getProfilePlan(user.id).catch(() => "free" as const);
          const cap = PLAN_OUTPUT_CAPS[plan] ?? PLAN_OUTPUT_CAPS.free;
          if (continuation.length > cap) {
            continuation = `${continuation.slice(0, cap).replace(/\s+\S*$/, "")}\n\n*…truncated for your plan.*`;
            send({ type: "notice", notice: "Output truncated to your plan's limit. Upgrade for longer replies." });
          }

          fullText = priorContent ? `${priorContent}\n\n${continuation}` : continuation;
          const tokens = continuation.match(/\S+\s*/g) ?? [continuation];

          let tokenCount = 0;
          for (const token of tokens) {
            if (stopController.signal.aborted) break;
            if (!firstTokenAt) firstTokenAt = Date.now();
            send({ type: "delta", content: token });
            sentText += token;
            await sleep(14 + (token.length % 9) * 2);
            tokenCount += 1;
            if (tokenCount % 40 === 0) {
              const row = await getMessageRow(conversationId, assistantMessageId, db).catch(() => undefined);
              if (row && row.status !== "streaming") {
                stopRequested = true;
                break;
              }
            }
          }
        }

        const latencyMs = Date.now() - startedAt;
        const inputTokens = estimateTokens(promptText);
        const outputTokens = estimateTokens(fullText);
        const usage: MessageUsage = { inputTokens, outputTokens };

        if (!stopController.signal.aborted && !stopRequested) {
          await updateMessage(assistantMessageId, { content: fullText, status: "complete", usage, latencyMs }, db);
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
      const text = buildDemoResponse(trimmed, model, [], false, contextInfo.parts);
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
  const text = buildDemoResponse(prompt.body, model, [], false, contextInfo.parts);
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