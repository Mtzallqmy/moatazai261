"use client";

import { useEffect, useState } from "react";

type Credential = { id: string; key_hint: string; status: string; priority: number };
type Provider = {
  id: string;
  name: string;
  slug: string;
  provider_type: string;
  auth_type: string;
  base_url: string;
  enabled: boolean;
  health_status: string;
  last_latency_ms?: number;
  last_error_code?: string;
  ai_provider_credentials: Credential[];
};

export function ProviderManager() {
  const [items, setItems] = useState<Provider[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function load() {
    const response = await fetch("/api/v1/admin/providers");
    const body = await response.json();
    if (response.ok) setItems(body.data ?? []);
    else setError("تعذر تحميل المزودين.");
  }
  useEffect(() => { queueMicrotask(() => void load()); }, []);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const secret = String(form.get("secret") ?? "").trim();
    const authType = String(form.get("authType") ?? "bearer");
    const payload = {
      name: String(form.get("name")),
      slug: String(form.get("slug")),
      providerType: String(form.get("providerType")),
      baseUrl: String(form.get("baseUrl")),
      authType,
      chatEndpoint: String(form.get("chatEndpoint") || "chat/completions"),
      modelsEndpoint: String(form.get("modelsEndpoint") || "models"),
      timeoutMs: 90_000,
      retryCount: 2,
      priority: 100,
      enabled: false,
      configuration: {
        ...(form.get("headerName") ? { headerName: String(form.get("headerName")) } : {}),
        ...(form.get("queryName") ? { queryName: String(form.get("queryName")) } : {}),
        ...(form.get("username") ? { username: String(form.get("username")) } : {}),
      },
      ...(secret ? { credential: {
        secret,
        headerName: String(form.get("headerName") || "") || undefined,
        username: String(form.get("username") || "") || undefined,
      } } : {}),
    };
    const response = await fetch("/api/v1/admin/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      event.currentTarget.reset();
      setMessage(secret
        ? "تم حفظ المزود والمفتاح المشفر. أجرِ اختبار الاتصال قبل التفعيل."
        : "تم حفظ المزود بلا مفتاح. يمكنك إضافة مفتاح مركزي أو استخدام BYOK لاحقًا.");
      await load();
    } else {
      setError(body?.error?.message ?? "تعذر إنشاء المزود.");
    }
    setSaving(false);
  }

  async function test(id: string) {
    setTesting(id);
    setError("");
    const response = await fetch(`/api/v1/admin/providers/${id}/test`, { method: "POST" });
    const body = await response.json();
    if (response.ok) setMessage(`نجح الاتصال خلال ${body.data?.latencyMs ?? "—"}ms.`);
    else setError(body.error?.message ?? "فشل الاختبار.");
    await load();
    setTesting(undefined);
  }

  async function toggle(provider: Provider) {
    const response = await fetch(`/api/v1/admin/providers/${provider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !provider.enabled }),
    });
    if (!response.ok) setError("تعذر تحديث المزود.");
    await load();
  }

  async function addCredential(provider: Provider) {
    const secret = window.prompt(`أدخل مفتاحًا جديدًا لـ ${provider.name}. لن يمكن عرضه بعد الحفظ.`);
    if (!secret?.trim()) return;
    const priority = Number(window.prompt("الأولوية: الرقم الأصغر يُستخدم أولًا", "100") ?? 100);
    const response = await fetch(`/api/v1/admin/providers/${provider.id}/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: secret.trim(), priority, authType: provider.auth_type }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) setMessage(`تمت إضافة ${body.data.key_hint} بصورة مشفرة.`);
    else setError(body?.error?.message ?? "تعذر إضافة المفتاح.");
    await load();
  }

  async function updateCredential(provider: Provider, credential: Credential, action: "toggle" | "rotate") {
    const body = action === "rotate"
      ? { credentialId: credential.id, secret: window.prompt("أدخل القيمة الجديدة. لن تظهر بعد الحفظ.")?.trim() }
      : { credentialId: credential.id, status: credential.status === "active" ? "disabled" : "active" };
    if (action === "rotate" && !body.secret) return;
    const response = await fetch(`/api/v1/admin/providers/${provider.id}/credentials`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (response.ok) setMessage(action === "rotate" ? "تم تدوير المفتاح المشفر." : "تم تحديث حالة المفتاح.");
    else setError(payload?.error?.message ?? "تعذر تحديث المفتاح.");
    await load();
  }

  return <div className="stack">
    <form className="management-form" onSubmit={(event) => void create(event)}>
      <div><h2>إضافة مزود</h2><p>المفتاح اختياري عند الإنشاء، ويُحفظ مشفرًا عند إضافته.</p></div>
      <input aria-label="اسم المزود" name="name" required minLength={2} placeholder="الاسم الظاهر" />
      <input aria-label="معرّف المزود" name="slug" required pattern="[a-z0-9][a-z0-9-]{1,62}" placeholder="provider-slug" dir="ltr" />
      <select aria-label="نوع المزود" name="providerType" defaultValue="openai-compatible">
        <option value="openai">OpenAI</option><option value="anthropic">Anthropic</option>
        <option value="google-gemini">Google Gemini</option><option value="openrouter">OpenRouter</option>
        <option value="groq">Groq</option><option value="mistral">Mistral</option>
        <option value="cohere">Cohere</option><option value="deepseek">DeepSeek</option>
        <option value="xai">xAI</option><option value="azure-openai">Azure OpenAI</option>
        <option value="amazon-bedrock">Amazon Bedrock</option><option value="ollama">Ollama</option>
        <option value="openai-compatible">OpenAI-Compatible / Custom</option>
      </select>
      <input aria-label="رابط المزود الأساسي" name="baseUrl" type="url" required placeholder="https://api.example.com/v1/" dir="ltr" />
      <input aria-label="مسار الدردشة" name="chatEndpoint" defaultValue="chat/completions" dir="ltr" />
      <input aria-label="مسار النماذج" name="modelsEndpoint" defaultValue="models" dir="ltr" />
      <select aria-label="نوع المصادقة" name="authType" defaultValue="bearer">
        <option value="bearer">Bearer Token</option><option value="api_key_header">API Key Header</option>
        <option value="query">Query Parameter</option><option value="basic">Basic Auth</option>
        <option value="custom_headers">Custom Headers</option><option value="none">بدون مصادقة</option>
      </select>
      <input aria-label="اسم Header" name="headerName" placeholder="X-API-Key (اختياري)" dir="ltr" />
      <input aria-label="اسم Query Parameter" name="queryName" placeholder="key (اختياري)" dir="ltr" />
      <input aria-label="اسم مستخدم Basic Auth" name="username" placeholder="username (اختياري)" dir="ltr" />
      <input aria-label="مفتاح API اختياري" name="secret" type="password" minLength={4}
        autoComplete="new-password" placeholder="API key — اختياري" dir="ltr" />
      <button className="button primary" disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ المزود"}</button>
    </form>
    <div className="notice">أضف نموذجًا يدويًا أو استورده عندما يدعم المزود ذلك. لا يُشترط وجود نموذج أو مفتاح أثناء إعداد المزود.</div>
    {message && <p className="notice">{message}</p>}
    {error && <p className="error-state">{error}</p>}
    <div className="table-wrap"><table><thead><tr>
      <th>المزود</th><th>النوع</th><th>الحالة</th><th>المفاتيح</th><th>زمن الاستجابة</th><th>إجراءات</th>
    </tr></thead><tbody>{items.map((provider) => <tr key={provider.id}>
      <td>{provider.name}<small>{provider.base_url}</small></td>
      <td>{provider.provider_type}</td>
      <td>{provider.enabled ? "مفعّل" : "معطّل"} · {provider.health_status}
        {provider.last_error_code && <small>{provider.last_error_code}</small>}</td>
      <td>{provider.ai_provider_credentials?.length
        ? provider.ai_provider_credentials.map((credential) => <span key={credential.id}>
          {credential.key_hint} · P{credential.priority} · {credential.status}
          <button className="link-button" onClick={() => void updateCredential(provider, credential, "rotate")}>تدوير</button>
          <button className="link-button" onClick={() => void updateCredential(provider, credential, "toggle")}>
            {credential.status === "active" ? "تعطيل" : "تفعيل"}
          </button>
        </span>)
        : "BYOK أو بلا مفتاح"}</td>
      <td>{provider.last_latency_ms ? `${provider.last_latency_ms}ms` : "—"}</td>
      <td>
        <button className="button" onClick={() => void test(provider.id)} disabled={testing === provider.id}>
          {testing === provider.id ? "جارٍ الفحص" : "اختبار"}
        </button>
        <button className="button" onClick={() => void addCredential(provider)}>إضافة مفتاح</button>
        <button className="button" onClick={() => void toggle(provider)}>{provider.enabled ? "تعطيل" : "تفعيل"}</button>
      </td>
    </tr>)}</tbody></table></div>
    {items.length === 0 && <div className="empty-state">لا توجد مزودات بعد.</div>}
  </div>;
}
