"use client";

import { useCallback, useEffect, useState } from "react";

type KnowledgeBase = {
  id: string;
  name: string;
  description?: string;
  visibility: string;
  enabled: boolean;
  knowledge_base_files?: Array<{ count: number }>;
};
type FileItem = { id: string; original_name: string; status: string; size_bytes: number };

export function KnowledgeBaseManager() {
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedBase, setSelectedBase] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [baseResponse, fileResponse] = await Promise.all([
      fetch("/api/v1/knowledge-bases"),
      fetch("/api/v1/files"),
    ]);
    const [baseBody, fileBody] = await Promise.all([baseResponse.json(), fileResponse.json()]);
    setBases(baseBody.data ?? []);
    setFiles((fileBody.data ?? []).filter((file: FileItem) => file.status === "ready"));
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/knowledge-bases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        description: form.get("description") || undefined,
        visibility: form.get("visibility"),
      }),
    });
    const body = await response.json();
    setMessage(response.ok ? "تم إنشاء قاعدة المعرفة." : body.error?.message ?? "تعذر إنشاء قاعدة المعرفة.");
    if (response.ok) event.currentTarget.reset();
    await load();
    setBusy(false);
  }

  async function attach() {
    if (!selectedBase || !selectedFiles.length) return;
    setBusy(true);
    const response = await fetch(`/api/v1/knowledge-bases/${selectedBase}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileIds: selectedFiles }),
    });
    const body = await response.json();
    setMessage(response.ok
      ? `تم ربط ${body.data?.attached ?? selectedFiles.length} ملفًا بقاعدة المعرفة.`
      : body.error?.message ?? "تعذر ربط الملفات.");
    if (response.ok) setSelectedFiles([]);
    await load();
    setBusy(false);
  }

  return <div className="stack">
    <form className="management-form" onSubmit={create}>
      <div className="wide"><h2>قاعدة معرفة جديدة</h2><p>تعمل بالبحث النصي فورًا، وتستخدم Embeddings عند تعيين نموذج يدعمها.</p></div>
      <label>الاسم<input name="name" required minLength={2} maxLength={160} /></label>
      <label>النطاق<select name="visibility" defaultValue="private"><option value="private">خاصة</option><option value="role">حسب الدور</option></select></label>
      <label className="wide">الوصف<textarea name="description" maxLength={1000} /></label>
      <button className="button primary" disabled={busy}>إنشاء</button>
    </form>
    {message && <p className="notice" role="status">{message}</p>}
    <section className="management-form">
      <div className="wide"><h2>ربط ملفات جاهزة</h2><p>لا تظهر هنا إلا الملفات التي اكتملت معالجتها وتخص حسابك.</p></div>
      <label>قاعدة المعرفة<select value={selectedBase} onChange={(event) => setSelectedBase(event.target.value)}>
        <option value="">اختر قاعدة</option>{bases.map((base) => <option value={base.id} key={base.id}>{base.name}</option>)}
      </select></label>
      <div className="wide selectable-files">
        {files.map((file) => <label key={file.id}><input type="checkbox" checked={selectedFiles.includes(file.id)}
          onChange={(event) => setSelectedFiles((current) => event.target.checked ? [...current, file.id] : current.filter((id) => id !== file.id))} />
          <span>{file.original_name}</span><small>{Math.ceil(file.size_bytes / 1024)} KB</small>
        </label>)}
        {!files.length && <p className="empty-state">ارفع ملفًا نصيًا أو مستندًا وانتظر اكتمال معالجته أولًا.</p>}
      </div>
      <button className="button primary" type="button" disabled={busy || !selectedBase || !selectedFiles.length} onClick={() => void attach()}>
        ربط الملفات
      </button>
    </section>
    <div className="data-table">
      <div className="table-row table-head"><b>قاعدة المعرفة</b><b>النطاق</b><b>الملفات</b><b>الحالة</b></div>
      {bases.map((base) => <div className="table-row" key={base.id}>
        <span><b>{base.name}</b><small>{base.description || "بلا وصف"}</small></span>
        <span>{base.visibility}</span>
        <span>{base.knowledge_base_files?.[0]?.count ?? 0}</span>
        <span className="status-badge">{base.enabled ? "مفعّلة" : "معطّلة"}</span>
      </div>)}
    </div>
  </div>;
}
