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