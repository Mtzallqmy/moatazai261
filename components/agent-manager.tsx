"use client";
import { useEffect, useState } from "react";

type Model = { id: string; display_name: string; ai_providers: { name: string } };
type Agent = { id: string; name: string; slug: string; status: string; ai_models?: { display_name?: string } };

export function AgentManager() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const [agentResponse, modelResponse] = await Promise.all([fetch("/api/v1/admin/agents"), fetch("/api/v1/models")]);
    const [agentBody, modelBody] = await Promise.all([agentResponse.json(), modelResponse.json()]);
    setAgents(agentBody.data ?? []);
    setModels(modelBody.data ?? []);
  };
  useEffect(() => { queueMicrotask(() => void load()); }, []);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    const body = {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      description: String(formData.get("description") ?? ""),
      systemPrompt: String(formData.get("systemPrompt") ?? ""),
      defaultModelId: String(formData.get("defaultModelId") ?? ""),
      status: String(formData.get("status") ?? "draft"),
      temperature: Number(formData.get("temperature") ?? 0.2),
      maxTokens: Number(formData.get("maxTokens") ?? 4096),
      memoryEnabled: formData.get("memoryEnabled") === "on",
      toolIds: [],
      allowedRoles: ["user"],
      policy: { maxSteps: 8, timeoutMs: 120000, maxCostUsd: 1, requireEvidence: false, minimumConfidence: 0.55 },
    };
    const response = await fetch("/api/v1/admin/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    setMessage(response.ok ? "تم إنشاء الوكيل وإصداره الأول." : payload.error?.message ?? "تعذر إنشاء الوكيل.");
    if (response.ok) await load();
    setBusy(false);
  }

  return <div className="stack">
    <form className="admin-card form-grid" action={(formData) => void submit(formData)}>
      <label>الاسم<input name="name" required minLength={2} /></label>
      <label>المعرّف<input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,79}" placeholder="research-agent" /></label>
      <label>الوصف<input name="description" /></label>
      <label>النموذج الافتراضي<select name="defaultModelId" required><option value="">اختر نموذجًا مفعّلًا</option>{models.map((model) => <option key={model.id} value={model.id}>{model.display_name} — {model.ai_providers.name}</option>)}</select></label>
      <label className="wide">تعليمات النظام<textarea name="systemPrompt" required rows={6} /></label>
      <label>Temperature<input name="temperature" type="number" min="0" max="2" step="0.1" defaultValue="0.2" /></label>
      <label>Max tokens<input name="maxTokens" type="number" min="1" max="128000" defaultValue="4096" /></label>
      <label>الحالة<select name="status" defaultValue="draft"><option value="draft">مسودة</option><option value="active">مفعّل</option><option value="disabled">معطّل</option></select></label>
      <label><input name="memoryEnabled" type="checkbox" /> تفعيل الذاكرة المراجعة</label>
      <button className="button primary" disabled={busy || models.length === 0}>{busy ? "جارٍ الحفظ…" : "إنشاء وكيل فعلي"}</button>
    </form>
    {message && <p className="notice">{message}</p>}
    <div className="data-table">
      <div className="table-row table-head"><b>الوكيل</b><b>الحالة</b><b>النموذج</b><b>المعرّف</b></div>
      {agents.map((agent) => <div className="table-row" key={agent.id}><span>{agent.name}</span><span>{agent.status}</span><span>{agent.ai_models?.display_name ?? "غير معيّن"}</span><code>{agent.slug}</code></div>)}
      {agents.length === 0 && <p className="empty-state">لا يوجد وكلاء بعد. لن يظهر وضع الوكيل للمستخدم حتى إنشاء وكيل مفعّل.</p>}
    </div>
  </div>;
}
