import { getCurrentUser, hasCurrentPermission } from "@/lib/auth/guards";
import { errorResponse, AppError, ErrorCode } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPlatformHealthSummary } from "@/services/platform-health";

export const dynamic = "force-dynamic";
export async function GET() {
  const requestId = crypto.randomUUID();
  try {
    const user = await getCurrentUser();
    if (!user || !await hasCurrentPermission("logs.read")) {
      throw new AppError(ErrorCode.FORBIDDEN, "لا تملك صلاحية عرض تشخيص المنصة.", 403);
    }
    const admin = createAdminClient();
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const timed = async <T,>(operation: PromiseLike<T>) => {
      const startedAt = performance.now();
      const result = await operation;
      return { result, latencyMs: Math.round(performance.now() - startedAt) };
    };
    const [databaseCheck, storageCheck, providers, mcp, runs, queued, failedJobs, rag] = await Promise.all([
      timed(admin.from("platform_settings").select("id", { count: "exact", head: true })),
      timed(admin.storage.listBuckets()),
      admin.from("ai_providers").select("id,name,enabled,health_status,last_latency_ms,last_success_at,last_error_code,consecutive_failures,circuit_state,last_health_check_at").order("priority"),
      admin.from("mcp_servers").select("id,name,status,last_latency_ms,last_checked_at,last_error_code").eq("enabled", true),
      admin.from("chat_runs").select("latency_ms,status,started_at").gte("started_at", since).limit(5_000),
      admin.from("background_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
      admin.from("background_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      admin.from("retrieval_runs").select("status,confidence,created_at").gte("created_at", since).limit(1_000),
    ]);
    const database = databaseCheck.result;
    const buckets = storageCheck.result;
    const runRows = runs.data ?? [];
    const ragRows = rag.data ?? [];
    const providerRows = providers.data ?? [];
    const mcpRows = mcp.data ?? [];
    const latencies = runRows
      .map((run) => run.latency_ms)
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => a - b);
    const failures = runRows.filter((run) => run.status === "failed").length;
    const ragFailures = ragRows.filter((run) => run.status === "failed").length;
    const summary = buildPlatformHealthSummary({
      databaseOk: !database.error,
      storageOk: !buckets.error,
      chatRuns: runRows.length,
      chatFailures: failures,
      failedJobs: failedJobs.count ?? 0,
      ragRuns: ragRows.length,
      ragFailures,
      providers: providerRows,
      mcp: mcpRows,
    });
    return Response.json({
      data: {
        summary,
        checkedAt: new Date().toISOString(),
        database: { ok: !database.error, latencyMs: databaseCheck.latencyMs },
        storage: {
          ok: !buckets.error,
          latencyMs: storageCheck.latencyMs,
          buckets: buckets.data?.map((bucket) => bucket.name) ?? [],
        },
        providers: providerRows,
        mcp: mcpRows,
        rag: { ok: !rag.error, runs24h: ragRows.length, failures24h: ragFailures },
        chat: {
          runs24h: runRows.length,
          errorRate: runRows.length ? failures / runRows.length : 0,
          averageLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
          p95LatencyMs: latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : null,
        },
        jobs: { queueDepth: queued.count ?? 0, failed: failedJobs.count ?? 0 },
        application: { version: process.env.npm_package_version ?? "0.1.0", migrationTarget: "20260726050000" },
      },
    }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Request-ID": requestId,
      },
    });
  } catch (cause) {
    return errorResponse(cause, requestId);
  }
}
