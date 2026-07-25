"use client";
import { useEffect, useState } from "react";

type Health = {
  database: { ok: boolean; latencyMs: number };
  storage: { ok: boolean; buckets: string[] };
  chat: { runs24h: number; errorRate: number; averageLatencyMs: number | null; p95LatencyMs: number | null };
  jobs: { queueDepth: number; failed: number };
  rag: { ok: boolean; runs24h: number; failures24h: number };
  providers: Array<{ id: string; name: string; health_status: string; circuit_state: string; last_latency_ms?: number; last_error_code?: string }>;
  mcp: Array<{ id: string; name: string; status: string; last_latency_ms?: number; last_error_code?: string }>;
  application: { version: string; migrationTarget: string };
};

export function HealthDashboard() {
  const [health, setHealth] = useState<Health>();
  const [error, setError] = useState("");
  const load = async () => {
    const response = await fetch("/api/v1/admin/health", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) setError("تعذر تحميل حالة الأنظمة.");
    else setHealth(body.data);
  };
  useEffect(() => { queueMicrotask(() => void load()); }, []);
  if (error) return <p className="error-state">{error}</p>;
  if (!health) return <div className="skeleton">جارٍ فحص الأنظمة…</div>;
  return <div className="stack">
    <div className="admin-grid">
      <article className="admin-card"><small>قاعدة البيانات</small><strong>{health.database.ok ? "سليمة" : "متعذرة"}</strong><p>{health.database.latencyMs}ms</p></article>
      <article className="admin-card"><small>التخزين</small><strong>{health.storage.ok ? "سليم" : "متعذر"}</strong><p>{health.storage.buckets.length} حاويات</p></article>
      <article className="admin-card"><small>الدردشة 24 ساعة</small><strong>{health.chat.runs24h}</strong><p>أخطاء {(health.chat.errorRate * 100).toFixed(1)}% · p95 {health.chat.p95LatencyMs ?? "—"}ms</p></article>
      <article className="admin-card"><small>المهام</small><strong>{health.jobs.queueDepth}</strong><p>{health.jobs.failed} فاشلة</p></article>
      <article className="admin-card"><small>RAG</small><strong>{health.rag.ok ? "سليم" : "متعذر"}</strong><p>{health.rag.runs24h} عملية · {health.rag.failures24h} فشل</p></article>
      <article className="admin-card"><small>الإصدار</small><strong>{health.application.version}</strong><p>Migration {health.application.migrationTarget}</p></article>
    </div>
    <h2>المزودات</h2>
    <div className="data-table">{health.providers.map((provider) => <div className="table-row" key={provider.id}><span>{provider.name}<small>{provider.last_error_code ?? "لا خطأ أخير"}</small></span><span>{provider.health_status}</span><span>{provider.circuit_state}</span><span>{provider.last_latency_ms ?? "—"}ms</span></div>)}</div>
    <h2>MCP</h2>
    <div className="data-table">{health.mcp.map((server) => <div className="table-row" key={server.id}><span>{server.name}<small>{server.last_error_code ?? "لا خطأ أخير"}</small></span><span>{server.status}</span><span>{server.last_latency_ms ?? "—"}ms</span><span/></div>)}</div>
    <button className="button secondary" onClick={() => void load()}>إعادة الفحص</button>
  </div>;
}
