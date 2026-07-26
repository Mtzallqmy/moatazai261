"use client";
import { useEffect, useState } from "react";
import { agentPresets } from "@/features/agents/presets";

type Model = { id: string; display_name: string; ai_providers: { name: string } };
type Agent = { id: string; name: string; slug: string; status: string; ai_models?: { display_name?: string } };
type KnowledgeBase = { id: string; name: string };
type Tool = { id: string; name: string; slug: string; enabled: boolean; risk_level: string };

export function AgentManager() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [presetSlug, setPresetSlug] = useState(agentPresets[0].slug);
  const selectedPreset = agentPresets.find((preset) => preset.slug === presetSlug) ?? agentPresets[0];
  const load = async () => {
    const [agentResponse, modelResponse, knowledgeResponse, toolResponse] = await Promise.all([
      fetch("/api/v1/admin/agents"), fetch("/api/v1/models"),
      fetch("/api/v1/knowledge-bases"), fetch("/api/v1/admin/tools"),
    ]);
    const [agentBody, modelBody, knowledgeBody, toolBody] = await Promise.all([
      agentResponse.json(), modelResponse.json(), knowledgeResponse.json(), toolResponse.json(),
    ]);
    setAgents(agentBody.data ?? []);
    setModels(modelBody.data ?? []);
    setKnowledgeBases(knowledgeBody.data ?? []);
    setTools((toolBody.data ?? []).filter((tool: Tool) => tool.enabled));
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
      defaultModelId: formData.get("defaultModelId") ? String(formData.get("defaultModelId")) : null,
      knowledgeBaseId: formData.get("knowledgeBaseId") ? String(formData.get("knowledgeBaseId")) : null,
      status: String(formData.get("status") ?? "draft"),
      temperature: Number(formData.get("temperature") ?? 0.2),
      maxTokens: Number(formData.get("maxTokens") ?? 4096),
      memoryEnabled: formData.get("memoryEnabled") === "on",
      toolIds: formData.getAll("toolIds").map(String),
      allowedRoles: ["user"],
      policy: selectedPreset.policy,
    };
    const response = await fetch("/api/v1/admin/agents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    setMessage(response.ok ? "تم إنشاء الوكيل وإصداره الأول." : payload.error?.message ?? "تعذر إنشاء الوكيل.");
    if (response.ok) await load();
    setBusy(false);
  }

  return <div className="stack">
    <section className="agent-preset-grid" aria-label="قوالب الوكلاء">
      {agentPresets.map((preset) => <button
        type="button"
        className={preset.slug === presetSlug ? "agent-preset active" : "agent-preset"}
        onClick={() => setPresetSlug(preset.slug)}
        key={preset.slug}
      >
        <b>{preset.name}</b>
        <span>{preset.description}</span>
        <small>{preset.policy.maxSteps} خطوات · {preset.policy.timeoutMs / 1000} ثانية</small>
      </button>)}
    </section>
    <form className="admin-card form-grid" key={selectedPreset.slug} action={(formData) => void submit(formData)}>
      <label>الاسم<input name="name" required minLength={2} defaultValue={selectedPreset.name} /></label>
      <label>المعرّف<input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,79}" defaultValue={selectedPreset.slug} placeholder="research-agent" /></label>
      <label>الوصف<input name="description" defaultValue={selectedPreset.description} /></label>
      <label>النموذج الافتراضي<select name="defaultModelId"><option value="">بدون نموذج — مسودة</option>{models.map((model) => <option key={model.id} value={model.id}>{model.display_name} — {model.ai_providers.name}</option>)}</select></label>
      <label>قاعدة المعرفة<select name="knowledgeBaseId"><option value="">بدون قاعدة معرفة</option>{knowledgeBases.map((base) => <option key={base.id} value={base.id}>{base.name}</option>)}</select></label>
      <label className="wide">تعليمات النظام<textarea name="systemPrompt" required rows={6} defaultValue={selectedPreset.systemPrompt} /></label>
      <label>Temperature<input name="temperature" type="number" min="0" max="2" step="0.1" defaultValue={selectedPreset.temperature} /></label>
      <label>Max tokens<input name="maxTokens" type="number" min="1" max="128000" defaultValue={selectedPreset.maxTokens} /></label>
      <label>الحالة<select name="status" defaultValue="draft"><option value="draft">مسودة</option><option value="active">مفعّل</option><option value="disabled">معطّل</option></select></label>
      <label><input name="memoryEnabled" type="checkbox" /> تفعيل الذاكرة المراجعة</label>
      <fieldset className="wide tool-picker"><legend>الأدوات المسموحة</legend>
        {tools.map((tool) => <label key={tool.id}><input type="checkbox" name="toolIds" value={tool.id} /><span>{tool.name}</span><small>{tool.slug} · {tool.risk_level}</small></label>)}
        {!tools.length && <p className="empty-state">لا توجد أدوات مفعّلة. فعّل الأدوات الداخلية أو أدوات MCP أولًا.</p>}
      </fieldset>
      <button className="button primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : "إنشاء وكيل فعلي"}</button>
    </form>
    {message && <p className="notice">{message}</p>}
    <div className="data-table">
      <div className="table-row table-head"><b>الوكيل</b><b>الحالة</b><b>النموذج</b><b>المعرّف</b></div>
      {agents.map((agent) => <div className="table-row" key={agent.id}><span>{agent.name}</span><span>{agent.status}</span><span>{agent.ai_models?.display_name ?? "غير معيّن"}</span><code>{agent.slug}</code></div>)}
      {agents.length === 0 && <p className="empty-state">لا يوجد وكلاء بعد. لن يظهر وضع الوكيل للمستخدم حتى إنشاء وكيل مفعّل.</p>}
    </div>
  </div>;
}
