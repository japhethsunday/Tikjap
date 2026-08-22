import type { AIModel } from "@/lib/types";

/**
 * The model catalog is owned by the backend. The frontend never hardcodes
 * models — it fetches this list at runtime.
 */
export const MODEL_CATALOG: AIModel[] = [
  {
    id: "tikja-mini",
    name: "Tikja Mini",
    description: "Quick, concise answers for everyday questions. Optimized for speed.",
    provider: "tikja",
    contextWindow: 8_000,
    maxOutputTokens: 2_000,
    capabilities: { vision: false, files: true, streaming: true, toolUse: false },
  },
  {
    id: "tikja-1",
    name: "Tikja 1",
    description: "The balanced daily driver — great for writing, code, and research.",
    provider: "tikja",
    contextWindow: 32_000,
    maxOutputTokens: 4_000,
    capabilities: { vision: false, files: true, streaming: true, toolUse: true },
    isDefault: true,
  },
  {
    id: "tikja-1-pro",
    name: "Tikja 1 Pro",
    description: "Deep reasoning and thorough analysis for complex, demanding work.",
    provider: "tikja",
    contextWindow: 128_000,
    maxOutputTokens: 8_000,
    capabilities: { vision: true, files: true, streaming: true, toolUse: true },
  },
  {
    id: "tikja-vision",
    name: "Tikja Vision",
    description: "Creative, expressive answers — plus image understanding.",
    provider: "tikja",
    contextWindow: 64_000,
    maxOutputTokens: 4_000,
    capabilities: { vision: true, files: true, streaming: true, toolUse: false },
  },
];

export function getModel(modelId: string): AIModel | undefined {
  return MODEL_CATALOG.find((model) => model.id === modelId);
}

export function defaultModel(): AIModel {
  return MODEL_CATALOG.find((model) => model.isDefault) ?? MODEL_CATALOG[0];
}

/**
 * Internal inference routing. Tikjap model ids are the only public surface —
 * these upstream ids are infrastructure details resolved server-side and are
 * never exposed through any API response. Swapping an entry here re-points a
 * Tikjap model at different infrastructure without touching the frontend.
 *
 * Each tier also carries its own behavioral contract (`system`) and output
 * budget so the models are genuinely differentiated, not just relabeled.
 */
export interface UpstreamModelConfig {
  provider: "nim";
  model: string;
  temperature?: number;
  topP?: number;
  thinking?: boolean;
  /** Hard output ceiling for this tier (tokens). */
  maxTokens?: number;
  /** Tier-specific assistant behavior, sent as a system instruction. */
  system: string;
}

export const MODEL_ROUTING: Record<string, UpstreamModelConfig> = {
  // NOTE: "deepseek-ai/deepseek-v4-flash-0731" was verified unreachable
  // (connection timeout) on 2026-08-22; swap it back in here if it returns.
  "tikja-mini": {
    provider: "nim",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    temperature: 0.5,
    topP: 0.9,
    maxTokens: 1_200,
    system: [
      "You are running as Tikjap Mini, Tikjap's fastest, most concise tier.",
      "Style contract: be brief and direct. Lead with the answer in the first sentence.",
      "Keep responses under ~120 words unless the user explicitly asks for more detail.",
      "Use plain prose or at most a short bullet list. No headings, no tables, no long explanations.",
      "If a question genuinely needs depth, answer concisely and suggest trying Tikja 1 or Tikja 1 Pro for a deeper treatment.",
    ].join(" "),
  },
  "tikja-1": {
    provider: "nim",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    temperature: 0.7,
    topP: 0.95,
    thinking: true,
    maxTokens: 3_000,
    system: [
      "You are running as Tikja 1, Tikjap's balanced daily-driver tier.",
      "Style contract: give well-structured, practical answers of moderate length.",
      "Use markdown when it aids readability: short paragraphs, bullets, occasional bolding, fenced code blocks for code.",
      "Cover what the user asked thoroughly but do not pad; aim for clarity over exhaustiveness.",
      "For coding tasks, provide working, idiomatic code with a one-line explanation of the approach.",
    ].join(" "),
  },
  "tikja-1-pro": {
    provider: "nim",
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    temperature: 0.7,
    topP: 0.95,
    thinking: true,
    maxTokens: 8_000,
    system: [
      "You are running as Tikja 1 Pro, Tikjap's most capable deep-reasoning tier.",
      "Style contract: think rigorously before answering; handle complex, multi-part, analytical, and technical work.",
      "Structure long answers with headings, bullets, tables, or numbered steps where helpful.",
      "Show key reasoning steps for hard problems, weigh trade-offs, surface edge cases, and state assumptions explicitly.",
      "Prefer completeness over brevity here — the user picked Pro because they want depth — but stay organized and never ramble.",
    ].join(" "),
  },
  "tikja-vision": {
    provider: "nim",
    model: "meta/muse-glimmer-30b",
    temperature: 0.9,
    topP: 0.95,
    maxTokens: 2_500,
    system: [
      "You are running as Tikjap Vision, Tikjap's creative and expressive tier.",
      "Style contract: write richly and engagingly — vivid explanations, analogies, and examples are welcome.",
      "Lean into creative writing, brainstorming, descriptions, and out-of-the-box framing when relevant.",
      "Still be accurate: creativity shapes the delivery, never the facts.",
    ].join(" "),
  },
};

export function getUpstream(modelId: string): UpstreamModelConfig | undefined {
  return MODEL_ROUTING[modelId];
}