import type { AIModel } from "@/lib/types";

/**
 * The model catalog is owned by the backend. The frontend never hardcodes
 * models — it fetches this list at runtime.
 */
export const MODEL_CATALOG: AIModel[] = [
  {
    id: "tikja-mini",
    name: "Tikja Mini",
    description: "Fast and efficient for everyday questions and quick tasks.",
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
    description: "Advanced reasoning, larger context, and heavier lifting.",
    provider: "tikja",
    contextWindow: 128_000,
    maxOutputTokens: 8_000,
    capabilities: { vision: true, files: true, streaming: true, toolUse: true },
  },
  {
    id: "tikja-vision",
    name: "Tikja Vision",
    description: "Multimodal model for images and visual documents.",
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
 */
export interface UpstreamModelConfig {
  provider: "nim";
  model: string;
  temperature?: number;
  topP?: number;
  thinking?: boolean;
}

export const MODEL_ROUTING: Record<string, UpstreamModelConfig> = {
  // NOTE: "deepseek-ai/deepseek-v4-flash-0731" was verified unreachable
  // (connection timeout) on 2026-08-22; swap it back in here if it returns.
  "tikja-mini": {
    provider: "nim",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    temperature: 0.8,
    topP: 0.95,
  },
  "tikja-1": {
    provider: "nim",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    temperature: 1,
    topP: 0.95,
    thinking: true,
  },
  "tikja-1-pro": {
    provider: "nim",
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    temperature: 1,
    topP: 0.95,
    thinking: true,
  },
  "tikja-vision": {
    provider: "nim",
    model: "meta/muse-glimmer-30b",
    temperature: 1,
    topP: 0.95,
  },
};

export function getUpstream(modelId: string): UpstreamModelConfig | undefined {
  return MODEL_ROUTING[modelId];
}