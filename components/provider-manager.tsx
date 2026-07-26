"use client";

import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import { providerInputSchema } from "@/schemas/provider";
import { getProviderPreset, providerPresets } from "@/providers/presets";

type AuthType = "bearer" | "api_key_header" | "query" | "basic" | "custom_headers" | "none";
type Credential = {
  id: string;
  key_hint: string;
  status: string;
  priority: number;
  is_default: boolean;
  usage_limit?: number;
  usage_count?: number;
  expires_at?: string;
};
type ConnectionTest = {
  id: string;
  status: string;
  http_status?: number;
  latency_ms: number;
  error_code?: string;
  response_metadata?: { message?: string; providerMessage?: string; testedModel?: string };
  created_at: string;
};
type Provider = {
  id: string;
  name: string;
  slug: string;
  provider_type: string;
  auth_type: AuthType;
  base_url: string;
  chat_endpoint: string;
  models_endpoint: string;
  api_version?: string;
  timeout_ms: number;
  retry_count: number;
  priority: number;
  configuration?: {
    headers?: Record<string, string>;
    headerName?: string;
    queryName?: string;
    username?: string;
  };
  enabled: boolean;
  health_status: string;
  last_health_check_at?: string;
  last_latency_ms?: number;
  last_error_code?: string;
  ai_provider_credentials: Credential[];
  provider_connection_tests: ConnectionTest[];
};
type FormState = {
  providerType: "openai" | "openrouter" | "openai-compatible";
  name: string;
  slug: string;
  baseUrl: string;
  chatEndpoint: string;
  modelsEndpoint: string;
  authType: AuthType;
  headerName: string;
  queryName: string;
  username: string;
  secret: string;
  publicHeaders: string;
  apiVersion: string;
  timeoutMs: number;
  retryCount: number;
  priority: number;
  testModel: string;
};
type ProviderPayload = z.input<typeof providerInputSchema> & { testModel?: string };

const initialForm = fromPreset("openai");

