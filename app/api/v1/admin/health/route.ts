import { getCurrentUser, hasCurrentPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("logs.read")) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const admin = createAdminClient();
  const started = Date.now();
  const [database, buckets, providers, mcp, runs, queued, failedJobs, rag] = await Promise.all([
    admin.from("platform_settings").select("id", { count: "exact", head: true }),
    admin.storage.listBuckets(),
    admin.from("ai_providers").select("id,name,health_status,last_latency_ms,last_success_at,last_error_code,consecutive_failures,circuit_state,last_health_check_at").order("priority"),
    admin.from("mcp_servers").select("id,name,status,last_latency_ms,last_checked_at,last_error_code").eq("enabled", true),
    admin.from("chat_runs").select("latency_ms,status,started_at").gte("started_at", new Date(Date.now() - 86_400_000).toISOString()).limit(5_000),
    admin.from("background_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]),
    admin.from("background_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin.from("retrieval_runs").select("status,confidence,created_at").gte("created_at", new Date(Date.now() - 86_400_000).toISOString()).limit(1_000),
  ]);
  const latencies = (runs.data ?? []).map((run) => run.latency_ms).filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
  const failures = (runs.data ?? []).filter((run) => run.status === "failed").length;
  return Response.json({
    data: {
      database: { ok: !database.error, latencyMs: Date.now() - started },
      storage: { ok: !buckets.error, buckets: buckets.data?.map((bucket) => bucket.name) ?? [] },
      providers: providers.data ?? [],
      mcp: mcp.data ?? [],
      rag: {
        ok: !rag.error,
        runs24h: rag.data?.length ?? 0,
        failures24h: rag.data?.filter((run) => run.status === "failed").length ?? 0,
      },
      chat: {
        runs24h: runs.data?.length ?? 0,
        errorRate: runs.data?.length ? failures / runs.data.length : 0,
        averageLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
        p95LatencyMs: latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] : null,
      },
      jobs: { queueDepth: queued.count ?? 0, failed: failedJobs.count ?? 0 },
      application: { version: process.env.npm_package_version ?? "0.1.0", migrationTarget: "20260726023000" },
    },
  });
}
