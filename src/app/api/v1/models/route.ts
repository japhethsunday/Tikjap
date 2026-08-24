import { withHandler } from "@/server/handler";
import { requireUser } from "@/server/http";
import { MODEL_CATALOG } from "@/server/models";
import { ALL_TOOLS } from "@/server/tools";

export async function GET() {
  return withHandler(async () => {
    await requireUser();
    // Report which tools this deployment can actually run so the composer can
    // disable the ones whose credentials are missing, instead of offering a
    // control that silently does nothing.
    return {
      models: MODEL_CATALOG,
      tools: ALL_TOOLS.map((tool) => ({
        id: tool.id,
        name: tool.name,
        description: tool.description,
        available: tool.isAvailable?.() ?? true,
        unavailableReason: tool.isAvailable?.() === false ? tool.unavailableReason?.() : undefined,
      })),
    };
  });
}

export const dynamic = "force-dynamic";