export function ProviderManager() {
  const [items, setItems] = useState<Provider[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<string>();
  const [credentialFor, setCredentialFor] = useState<string>();
  const [credentialSecret, setCredentialSecret] = useState("");
  const [credentialPriority, setCredentialPriority] = useState(100);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const editingProvider = useMemo(
    () => items.find((provider) => provider.id === editingId),
    [editingId, items],
  );

  async function load() {
    const response = await fetch("/api/v1/admin/providers", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok) setItems(body?.data ?? []);
    else setError(readError(body, "تعذر تحميل المزودات."));
  }
  useEffect(() => { queueMicrotask(() => void load()); }, []);

  function selectPreset(type: FormState["providerType"]) {
    setEditingId(undefined);
    setForm(fromPreset(type));
    setFieldErrors({});
    setError("");
    setMessage("");
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function buildPayload() {
    let headers: Record<string, string> | undefined;
    if (form.publicHeaders.trim()) {
      try {
        headers = JSON.parse(form.publicHeaders) as Record<string, string>;
      } catch {
        throw new Error("الرؤوس العامة يجب أن تكون JSON صحيحًا.");
      }
    }
    return {
      name: form.name,
      slug: form.slug,
      providerType: form.providerType,
      baseUrl: form.baseUrl,
      authType: form.authType,
      chatEndpoint: form.chatEndpoint,
      modelsEndpoint: form.modelsEndpoint,
      apiVersion: form.apiVersion || undefined,
      timeoutMs: form.timeoutMs,
      retryCount: form.retryCount,
      priority: form.priority,
      enabled: false,
      configuration: {
        ...(headers ? { headers } : {}),
        ...(form.headerName ? { headerName: form.headerName } : {}),
        ...(form.queryName ? { queryName: form.queryName } : {}),
        ...(form.username ? { username: form.username } : {}),
      },
      ...(form.secret.trim() && form.authType !== "none" ? {
        credential: {
          secret: form.secret.trim(),
          headerName: form.headerName || undefined,
          queryName: form.queryName || undefined,
          username: form.username || undefined,
          isDefault: true,
        },
      } : {}),
      ...(form.testModel ? { testModel: form.testModel } : {}),
    };
  }

  function validatePayload() {
    try {
      const payload = buildPayload();
      const parsed = providerInputSchema.safeParse(payload);
      if (!parsed.success) {
        setFieldErrors(parsed.error.flatten().fieldErrors);
        throw new Error("صحح الحقول المحددة قبل المتابعة.");
      }
      setFieldErrors({});
      return payload;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "بيانات المزود غير صالحة.");
      return null;
    }
  }

  async function testConfiguration() {
    setError("");
    setMessage("");
    setBusy("draft-test");
    const payload = validatePayload();
    if (!payload) return setBusy("");
    const response = editingProvider && !form.secret.trim()
      ? await fetch(`/api/v1/admin/providers/${editingProvider.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: form.testModel || undefined,
          draft: buildUpdatePayload(payload),
        }),
      })
      : await fetch("/api/v1/admin/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      setMessage(`نجح جلب ${body.data?.modelCount ?? 0} نموذج واختبار ${body.data?.testedModel ?? "النموذج"} خلال ${body.data?.latencyMs ?? "—"}ms.`);
    } else {
      setError(readError(body, "فشل اختبار الاتصال."));
    }
    if (editingProvider) await load();
    setBusy("");
  }

  async function save(runTest: boolean) {
    setError("");
    setMessage("");
    setBusy(runTest ? "save-test" : "save");
    const payload = validatePayload();
    if (!payload) return setBusy("");

    let providerId = editingId;
    let response: Response;
    if (editingId) {
      const updatePayload = buildUpdatePayload(payload);
      response = await fetch(`/api/v1/admin/providers/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });
    } else {
      response = await fetch("/api/v1/admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setFieldErrors(body?.error?.details ?? {});
      setError(readError(body, "تعذر حفظ المزود."));
      return setBusy("");
    }
    providerId = providerId ?? body.data?.id;

    if (editingProvider && form.secret.trim()) {
      const defaultCredential = editingProvider.ai_provider_credentials.find((credential) => credential.is_default)
        ?? editingProvider.ai_provider_credentials[0];
      const credentialResponse = await fetch(`/api/v1/admin/providers/${editingProvider.id}/credentials`, {
        method: defaultCredential ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(defaultCredential
          ? { credentialId: defaultCredential.id, secret: form.secret.trim() }
          : {
            secret: form.secret.trim(),
            priority: 100,
            isDefault: true,
            authType: form.authType,
            headerName: form.headerName || undefined,
            queryName: form.queryName || undefined,
            username: form.username || undefined,
          }),
      });
      const credentialBody = await credentialResponse.json().catch(() => null);
      if (!credentialResponse.ok) {
        setError(readError(credentialBody, "حُفظت الإعدادات لكن تعذر تحديث المفتاح."));
        await load();
        return setBusy("");
      }
    }

    if (runTest && providerId) {
      const testResponse = await fetch(`/api/v1/admin/providers/${providerId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: form.testModel || undefined }),
      });
      const testBody = await testResponse.json().catch(() => null);
      if (!testResponse.ok) {
        setError(`تم الحفظ كغير مفعّل. ${readError(testBody, "فشل اختبار الاتصال.")}`);
      } else {
        setMessage(`تم الحفظ والاختبار بنجاح خلال ${testBody.data?.latencyMs ?? "—"}ms. يمكنك تفعيل المزود الآن.`);
      }
    } else {
      setMessage("تم الحفظ كغير مفعّل. اختبر الاتصال قبل التفعيل.");
    }
    setEditingId(undefined);
    setForm(initialForm);
    await load();
    setBusy("");
  }

  function startEdit(provider: Provider) {
    setEditingId(provider.id);
    setForm({
      providerType: supportedType(provider.provider_type),
      name: provider.name,
      slug: provider.slug,
      baseUrl: provider.base_url,
      chatEndpoint: provider.chat_endpoint,
      modelsEndpoint: provider.models_endpoint,
      authType: provider.auth_type,
      headerName: provider.configuration?.headerName ?? "",
      queryName: provider.configuration?.queryName ?? "",
      username: provider.configuration?.username ?? "",
      secret: "",
      publicHeaders: provider.configuration?.headers
        ? JSON.stringify(provider.configuration.headers, null, 2)
        : "",
      apiVersion: provider.api_version ?? "",
      timeoutMs: provider.timeout_ms,
      retryCount: provider.retry_count,
      priority: provider.priority,
      testModel: "",
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggle(provider: Provider) {
    setBusy(`toggle:${provider.id}`);
    setError("");
    const response = await fetch(`/api/v1/admin/providers/${provider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !provider.enabled }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) setMessage(provider.enabled ? "تم تعطيل المزود." : "تم تفعيل المزود.");
    else setError(readError(body, "تعذر تحديث حالة المزود."));
    await load();
    setBusy("");
  }

  async function testSaved(provider: Provider) {
    setBusy(`test:${provider.id}`);
    setError("");
    const response = await fetch(`/api/v1/admin/providers/${provider.id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await response.json().catch(() => null);
    if (response.ok) setMessage(`نجح اختبار ${body.data?.testedModel} خلال ${body.data?.latencyMs}ms.`);
    else setError(readError(body, "فشل اختبار الاتصال."));
    await load();
    setBusy("");
  }

  async function importModels(provider: Provider) {
    setBusy(`models:${provider.id}`);
    setError("");
    const response = await fetch(`/api/v1/admin/providers/${provider.id}/models/import`, { method: "POST" });
    const body = await response.json().catch(() => null);
    if (response.ok) setMessage(`تم اكتشاف ${body.data?.discovered ?? 0} نموذج. راجعها من إدارة النماذج.`);
    else setError(readError(body, "تعذر جلب النماذج."));
    setBusy("");
  }

  async function remove(provider: Provider) {
    if (!window.confirm(`حذف ${provider.name} نهائيًا؟ لن يُحذف إذا كان مرتبطًا بسجلات أو نماذج.`)) return;
    setBusy(`delete:${provider.id}`);
    const response = await fetch(`/api/v1/admin/providers/${provider.id}`, { method: "DELETE" });
    if (response.ok) setMessage("تم حذف المزود.");
    else setError(readError(await response.json().catch(() => null), "تعذر حذف المزود."));
    await load();
    setBusy("");
  }

  async function addCredential(provider: Provider) {
    if (!credentialSecret.trim()) return setError("أدخل المفتاح الجديد.");
    setBusy(`credential:${provider.id}`);
    const response = await fetch(`/api/v1/admin/providers/${provider.id}/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: credentialSecret.trim(),
        priority: credentialPriority,
        isDefault: provider.ai_provider_credentials.length === 0,
        authType: provider.auth_type,
        headerName: provider.configuration?.headerName,
        queryName: provider.configuration?.queryName,
        username: provider.configuration?.username,
      }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) {
      setMessage(`تم حفظ المفتاح ${body.data?.key_hint} مشفرًا.`);
      setCredentialSecret("");
      setCredentialFor(undefined);
    } else setError(readError(body, "تعذر إضافة المفتاح."));
    await load();
    setBusy("");
  }

  async function updateCredential(provider: Provider, credential: Credential, values: Record<string, unknown>) {
    setBusy(`credential:${credential.id}`);
    const response = await fetch(`/api/v1/admin/providers/${provider.id}/credentials`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credentialId: credential.id, ...values }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok) setMessage("تم تحديث المفتاح دون كشف قيمته.");
    else setError(readError(body, "تعذر تحديث المفتاح."));
    await load();
    setBusy("");
  }

  return <div className="provider-console">
    <section className="provider-editor">
      <header>
        <div>
          <span className="panel-kicker">PROVIDER CONTROL</span>
          <h2>{editingId ? "تعديل المزود" : "إضافة مزود"}</h2>
          <p>إعداد واضح وآمن. يبقى المزود معطّلًا حتى ينجح اختبار حقيقي.</p>
        </div>
        {editingId && <button className="button secondary" onClick={() => selectPreset("openai")}>إلغاء التعديل</button>}
      </header>

      <div className="preset-grid" role="radiogroup" aria-label="إعدادات المزود الجاهزة">
        {Object.values(providerPresets).map((preset) => <button
          type="button"
          role="radio"
          aria-checked={form.providerType === preset.type}
          className={form.providerType === preset.type ? "preset-card active" : "preset-card"}
          onClick={() => selectPreset(preset.type)}
          key={preset.type}
        >
          <b>{preset.label}</b>
          <small>{preset.type === "openai-compatible" ? "Base URL مرن" : preset.baseUrl}</small>
        </button>)}
      </div>

      <div className="provider-form-sections">
        <fieldset>
          <legend><span>01</span> البيانات الأساسية</legend>
          <div className="form-grid two">
            <Field label="الاسم الظاهر" error={fieldErrors.name?.[0]}>
              <input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="OpenRouter" />
            </Field>
            <Field label="المعرّف" hint="أحرف إنجليزية صغيرة وأرقام وشرطات" error={fieldErrors.slug?.[0]}>
              <input value={form.slug} disabled={Boolean(editingId)} onChange={(event) => update("slug", event.target.value.toLowerCase())} dir="ltr" placeholder="openrouter" />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend><span>02</span> الاتصال</legend>
          <div className="form-grid">
            <Field label="Base URL" error={fieldErrors.baseUrl?.[0]}>
              <input type="url" value={form.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} dir="ltr" placeholder="https://api.example.com/v1" />
            </Field>
          </div>
          <div className="form-grid two">
            <Field label="مسار الدردشة" error={fieldErrors.chatEndpoint?.[0]}>
              <input value={form.chatEndpoint} onChange={(event) => update("chatEndpoint", event.target.value)} dir="ltr" />
            </Field>
            <Field label="مسار النماذج" error={fieldErrors.modelsEndpoint?.[0]}>
              <input value={form.modelsEndpoint} onChange={(event) => update("modelsEndpoint", event.target.value)} dir="ltr" />
            </Field>
          </div>
          <Field label="نموذج للاختبار" hint="اختياري؛ يُستخدم أول نموذج مكتشف عند تركه فارغًا">
            <input value={form.testModel} onChange={(event) => update("testModel", event.target.value)} dir="ltr" placeholder="openai/gpt-4o-mini" />
          </Field>
        </fieldset>

        <fieldset>
          <legend><span>03</span> المصادقة</legend>
          <div className="auth-choice-grid">
            {authOptions.map((option) => <button
              type="button"
              className={form.authType === option.value ? "auth-choice active" : "auth-choice"}
              aria-pressed={form.authType === option.value}
              onClick={() => update("authType", option.value)}
              key={option.value}
            ><b>{option.label}</b><small>{option.description}</small></button>)}
          </div>
          {form.authType === "api_key_header" && <Field label="اسم Header">
            <input value={form.headerName} onChange={(event) => update("headerName", event.target.value)} dir="ltr" placeholder="X-API-Key" />
          </Field>}
          {form.authType === "query" && <Field label="اسم Query Parameter">
            <input value={form.queryName} onChange={(event) => update("queryName", event.target.value)} dir="ltr" placeholder="key" />
          </Field>}
          {form.authType === "basic" && <Field label="اسم مستخدم Basic Auth" error={fieldErrors.configuration?.[0]}>
            <input value={form.username} onChange={(event) => update("username", event.target.value)} dir="ltr" autoComplete="username" />
          </Field>}
          {form.authType !== "none" && <Field
            label={form.authType === "custom_headers" ? "الرؤوس السرية JSON" : editingId ? "مفتاح جديد" : "API Key"}
            hint={editingId ? "اتركه فارغًا للاحتفاظ بالمفتاح الحالي دون تغييره" : "اختياري للحفظ، ومطلوب للاختبار إن كان المزود محميًا"}
            error={fieldErrors.credential?.[0]}
          >
            {form.authType === "custom_headers"
              ? <textarea value={form.secret} onChange={(event) => update("secret", event.target.value)} dir="ltr" rows={4} placeholder={'{"X-API-Key":"secret"}'} />
              : <input type="password" value={form.secret} onChange={(event) => update("secret", event.target.value)} dir="ltr" autoComplete="new-password" placeholder={editingId ? "•••••••• — دون تغيير" : "sk-..."} />}
          </Field>}
          {form.authType === "bearer" && <p className="field-note">سيُرسل تلقائيًا: <code>Authorization: Bearer &lt;API_KEY&gt;</code></p>}
        </fieldset>

        <details className="advanced-provider-options">
          <summary>04 · الخيارات المتقدمة</summary>
          <div className="form-grid three">
            <Field label="Timeout (ms)"><input type="number" min={1000} max={120000} value={form.timeoutMs} onChange={(event) => update("timeoutMs", Number(event.target.value))} /></Field>
            <Field label="Retries"><input type="number" min={0} max={3} value={form.retryCount} onChange={(event) => update("retryCount", Number(event.target.value))} /></Field>
            <Field label="الأولوية"><input type="number" min={0} max={10000} value={form.priority} onChange={(event) => update("priority", Number(event.target.value))} /></Field>
          </div>
          <Field label="API Version"><input value={form.apiVersion} onChange={(event) => update("apiVersion", event.target.value)} dir="ltr" /></Field>
          <Field label="رؤوس عامة غير سرية" hint='JSON فقط، مثل {"X-Title":"Moataz AI"}'>
            <textarea value={form.publicHeaders} onChange={(event) => update("publicHeaders", event.target.value)} dir="ltr" rows={4} />
          </Field>
        </details>
      </div>

      <div className="provider-form-actions">
        <button className="button secondary" disabled={Boolean(busy)} onClick={() => void testConfiguration()}>
          {busy === "draft-test" ? "جارٍ فحص النماذج والرسالة…" : "اختبار الاتصال قبل الحفظ"}
        </button>
        <button className="button secondary" disabled={Boolean(busy)} onClick={() => void save(false)}>
          {busy === "save" ? "جارٍ الحفظ…" : "حفظ كغير مفعّل"}
        </button>
        <button className="button primary" disabled={Boolean(busy)} onClick={() => void save(true)}>
          {busy === "save-test" ? "جارٍ الحفظ والاختبار…" : "حفظ واختبار"}
        </button>
      </div>
      {message && <p className="notice success" role="status">{message}</p>}
      {error && <p className="error-state" role="alert">{error}</p>}
    </section>

    <section className="provider-list-section">
      <header><div><span className="panel-kicker">RUNTIME</span><h2>المزودات المسجلة</h2></div><b>{items.length}</b></header>
      <div className="provider-card-grid">
        {items.map((provider) => {
          const latest = provider.provider_connection_tests?.[0];
          return <article className="provider-card" key={provider.id}>
            <header>
              <span className="provider-logo">{provider.name.slice(0, 2).toUpperCase()}</span>
              <div><h3>{provider.name}</h3><small>{provider.provider_type} · {provider.auth_type}</small></div>
              <span className={`health-pill ${provider.health_status}`}>{healthLabel(provider.health_status)}</span>
            </header>
            <code className="provider-url">{provider.base_url}</code>
            <div className="provider-stats">
              <span><small>التشغيل</small><b>{provider.enabled ? "مفعّل" : "متوقف"}</b></span>
              <span><small>الاستجابة</small><b>{provider.last_latency_ms ? `${provider.last_latency_ms}ms` : "—"}</b></span>
              <span><small>المفاتيح</small><b>{provider.ai_provider_credentials.length}</b></span>
            </div>
            {latest && <div className={latest.status === "success" ? "connection-result success" : "connection-result failure"}>
              <b>{latest.status === "success" ? "آخر اختبار ناجح" : latest.error_code}</b>
              <small>{latest.http_status ? `HTTP ${latest.http_status} · ` : ""}{latest.latency_ms}ms · {formatDate(latest.created_at)}</small>
              {latest.response_metadata?.providerMessage && <p>{latest.response_metadata.providerMessage}</p>}
            </div>}
            <div className="credential-list">
              {provider.ai_provider_credentials.map((credential) => <div className="credential-row" key={credential.id}>
                <span><b dir="ltr">{credential.key_hint}</b><small>{credential.is_default ? "افتراضي" : `أولوية ${credential.priority}`} · {credential.status}</small></span>
                <span>
                  {!credential.is_default && <button onClick={() => void updateCredential(provider, credential, { isDefault: true, status: "active" })}>افتراضي</button>}
                  <button onClick={() => void updateCredential(provider, credential, { status: credential.status === "active" ? "disabled" : "active" })}>
                    {credential.status === "active" ? "تعطيل" : "تفعيل"}
                  </button>
                </span>
              </div>)}
              {credentialFor === provider.id ? <div className="credential-editor">
                <input type="password" value={credentialSecret} onChange={(event) => setCredentialSecret(event.target.value)} dir="ltr" placeholder="المفتاح الجديد" autoComplete="new-password" />
                <input type="number" min={0} max={10000} value={credentialPriority} onChange={(event) => setCredentialPriority(Number(event.target.value))} aria-label="أولوية المفتاح" />
                <button className="button primary" disabled={Boolean(busy)} onClick={() => void addCredential(provider)}>حفظ مشفر</button>
                <button className="button secondary" onClick={() => setCredentialFor(undefined)}>إلغاء</button>
              </div> : <button className="add-credential-button" onClick={() => setCredentialFor(provider.id)}>+ إضافة مفتاح مركزي</button>}
            </div>
            <footer>
              <button className="button secondary" onClick={() => startEdit(provider)}>تعديل</button>
              <button className="button secondary" disabled={Boolean(busy)} onClick={() => void testSaved(provider)}>{busy === `test:${provider.id}` ? "يفحص…" : "اختبار"}</button>
              <button className="button secondary" disabled={Boolean(busy)} onClick={() => void importModels(provider)}>{busy === `models:${provider.id}` ? "يجلب…" : "جلب النماذج"}</button>
              <button className={provider.enabled ? "button danger" : "button primary"} disabled={Boolean(busy)} onClick={() => void toggle(provider)}>
                {provider.enabled ? "تعطيل" : "تفعيل"}
              </button>
              <button className="button danger ghost" disabled={Boolean(busy)} onClick={() => void remove(provider)}>حذف</button>
            </footer>
          </article>;
        })}
      </div>
      {!items.length && <div className="empty-state">لا توجد مزودات بعد. اختر إعدادًا جاهزًا وأجرِ الاختبار قبل الحفظ.</div>}
    </section>
  </div>;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return <label className={error ? "field invalid" : "field"}>
    <span>{label}</span>{children}
    {error ? <small className="field-error">{error}</small> : hint ? <small>{hint}</small> : null}
  </label>;
}

