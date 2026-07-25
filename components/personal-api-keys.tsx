"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Provider = { id: string; name: string };
type Key = { id: string; provider_id: string; key_hint: string; status: string; last_used_at?: string; ai_providers?: { name?: string } };

export function PersonalApiKeys() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [keys, setKeys] = useState<Key[]>([]);
  const [message, setMessage] = useState("");
  const [providerId, setProviderId] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      const [modelResponse, keyResponse] = await Promise.all([
        fetch("/api/v1/models").then((response) => response.json()),
        fetch("/api/v1/providers/credentials").then((response) => response.json()),
      ]);
      const unique = new Map<string, Provider>();
      for (const model of modelResponse.data ?? []) unique.set(model.ai_providers.id, model.ai_providers);
      setProviders([...unique.values()]);
      setProviderId((current) => current || [...unique.keys()][0] || "");
      setKeys(keyResponse.data ?? []);
    } catch {
      setMessage("تعذر تحميل المزودات والمفاتيح.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { queueMicrotask(() => void load()); }, []);
  async function save(formData: FormData) {
    const response = await fetch("/api/v1/providers/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: formData.get("providerId"), secret: formData.get("secret") }),
    });
    setMessage(response.ok ? "حُفظ المفتاح مشفرًا، ولن تظهر قيمته مرة أخرى." : "تعذر حفظ المفتاح.");
    if (response.ok) await load();
  }
  async function revoke(providerId: string) {
    await fetch("/api/v1/providers/credentials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId }),
    });
    await load();
  }
  return <div className="personal-keys-workspace">
    {loading ? <div className="chat-loading"><span />جارٍ تحميل المزودات والمفاتيح…</div> : providers.length === 0
      ? <section className="chat-setup-state keys-setup-state"><span aria-hidden="true">⌁</span><h2>لا يوجد مزود متاح للمفاتيح الشخصية</h2><p>يجب على مدير المنصة تفعيل مزود ونموذج واحد على الأقل. بعدها سيظهر المزود هنا دون إدخال عنوان أو إعداد تقني إضافي.</p><div><Link className="button secondary" href="/chat">العودة للدردشة</Link><button className="button primary" type="button" onClick={() => location.reload()}>إعادة الفحص</button></div></section>
      : <form className="personal-key-form" action={(data) => void save(data)}>
        <header><span className="panel-kicker">BRING YOUR OWN KEY</span><h2>إضافة مفتاح شخصي</h2><p>اختر المزود، ثم أدخل المفتاح مرة واحدة. سيُشفّر على الخادم ولن يُعرض بعد الحفظ.</p></header>
        <fieldset className="provider-choice-grid">
          <legend>اختر المزود</legend>
          {providers.map((provider) => <label key={provider.id} className={providerId === provider.id ? "selected" : ""}>
            <input type="radio" name="providerId" value={provider.id} checked={providerId === provider.id} onChange={() => setProviderId(provider.id)} />
            <span>{provider.name.slice(0, 2).toUpperCase()}</span><b>{provider.name}</b><small>{providerId === provider.id ? "محدد" : "اختيار"}</small>
          </label>)}
        </fieldset>
        <label className="secret-input">المفتاح الجديد<input name="secret" type="password" required minLength={4} autoComplete="new-password" placeholder="ألصق المفتاح هنا" dir="ltr" /></label>
        <button className="button primary" disabled={!providerId}>حفظ أو تدوير المفتاح</button>
      </form>}
    {message && <p className="notice">{message}</p>}
    {keys.length > 0 && <div className="personal-key-list"><header><h2>المفاتيح المحفوظة</h2><small>لا تظهر القيم الأصلية بعد التشفير</small></header>{keys.map((key) => <div className="personal-key-row" key={key.id}>
      <span>{key.ai_providers?.name ?? "مزود"}<small>{key.key_hint}</small></span><span>{key.status}</span>
      <span>{key.last_used_at ? new Date(key.last_used_at).toLocaleString("ar") : "لم يُستخدم"}</span>
      <button className="button danger" onClick={() => void revoke(key.provider_id)}>إلغاء</button>
    </div>)}</div>}
  </div>;
}
