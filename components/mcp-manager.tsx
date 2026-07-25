"use client";
import { useEffect, useState } from "react";

type Server = { id: string; name: string; transport: string; endpoint: string; status: string; key_hint?: string; last_latency_ms?: number; mcp_tools?: Array<{ id: string }>; mcp_resources?: Array<{ id: string }> };
export function McpManager() {
  const [servers, setServers] = useState<Server[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await fetch("/api/v1/admin/mcp");
    const body = await response.json();
    setServers(body.data ?? []);
  };
  useEffect(() => { queueMicrotask(() => void load()); }, []);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/v1/admin/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        transport: String(formData.get("transport") ?? "http"),
        endpoint: String(formData.get("endpoint") ?? ""),
        authType: String(formData.get("authType") ?? "none"),
        secret: String(formData.get("secret") ?? "") || undefined,
        headerName: String(formData.get("headerName") ?? "") || undefined,
        enabled: true,
        timeoutMs: 15000,
      }),
    });
    const body = await response.json();
    setMessage(response.ok ? `تم الفحص والحفظ. اكتُشفت ${body.data.toolsDiscovered} أداة.` : body.error?.message ?? "فشل الاتصال.");
    if (response.ok) await load();
    setBusy(false);
  }

  async function test(id: string) {
    setMessage("جارٍ اختبار الاتصال…");
    const response = await fetch(`/api/v1/admin/mcp/${id}/test`, { method: "POST" });
    const body = await response.json();
    setMessage(response.ok ? `الاتصال سليم خلال ${body.data.latencyMs}ms.` : body.error?.message ?? "فشل الاختبار.");
    await load();
  }

  return <div className="stack">
    <form className="admin-card form-grid" action={(formData) => void submit(formData)}>
      <label>الاسم<input name="name" required minLength={2} /></label>
      <label>النقل<select name="transport"><option value="http">Streamable HTTP</option><option value="sse">SSE</option></select></label>
      <label className="wide">Endpoint<input name="endpoint" type="url" required placeholder="https://mcp.example.com/mcp" /></label>
      <label>المصادقة<select name="authType"><option value="none">بدون مصادقة</option><option value="bearer">Bearer</option><option value="api_key_header">API Key Header</option><option value="custom_headers">Custom Headers JSON</option></select></label>
      <label>اسم Header<input name="headerName" placeholder="X-API-Key" /></label>
      <label className="wide">السر الجديد<input name="secret" type="password" autoComplete="new-password" /></label>
      <label className="wide">الوصف<input name="description" /></label>
      <button className="button primary" disabled={busy}>{busy ? "فحص وحفظ…" : "فحص الاتصال ثم الحفظ"}</button>
    </form>
    {message && <p className="notice">{message}</p>}
    <div className="data-table">{servers.map((server) => <div className="table-row" key={server.id}>
      <span>{server.name}<small>{server.endpoint}</small></span>
      <span>{server.status}<small>{server.last_latency_ms ? `${server.last_latency_ms}ms` : "لم يُفحص"}</small></span>
      <span>{server.mcp_tools?.length ?? 0} أداة · {server.mcp_resources?.length ?? 0} مورد</span>
      <button className="button secondary" onClick={() => void test(server.id)}>اختبار</button>
    </div>)}</div>
  </div>;
}
