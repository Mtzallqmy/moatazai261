"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type StoredFile = {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  uploaded_at: string;
  metadata?: { chunks?: number };
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FileManager() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [selected, setSelected] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const requestRef = useRef<XMLHttpRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/files", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "تعذر تحميل الملفات.");
      setFiles(body.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل الملفات.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
    return () => requestRef.current?.abort();
  }, [load]);

  function choose(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).slice(0, 10);
    setSelected(next);
    setMessage(list.length > 10 ? "يمكن رفع عشرة ملفات كحد أقصى في العملية الواحدة." : "");
  }

  function upload() {
    if (!selected.length || uploading) return;
    const form = new FormData();
    selected.forEach((file) => form.append("files", file));
    const request = new XMLHttpRequest();
    requestRef.current = request;
    setUploading(true);
    setProgress(0);
    setMessage("");
    request.open("POST", "/api/v1/files");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      const body = JSON.parse(request.responseText || "{}");
      if (request.status >= 200 && request.status < 300) {
        setMessage("اكتمل الرفع بأمان. الملفات الكبيرة ستواصل المعالجة في الخلفية.");
        setSelected([]);
        void load();
      } else {
        setMessage(body.error?.message ?? (body.error?.code === "FEATURE_DISABLED"
          ? "رفع الملفات غير مفعّل على الخادم. فعّل FILE_UPLOADS_ENABLED بعد التأكد من Storage."
          : "تعذر رفع الملفات."));
      }
      setUploading(false);
      requestRef.current = null;
    };
    request.onerror = () => {
      setMessage("انقطع الاتصال أثناء الرفع. لم يُعتبر الرفع مكتملًا.");
      setUploading(false);
      requestRef.current = null;
    };
    request.onabort = () => {
      setMessage("أُلغي الرفع.");
      setUploading(false);
      requestRef.current = null;
    };
    request.send(form);
  }

  async function openFile(id: string) {
    const response = await fetch(`/api/v1/files/${id}`);
    const body = await response.json();
    if (!response.ok || !body.data?.signedUrl) {
      setMessage(body.error?.message ?? "تعذر إنشاء رابط آمن للملف.");
      return;
    }
    window.open(body.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function removeFile(file: StoredFile) {
    if (!window.confirm(`حذف «${file.original_name}»؟`)) return;
    const response = await fetch(`/api/v1/files/${file.id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("تعذر جدولة حذف الملف.");
      return;
    }
    setFiles((current) => current.filter((item) => item.id !== file.id));
    setMessage("نُقل الملف إلى الحذف الآمن.");
  }

  return <div className="file-workspace">
    <section className="file-upload-panel">
      <div>
        <span className="panel-kicker">PRIVATE STORAGE</span>
        <h2>أضف ملفاتك للتحليل والدردشة</h2>
        <p>PDF وOffice والنصوص والجداول والصور. تُحفظ الملفات في مساحة خاصة وتُعالج وفق نوعها.</p>
      </div>
      <label className="file-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault();
        choose(event.dataTransfer.files);
      }}>
        <input type="file" multiple onChange={(event) => choose(event.target.files)}
          accept=".pdf,.docx,.txt,.md,.csv,.json,.xlsx,.pptx,image/png,image/jpeg,image/webp,audio/*,video/mp4" />
        <span aria-hidden="true">⇧</span>
        <b>اسحب الملفات هنا أو اضغط للاختيار</b>
        <small>حتى 10 ملفات في العملية الواحدة</small>
      </label>
      {selected.length > 0 && <div className="selected-files">
        {selected.map((file, index) => <div key={`${file.name}-${index}`}>
          <span><b>{file.name}</b><small>{formatBytes(file.size)} · {file.type || "نوع غير معروف"}</small></span>
          <button className="link-button" type="button" onClick={() => setSelected((current) => current.filter((_, itemIndex) => itemIndex !== index))}>إزالة</button>
        </div>)}
      </div>}
      {uploading && <div className="upload-progress" aria-label={`تقدم الرفع ${progress}%`}><span style={{ width: `${progress}%` }} /><b>{progress}%</b></div>}
      <div className="file-upload-actions">
        {uploading
          ? <button className="button danger" type="button" onClick={() => requestRef.current?.abort()}>إلغاء الرفع</button>
          : <button className="button primary" type="button" disabled={!selected.length} onClick={upload}>رفع ومعالجة</button>}
        <small>لا تُقبل الملفات التنفيذية، وتُتحقق هوية المحتوى على الخادم.</small>
      </div>
    </section>

    {message && <p className="notice" role="status">{message}</p>}

    <section className="file-library">
      <header><div><span className="panel-kicker">FILE LIBRARY</span><h2>مكتبتي</h2></div><button className="button secondary" onClick={() => void load()} disabled={loading}>تحديث</button></header>
      {loading ? <div className="chat-loading"><span />جارٍ تحميل الملفات…</div> : files.length === 0
        ? <div className="dashboard-empty"><b>لا توجد ملفات بعد</b><span>ارفع ملفك الأول وسيظهر هنا مع حالة المعالجة.</span></div>
        : <div className="file-list">{files.map((file) => <article key={file.id}>
          <span className="file-type">{file.original_name.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}</span>
          <div><b>{file.original_name}</b><small>{formatBytes(file.size_bytes)} · {new Date(file.uploaded_at).toLocaleDateString("ar")}</small></div>
          <span className={`file-status ${file.status}`}>{file.status === "ready" ? "جاهز" : file.status === "uploaded" ? "رُفع" : "قيد المعالجة"}</span>
          <div className="file-actions"><button className="link-button" onClick={() => void openFile(file.id)}>فتح</button><button className="link-button danger-text" onClick={() => void removeFile(file)}>حذف</button></div>
        </article>)}</div>}
    </section>
  </div>;
}
