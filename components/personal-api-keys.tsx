"use client";
import { useEffect, useState } from "react";

type Provider = { id: string; name: string };
type Key = { id: string; provider_id: string; key_hint: string; status: string; last_used_at?: string; ai_providers?: { name?: string } };

export function PersonalApiKeys() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [keys, setKeys] = useState<Key[]>([]);
  const [message, setMessage] = useState("");
  const load = async () => {
    const [modelResponse, keyResponse] = await Promise.all([
      fetch("/api/v1/models").then((response) => response.json()),
      fetch("/api/v1/providers/credentials").then((response) => response.json()),
    ]);
    const unique = new Map<string, Provider>();
    for (const model of modelResponse.data ?? []) unique.set(model.ai_providers.id, model.ai_providers);
    setProviders([...unique.values()]);
    setKeys(keyResponse.data ?? []);
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
  return <div className="stack">
    <form className="admin-card form-grid" action={(data) => void save(data)}>
      <label>المزود<select name="providerId" required><option value="">اختر المزود</option>{providers.map((provider) => <option value={provider.id} key={provider.id}>{provider.name}</option>)}</select></label>
      <label>المفتاح الجديد<input name="secret" type="password" required autoComplete="new-password" /></label>
      <button className="button primary">حفظ أو تدوير المفتاح</button>
    </form>
    {message && <p className="notice">{message}</p>}
    <div className="data-table">{keys.map((key) => <div className="table-row" key={key.id}>
      <span>{key.ai_providers?.name ?? "مزود"}<small>{key.key_hint}</small></span><span>{key.status}</span>
      <span>{key.last_used_at ? new Date(key.last_used_at).toLocaleString("ar") : "لم يُستخدم"}</span>
      <button className="button danger" onClick={() => void revoke(key.provider_id)}>إلغاء</button>
    </div>)}</div>
  </div>;
}
