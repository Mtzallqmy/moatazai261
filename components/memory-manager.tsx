"use client";
import { useEffect, useState } from "react";

type Memory = { id: string; key: string; value: string; memory_type: string; source: string };
export function MemoryManager() {
  const [items, setItems] = useState<Memory[]>([]);
  const [message, setMessage] = useState("");
  const load = async () => {
    const response = await fetch("/api/v1/memory");
    const body = await response.json();
    setItems(body.data ?? []);
  };
  useEffect(() => { queueMicrotask(() => void load()); }, []);
  async function save(formData: FormData) {
    const response = await fetch("/api/v1/memory", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: formData.get("key"), value: formData.get("value"), memoryType: formData.get("memoryType") }) });
    const body = await response.json();
    setMessage(response.ok ? "تم حفظ الذاكرة." : body.error?.message ?? "تعذر الحفظ.");
    if (response.ok) await load();
  }
  async function remove(id: string) {
    await fetch("/api/v1/memory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await load();
  }
  return <div className="stack"><form className="form-grid admin-card" action={(data) => void save(data)}>
    <label>النوع<select name="memoryType"><option value="preference">تفضيل</option><option value="fact">معلومة</option><option value="instruction">تعليمات شخصية</option></select></label>
    <label>المفتاح<input name="key" required /></label><label className="wide">القيمة<input name="value" required /></label>
    <button className="button primary">حفظ</button>
  </form>{message && <p className="notice">{message}</p>}<div className="data-table">{items.map((item) => <div className="table-row" key={item.id}><span>{item.key}<small>{item.memory_type} · {item.source}</small></span><span>{item.value}</span><span/><button className="button danger" onClick={() => void remove(item.id)}>حذف</button></div>)}{!items.length && <p className="empty-state">لا توجد ذاكرة طويلة المدى محفوظة.</p>}</div></div>;
}
