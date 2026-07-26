"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { HealthIssue, PlatformHealthStatus } from "@/services/platform-health";

type Health = {
  summary: { status: PlatformHealthStatus; score: number; issues: HealthIssue[] };
  checkedAt: string;
  database: { ok: boolean; latencyMs: number };
  storage: { ok: boolean; latencyMs: number; buckets: string[] };
  chat: { runs24h: number; errorRate: number; averageLatencyMs: number | null; p95LatencyMs: number | null };
  jobs: { queueDepth: number; failed: number };
  rag: { ok: boolean; runs24h: number; failures24h: number };
  providers: Array<{ id: string; name: string; enabled: boolean; health_status: string; circuit_state: string; last_latency_ms?: number; last_error_code?: string; last_health_check_at?: string }>;
  mcp: Array<{ id: string; name: string; status: string; last_latency_ms?: number; last_error_code?: string; last_checked_at?: string }>;
  application: { version: string; migrationTarget: string };
};

const statusLabel: Record<PlatformHealthStatus, string> = {
  operational: "الأنظمة تعمل بصورة طبيعية",
  degraded: "توجد عناصر تحتاج المراجعة",
  outage: "يوجد انقطاع تشغيلي",
};

export function HealthDashboard() {
  const [health, setHealth] = useState<Health>();
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = async () => {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/v1/admin/health", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) {
        setError(`${body.error?.message ?? "تعذر تحميل حالة الأنظمة."} ${body.error?.requestId ? `رقم التتبع: ${body.error.requestId}` : ""}`);
      } else {
        setHealth(body.data);
      }
    } catch {
      setError("تعذر الاتصال بخدمة التشخيص. تحقق من الشبكة ثم أعد المحاولة.");
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => { queueMicrotask(() => void load()); }, []);
  if (error && !health) return <div className="health-error"><p className="error-state" role="alert">{error}</p><button className="button secondary" onClick={() => void load()}>إعادة المحاولة</button></div>;
  if (!health) return <div className="skeleton">جارٍ فحص الأنظمة…</div>;
  return <div className="health-command">
    <section className={`health-overview ${health.summary.status}`}>
      <div className="health-score" aria-label={`درجة الصحة ${health.summary.score} من 100`}>
        <strong>{health.summary.score}</strong><span>/100</span>
      </div>
      <div>
        <span className="panel-kicker">LIVE OPERATIONS</span>
        <h2>{statusLabel[health.summary.status]}</h2>
        <p>آخر فحص {new Date(health.checkedAt).toLocaleString("ar")} · الإصدار {health.application.version}</p>
      </div>
      <button className="button secondary" disabled={refreshing} onClick={() => void load()}>
        {refreshing ? "جارٍ الفحص…" : "إعادة الفحص"}
      </button>
    </section>
    {error && <p className="error-state" role="alert">{error}</p>}
    {health.summary.issues.length > 0 && <section className="health-issues">
      <header><div><span className="panel-kicker">ATTENTION</span><h2>عناصر تحتاج إجراء</h2></div><span>{health.summary.issues.length}</span></header>
      <div>{health.summary.issues.map((issue, index) => {
        const content = <><span className={`issue-indicator ${issue.severity}`} /><div><b>{issue.title}</b><small>{issue.detail}</small></div><em>{issue.severity === "critical" ? "حرج" : issue.severity === "warning" ? "تنبيه" : "معلومة"}</em></>;
        return issue.href
          ? <Link href={issue.href} key={`${issue.code}-${index}`}>{content}</Link>
          : <article key={`${issue.code}-${index}`}>{content}</article>;
      })}</div>
    </section>}
    <div className="health-metrics">
      <article><span className={`metric-signal ${health.database.ok ? "ok" : "bad"}`} /><small>قاعدة البيانات</small><strong>{health.database.ok ? "متصلة" : "متعذرة"}</strong><p>{health.database.latencyMs}ms زمن الفحص</p></article>
      <article><span className={`metric-signal ${health.storage.ok ? "ok" : "bad"}`} /><small>التخزين</small><strong>{health.storage.ok ? "متصل" : "متعذر"}</strong><p>{health.storage.buckets.length} حاويات · {health.storage.latencyMs}ms</p></article>
      <article><span className={`metric-signal ${health.chat.errorRate < .1 ? "ok" : "warn"}`} /><small>الدردشة · 24 ساعة</small><strong>{health.chat.runs24h}</strong><p>أخطاء {(health.chat.errorRate * 100).toFixed(1)}% · p95 {health.chat.p95LatencyMs ?? "—"}ms</p></article>
      <article><span className={`metric-signal ${health.jobs.failed ? "warn" : "ok"}`} /><small>المهام</small><strong>{health.jobs.queueDepth}</strong><p>{health.jobs.failed} فاشلة</p></article>
      <article><span className={`metric-signal ${health.rag.ok && !health.rag.failures24h ? "ok" : "warn"}`} /><small>RAG</small><strong>{health.rag.runs24h}</strong><p>{health.rag.failures24h} فشل خلال 24 ساعة</p></article>
      <article><span className="metric-signal ok" /><small>قاعدة المخطط</small><strong>محدّثة</strong><p>{health.application.migrationTarget}</p></article>
    </div>
    <section className="health-resource-grid">
      <article className="health-resource-panel">
        <header><div><span className="panel-kicker">PROVIDERS</span><h2>المزودات</h2></div><Link href="/admin/providers">الإدارة</Link></header>
        <div>{health.providers.length ? health.providers.map((provider) => <div className="resource-row" key={provider.id}>
          <span className={`resource-dot ${provider.health_status}`} />
          <div><b>{provider.name}</b><small>{provider.last_error_code ?? (provider.enabled ? "لا يوجد خطأ أخير" : "معطّل إداريًا")}</small></div>
          <span>{provider.circuit_state}</span><em>{provider.last_latency_ms ?? "—"}ms</em>
        </div>) : <p className="health-empty">لا توجد مزودات مسجلة بعد.</p>}</div>
      </article>
      <article className="health-resource-panel">
        <header><div><span className="panel-kicker">MCP SERVERS</span><h2>خوادم الأدوات</h2></div><Link href="/admin/mcp">الإدارة</Link></header>
        <div>{health.mcp.length ? health.mcp.map((server) => <div className="resource-row" key={server.id}>
          <span className={`resource-dot ${server.status}`} />
          <div><b>{server.name}</b><small>{server.last_error_code ?? "لا يوجد خطأ أخير"}</small></div>
          <span>{server.status}</span><em>{server.last_latency_ms ?? "—"}ms</em>
        </div>) : <p className="health-empty">لا توجد خوادم MCP مفعّلة.</p>}</div>
      </article>
    </section>
  </div>;
}