const authOptions: Array<{ value: AuthType; label: string; description: string }> = [
  { value: "bearer", label: "Bearer Token", description: "الخيار الشائع وOpenRouter" },
  { value: "api_key_header", label: "API Key Header", description: "مثل X-API-Key" },
  { value: "basic", label: "Basic Auth", description: "اسم مستخدم وكلمة سر" },
  { value: "custom_headers", label: "Custom Headers", description: "رؤوس سرية بصيغة JSON" },
  { value: "query", label: "Query Key", description: "للمزودات التي تشترطه فقط" },
  { value: "none", label: "بدون مصادقة", description: "لنقاط موثوقة ومسموحة فقط" },
];

function fromPreset(type: FormState["providerType"]): FormState {
  const preset = getProviderPreset(type);
  return {
    providerType: type,
    name: preset.name,
    slug: type === "openai-compatible" ? "" : type,
    baseUrl: preset.baseUrl,
    chatEndpoint: preset.chatEndpoint,
    modelsEndpoint: preset.modelsEndpoint,
    authType: preset.authType,
    headerName: preset.headerName ?? "",
    queryName: "",
    username: "",
    secret: "",
    publicHeaders: preset.headers ? JSON.stringify(preset.headers, null, 2) : "",
    apiVersion: "",
    timeoutMs: 30_000,
    retryCount: 1,
    priority: 100,
    testModel: "",
  };
}

function supportedType(value: string): FormState["providerType"] {
  return value === "openai" || value === "openrouter" ? value : "openai-compatible";
}

function readError(body: unknown, fallback: string) {
  const error = (body as {
    error?: {
      message?: string;
      code?: string;
      details?: { httpStatus?: number; providerMessage?: string };
    };
  } | null)?.error;
  const status = error?.details?.httpStatus ? `HTTP ${error.details.httpStatus}` : undefined;
  const details = error?.details?.providerMessage;
  return [error?.message ?? fallback, status, details].filter(Boolean).join(" — ");
}

function healthLabel(value: string) {
  return value === "healthy" ? "سليم" : value === "degraded" ? "متدهور" : value === "unavailable" ? "غير متاح" : "لم يُختبر";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function buildUpdatePayload(payload: ProviderPayload) {
  return {
    name: payload.name,
    providerType: payload.providerType,
    baseUrl: payload.baseUrl,
    authType: payload.authType,
    chatEndpoint: payload.chatEndpoint,
    modelsEndpoint: payload.modelsEndpoint,
    apiVersion: payload.apiVersion,
    timeoutMs: payload.timeoutMs,
    retryCount: payload.retryCount,
    priority: payload.priority,
    configuration: payload.configuration,
  };
}
