import { withHandler } from "@/server/handler";
import { requireAdmin } from "@/server/http";
import { adminMetrics } from "@/server/usage";
import { nowISO } from "@/server/db";

export async function GET() {
  return withHandler(async () => {
    await requireAdmin();
    const metrics = await adminMetrics();
    const failureRate = metrics.aiRequests > 0 ? metrics.failedRequests / metrics.aiRequests : 0;
    return {
      stats: {
        ...metrics,
        status: failureRate > 0.25 ? "degraded" : "operational",
        generatedAt: nowISO(),
      },
    };
  });
}

export const dynamic = "force-dynamic";