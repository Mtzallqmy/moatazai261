"use client";

import { useCallback, useEffect, useState } from "react";

type Tool = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  tool_type: string;
  risk_level: "low" | "medium" | "high";
  requires_confirmation: boolean;
  enabled: boolean;
  tool_permissions?: Array<{ count: number }>;
  agent_tools?: Array<{ count: number }>;
};

export function ToolManager() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/admin/tools");
    const body = await response.json();
    if (response.ok) setTools(body.data ?? []);
    else setMessage(body.error?.message ?? "تعذر تحميل الأدوات.");
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function update(tool: Tool, values: { enabled?: boolean; requiresConfirmation?: boolean }) {
    setBusy(tool.id);
    setMessage("");
    const response = await fetch("/api/v1/admin/tools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tool.id, ...values }),
    });
    const body = await response.json();
    setMessage(response.ok ? "تم تحديث سياسة الأداة وتسجيل العملية." : body.error?.message ?? "فشل التحديث.");
    await load();
    setBusy("");
  }

  return <div className="stack">
    {message && <p className="notice" role="status">{message}</p>}
    <div className="data-table">
      <div className="table-row table-head"><b>الأداة</b><b>المخاطر</b><b>السياسة</b><b>التشغيل</b></div>
      {tools.map((tool) => <div className="table-row" key={tool.id}>
        <span><b>{tool.name}</b><small>{tool.slug} · {tool.tool_type}</small></span>
        <span className={`status-badge risk-${tool.risk_level}`}>{tool.risk_level}</span>
        <span>{tool.requires_confirmation ? "تتطلب تأكيد المستخدم" : "تنفيذ مباشر حسب الصلاحية"}</span>
        <span className="inline-actions">
          <button className="button secondary" disabled={busy === tool.id}
            onClick={() => void update(tool, { requiresConfirmation: !tool.requires_confirmation })}>
            {tool.requires_confirmation ? "إلغاء التأكيد" : "فرض التأكيد"}
          </button>
          <button className={`button ${tool.enabled ? "danger" : "primary"}`} disabled={busy === tool.id}
            onClick={() => void update(tool, { enabled: !tool.enabled })}>
            {tool.enabled ? "تعطيل" : "تفعيل"}
          </button>
        </span>
      </div>)}
      {!tools.length && <p className="empty-state">لا توجد أدوات مسجلة. الأدوات الداخلية تُسجل من كود موثوق أو عبر MCP بعد فحصه.</p>}
    </div>
  </div>;
}
