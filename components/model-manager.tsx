"use client";

import { useEffect, useState } from "react";

type Provider = { id: string; name: string; enabled: boolean };
type Model = {
  id: string;
  display_name: string;
  model_key: string;
  model_alias?: string;
  enabled: boolean;
  visible_to_users: boolean;
  is_default: boolean;
  billing_tier: string;
  release_stage: string;
  ai_providers: { id: string; name: string; slug: string };
};

const capabilityNames = [
  ["streaming", "Streaming"],
  ["tools", "Tool Calling"],
  ["vision", "Vision"],
  ["audio", "Audio"],
  ["video", "Video"],
  ["documents", "Documents"],
  ["embeddings", "Embeddings"],
  ["structuredOutput", "Structured Output"],
] as const;

export function ModelManager() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>();

  async function load() {
    const [providerResponse, modelResponse] = await Promise.all([
      fetch("/api/v1/admin/providers"),
      fetch("/api/v1/admin/models"),
    ]);
    const [providerBody, modelBody] = await Promise.all([
      providerResponse.json().catch(() => null),
      modelResponse.json().catch(() => null),
    ]);
    if (!providerResponse.ok || !modelResponse.ok) {
      setError("تعذر تحميل المزودات والنماذج.");
      return;
    }
    setProviders(providerBody?.data ?? []);
    setModels(modelBody?.data ?? []);
  }

  useEffect(() => { queueMicrotask(() => void load()); }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const capability = (name: string) => form.get(name) === "on";
    const number = (name: string) => {
      const value = String(form.get(name) ?? "").trim();
      return value ? Number(value) : undefined;
    };
    const vision = capability("vision");
    const audio = capability("audio");
    const video = capability("video");
    const documents = capability("documents");
    const payload = {
      providerId: String(form.get("providerId")),
      modelKey: String(form.get("modelKey")),
      modelAlias: String(form.get("modelAlias") ?? "").trim() || undefined,
      displayName: String(form.get("displayName")),
      description: String(form.get("description") ?? "").trim() || undefined,
      enabled: form.get("enabled") === "on",
      visibleToUsers: form.get("visibleToUsers") === "on",
      isDefault: false,
      contextWindow: number("contextWindow"),
      maxOutputTokens: number("maxOutputTokens"),
      maxMessageChars: number("maxMessageChars") ?? 100_000,
      inputModalities: ["text", ...(vision ? ["image"] : []), ...(audio ? ["audio"] : []), ...(video ? ["video"] : []), ...(documents ? ["document"] : [])],
      outputModalities: ["text"],
      capabilities: Object.fromEntries(capabilityNames.map(([name]) => [name, capability(name)])),
      pricingMetadata: {},
      billingTier: String(form.get("billingTier")),
      releaseStage: String(form.get("releaseStage")),
    };
    const response = await fetch("/api/v1/admin/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      event.currentTarget.reset();
      setMessage("تمت إضافة النموذج. يمكنك تفعيله أو تعيينه افتراضيًا من القائمة.");
      await load();
    } else {
      setError(body?.error?.message ?? "تعذر إضافة النموذج.");
    }
    setBusy(undefined);
  }

  async function importModels(provider: Provider) {
    setBusy(`import:${provider.id}`);
    setError("");
    setMessage("جارٍ اكتشاف النماذج من المزود…");
    const response = await fetch(`/api/v1/admin/providers/${provider.id}/models/import`, { method: "POST" });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      setMessage(`تم اكتشاف ${body.data.discovered} نموذجًا. بقيت النماذج الجديدة معطلة للمراجعة.`);
      await load();
    } else {
      setMessage("");
      setError(body?.error?.message ?? "فشل استيراد النماذج.");
    }
    setBusy(undefined);
  }

  async function update(model: Model, fields: Record<string, unknown>, success: string) {
    setBusy(`model:${model.id}`);
    setError("");
    const response = await fetch(`/api/v1/admin/models/${model.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      setMessage(success);
      await load();
    } else {
      setError(body?.error?.message ?? "تعذر تحديث النموذج.");
    }
    setBusy(undefined);
  }

  return <div className="stack">
    <form className="management-form" onSubmit={(event) => void create(event)}>
      <div>
        <h2>إضافة نموذج يدويًا</h2>
        <p>سجّل المعرّف الحقيقي الذي يرسله المزود. لا يُفعّل أي نموذج دون قرار صريح.</p>
      </div>
      <label>المزود
        <select name="providerId" required defaultValue="">
          <option value="" disabled>اختر المزود</option>
          {providers.map((provider) => <option value={provider.id} key={provider.id}>
            {provider.name}{provider.enabled ? "" : " — المزود معطّل"}
          </option>)}
        </select>
      </label>
      <label>معرّف النموذج<input name="modelKey" required maxLength={200} placeholder="model-id" dir="ltr" /></label>
      <label>الاسم الظاهر<input name="displayName" required maxLength={120} placeholder="اسم واضح للمستخدم" /></label>
      <label>Alias ثابت<input name="modelAlias" pattern="[a-z0-9][a-z0-9._-]{1,100}" placeholder="optional-alias" dir="ltr" /></label>
      <label>الوصف<input name="description" maxLength={1000} placeholder="وصف مختصر للإمكانات والاستخدام" /></label>
      <label>Context Window<input name="contextWindow" type="number" min={1} placeholder="128000" dir="ltr" /></label>
      <label>Max Output Tokens<input name="maxOutputTokens" type="number" min={1} placeholder="8192" dir="ltr" /></label>
      <label>أقصى طول للرسالة<input name="maxMessageChars" type="number" min={1} defaultValue={100000} dir="ltr" /></label>
      <label>الفئة<select name="billingTier" defaultValue="paid"><option value="free">Free</option><option value="paid">Paid</option><option value="premium">Premium</option></select></label>
      <label>مرحلة الإصدار<select name="releaseStage" defaultValue="stable"><option value="stable">Stable</option><option value="beta">Beta</option></select></label>
      <fieldset>
        <legend>قدرات النموذج</legend>
        {capabilityNames.map(([name, label]) => <label key={name}>
          <input name={name} type="checkbox" defaultChecked={name === "streaming"} /> {label}
        </label>)}
      </fieldset>
      <label><input name="visibleToUsers" type="checkbox" defaultChecked /> ظاهر للمستخدمين</label>
      <label><input name="enabled" type="checkbox" /> تفعيل فور الحفظ</label>
      <button className="button primary" disabled={busy === "create" || providers.length === 0}>
        {busy === "create" ? "جارٍ الحفظ…" : "إضافة النموذج"}
      </button>
    </form>

    <div className="management-form">
      <div><h2>اكتشاف النماذج</h2><p>يتصل بالخادم الفعلي للمزود ويحفظ النماذج الجديدة معطلة.</p></div>
      {providers.map((provider) => <button className="button secondary" key={provider.id}
        disabled={Boolean(busy)} onClick={() => void importModels(provider)}>
        {busy === `import:${provider.id}` ? "جارٍ الاستيراد…" : `استيراد من ${provider.name}`}
      </button>)}
      {providers.length === 0 && <p className="empty-state">أضف مزودًا أولًا.</p>}
    </div>

    {message && <div className="notice">{message}</div>}
    {error && <div className="error-state">{error}</div>}
    <div className="table-wrap"><table><thead><tr>
      <th>النموذج</th><th>المزود</th><th>المعرّف</th><th>الفئة</th><th>الإتاحة</th><th>الإجراءات</th>
    </tr></thead><tbody>{models.map((model) => <tr key={model.id}>
      <td>{model.display_name}{model.is_default && <small>النموذج الافتراضي</small>}</td>
      <td>{model.ai_providers.name}</td>
      <td><small>{model.model_key}</small></td>
      <td>{model.billing_tier} · {model.release_stage}</td>
      <td>{model.enabled ? "مفعّل" : "معطّل"} · {model.visible_to_users ? "ظاهر" : "مخفي"}</td>
      <td>
        <button className="button" disabled={busy === `model:${model.id}`}
          onClick={() => void update(model, { enabled: !model.enabled }, model.enabled ? "تم تعطيل النموذج." : "تم تفعيل النموذج.")}>
          {model.enabled ? "تعطيل" : "تفعيل"}
        </button>
        <button className="button" disabled={busy === `model:${model.id}`}
          onClick={() => void update(model, { visibleToUsers: !model.visible_to_users }, model.visible_to_users ? "تم إخفاء النموذج." : "أصبح النموذج ظاهرًا.")}>
          {model.visible_to_users ? "إخفاء" : "إظهار"}
        </button>
        {!model.is_default && <button className="button primary" disabled={busy === `model:${model.id}`}
          onClick={() => void update(model, { isDefault: true, enabled: true, visibleToUsers: true }, "تم تعيين النموذج الافتراضي وتفعيله.")}>
          تعيين افتراضي
        </button>}
      </td>
    </tr>)}</tbody></table></div>
    {models.length === 0 && <div className="empty-state">لا توجد نماذج مسجلة بعد.</div>}
    <div className="notice">
      بعد تعيين نموذج افتراضي مفعّل يمكنك استخدامه مباشرة في الدردشة، أو
      {" "}<a href="/admin/agents">إنشاء وكيل مرتبط به</a>. لا يُنشأ وكيل نشط بلا نموذج.
    </div>
  </div>;
}
