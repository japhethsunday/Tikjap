import { withHandler } from "@/server/handler";
import { createServiceClient } from "@/server/supabase";
import { configuredSearchProvider } from "@/server/tools/search";
import { availableTools } from "@/server/tools";

/**
 * Deployment health and capability check.
 *
 * Every value here is a boolean or a fixed label — never a key, an endpoint, a
 * connection string or a provider identifier. It answers "is this deployment
 * configured and can it reach its database", which is what you need when a
 * feature is quietly inert, without handing an unauthenticated caller anything
 * they could use.
 *
 * It is deliberately public: a signed-out operator needs to be able to check a
 * deployment, and everything reported is already inferable from the UI after
 * signing in (a tool with no key renders as disabled). The one thing it adds is
 * a real database round trip, so a misconfiguration shows up here rather than
 * as a mysterious 500 somewhere else.
 */
export async function GET() {
  return withHandler(async () => {
    const inference = Boolean((process.env.AI_GATEWAY_API_KEY ?? process.env.NVIDIA_API_KEY ?? "").trim());
    const search = configuredSearchProvider() !== "none";
    const images = Boolean(process.env.IMAGE_GATEWAY_URL?.trim()) && inference;
    const scheduler = Boolean(process.env.CRON_SECRET?.trim());

    // A cheap, real query — head-only count against a table that always exists.
    // Reports reachability without reading anyone's rows.
    let database = false;
    try {
      const { error } = await createServiceClient()
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .limit(1);
      database = !error;
    } catch {
      database = false;
    }

    const tools = availableTools().map((tool) => tool.id).sort();

    return {
      health: {
        ok: database && inference,
        mode: process.env.NEXT_PUBLIC_APP_MODE === "live" ? "live" : "demo",
        database,
        inference,
        search,
        images,
        scheduler,
        // Which capabilities this deployment can actually run right now.
        tools,
      },
    };
  });
}

export const dynamic = "force-dynamic";
