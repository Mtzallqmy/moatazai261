"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Model = {
  id: string;
  display_name: string;
  description?: string;
  input_modalities: string[];
  capabilities: Record<string, boolean>;
  billing_tier: string;
  ai_providers: { name: string; health_status: string };
};
type Conversation = { id: string; title: string; is_pinned: boolean; last_message_at?: string };
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: string;
  parent_message_id?: string | null;
  branch_id?: string | null;
};
type Branch = { id: string; name?: string; root_message_id: string };
type Agent = { id: string; name: string; description?: string; ai_models?: { display_name?: string } };

export function ChatWorkspace() {
  const [models, setModels] = useState<Model[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [mode, setMode] = useState<"chat" | "agent">("chat");
  const [agentId, setAgentId] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [branchFrom, setBranchFrom] = useState<Message | null>(null);
  const [modelId, setModelId] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const selected = useMemo(() => models.find((model) => model.id === modelId), [models, modelId]);

  useEffect(() => {
    queueMicrotask(() => {
      const draft = localStorage.getItem("chat-draft");
      if (draft) setInput(draft);
    });
    void Promise.all([
      fetch("/api/v1/models").then((response) => response.json()),
      fetch("/api/v1/conversations").then((response) => response.json()),
      fetch("/api/v1/agents").then((response) => response.json()),
    ]).then(([modelBody, conversationBody, agentBody]) => {
      setModels(modelBody.data ?? []);
      setModelId(modelBody.data?.[0]?.id ?? "");
      setConversations(conversationBody.data ?? []);
      setAgents(agentBody.data ?? []);
      setAgentId(agentBody.data?.[0]?.id ?? "");
    }).catch(() => setError("تعذر تحميل بيانات الدردشة. تحقق من الاتصال ثم أعد المحاولة."))
      .finally(() => setLoading(false));
    return () => controller.current?.abort();
  }, []);

  useEffect(() => {
    localStorage.setItem("chat-draft", input);
  }, [input]);

  async function loadConversations(query = search) {
    const response = await fetch(`/api/v1/conversations?q=${encodeURIComponent(query)}`);
    const body = await response.json();
    if (response.ok) setConversations(body.data ?? []);
  }

  async function openConversation(id: string) {
    setError("");
    const response = await fetch(`/api/v1/conversations/${id}`);
    const body = await response.json();
    if (!response.ok) {
      setError("تعذر فتح المحادثة.");
      return;
    }
    setConversationId(id);
    setMessages(body.data.messages ?? []);
    setBranches(body.data.branches ?? []);
    setActiveBranchId(body.data.active_branch_id ?? null);
    setBranchFrom(null);
  }

  async function patchConversation(values: Record<string, unknown>) {
    if (!conversationId) return;
    const response = await fetch(`/api/v1/conversations/${conversationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setError("تعذر تحديث المحادثة.");
      return;
    }
    await Promise.all([openConversation(conversationId), loadConversations()]);
  }

  async function renameConversation() {
    const current = conversations.find((conversation) => conversation.id === conversationId);
    const title = window.prompt("اسم المحادثة", current?.title ?? "");
    if (title?.trim()) await patchConversation({ title: title.trim() });
  }

  async function send() {
    if (!input.trim() || busy || (mode === "chat" ? !modelId : !agentId)) return;
    const text = input.trim();
    const idempotencyKey = crypto.randomUUID();
    setInput("");
    localStorage.removeItem("chat-draft");
    setBusy(true);
    setError("");
    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content: text, parent_message_id: branchFrom?.id },
      { id: assistantId, role: "assistant", content: "", status: "streaming" },
    ]);
    controller.current = new AbortController();
    try {
      if (mode === "agent") {
        const response = await fetch("/api/v1/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, conversationId, prompt: text, idempotencyKey }),
          signal: controller.current.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message ?? "تعذر تشغيل الوكيل.");
        setMessages((current) => current.map((message) =>
          message.id === assistantId
            ? { ...message, content: body.data?.safe_output?.content ?? "اكتمل التشغيل دون مخرجات.", status: "completed" }
            : message
        ));
        return;
      }
      const response = await fetch("/api/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          conversationId,
          modelId,
          message: text,
          contentParts: [],
          parentMessageId: branchFrom?.id,
          idempotencyKey,
        }),
        signal: controller.current.signal,
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? "تعذر إرسال الرسالة.");
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let resolvedAssistantId = assistantId;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const event = frame.match(/^event: (.+)$/m)?.[1];
          const data = frame.match(/^data: (.+)$/m)?.[1];
          if (!data) continue;
          const payload = JSON.parse(data);
          if (event === "meta") {
            setConversationId(payload.conversationId);
            resolvedAssistantId = payload.assistantMessageId;
            setMessages((current) => current.map((message) =>
              message.id === userId ? { ...message, id: payload.userMessageId } :
                message.id === assistantId ? { ...message, id: payload.assistantMessageId } : message
            ));
          } else if (event === "delta") {
            setMessages((current) => current.map((message) =>
              message.id === resolvedAssistantId || message.id === assistantId
                ? { ...message, content: message.content + (payload.content ?? "") }
                : message
            ));
          } else if (event === "error") {
            setError(`${payload.error?.message ?? "تعذر التوليد"} (${payload.error?.errorId ?? ""})`);
          }
        }
      }
      setMessages((current) => current.map((message) =>
        message.id === resolvedAssistantId || message.id === assistantId
          ? { ...message, status: "completed" }
          : message
      ));
      setBranchFrom(null);
      await loadConversations();
      if (conversationId) await openConversation(conversationId);
    } catch (cause) {
      if ((cause as Error).name !== "AbortError") {
        setError(cause instanceof Error ? cause.message : "تعذر إرسال الرسالة.");
      }
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, status: "failed" } : message
      ));
    } finally {
      setBusy(false);
      controller.current = null;
    }
  }

  function stop() {
    controller.current?.abort();
    setBusy(false);
  }

  const newConversation = () => {
    setConversationId(undefined);
    setMessages([]);
    setBranches([]);
    setActiveBranchId(null);
    setBranchFrom(null);
  };
  const missingSelection = mode === "chat" ? models.length === 0 : agents.length === 0;

  return <div className="chat-grid">
    <aside className="chat-list">
      <details className="chat-history">
        <summary>
          <span>المحادثات</span>
          <span className="chat-history-count">{conversations.length}</span>
        </summary>
        <div className="chat-history-content">
          <button className="button primary new-chat-button" onClick={newConversation}>＋ محادثة جديدة</button>
          <label className="chat-search">
            <span className="sr-only">بحث في المحادثات</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void loadConversations(); }}
              placeholder="بحث في المحادثات…" />
          </label>
          <div className="stack">{conversations.map((conversation) =>
            <button className={`conversation-button ${conversation.id === conversationId ? "active" : ""}`} key={conversation.id} onClick={() => void openConversation(conversation.id)}>
              {conversation.is_pinned ? "★ " : ""}{conversation.title}
            </button>
          )}
          {!loading && conversations.length === 0 && <small className="chat-list-empty">ستظهر محادثاتك المحفوظة هنا.</small>}
          </div>
        </div>
      </details>
    </aside>
    <section className="chat-panel">
      <div className="chat-toolbar">
        <fieldset className="chat-mode-switch">
          <legend>وضع التشغيل</legend>
          <button type="button" aria-pressed={mode === "chat"} onClick={() => setMode("chat")}>
            <span aria-hidden="true">✦</span><b>دردشة</b><small>نموذج مباشر</small>
          </button>
          <button type="button" aria-pressed={mode === "agent"} onClick={() => setMode("agent")}>
            <span aria-hidden="true">⌁</span><b>وكيل</b><small>{agents.length ? `${agents.length} متاح` : "يحتاج إعدادًا"}</small>
          </button>
        </fieldset>
        {mode === "chat"
          ? <label className="chat-resource-select"><span>النموذج</span><select value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={models.length === 0}>
            {models.length === 0 && <option value="">لا يوجد نموذج متاح</option>}
            {models.map((model) => <option key={model.id} value={model.id}>
              {model.display_name} — {model.ai_providers.name} ({model.billing_tier})
            </option>)}
          </select></label>
          : <label className="chat-resource-select"><span>الوكيل</span><select value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={agents.length === 0}>
            {agents.length === 0 && <option value="">لم يُنشر أي وكيل</option>}
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} — {agent.ai_models?.display_name}</option>)}
          </select></label>}
        {conversationId && <>
          <button className="link-button" onClick={() => void renameConversation()}>إعادة التسمية</button>
          <button className="link-button" onClick={() => void patchConversation({
            isPinned: !conversations.find((conversation) => conversation.id === conversationId)?.is_pinned,
          })}>تثبيت</button>
          <button className="link-button" onClick={() => void patchConversation({ isArchived: true })}>أرشفة</button>
        </>}
        {branches.length > 0 && <label>الفرع<select value={activeBranchId ?? ""} onChange={(event) => {
          const value = event.target.value || null;
          setActiveBranchId(value);
          void patchConversation({ activeBranchId: value });
        }}>
          <option value="">المسار الرئيسي</option>
          {branches.map((branch, index) => <option value={branch.id} key={branch.id}>{branch.name || `فرع ${index + 1}`}</option>)}
        </select></label>}
        {mode === "chat" && selected && <small className="model-health"><i />{selected.input_modalities.join("، ")} · {selected.ai_providers.health_status}</small>}
      </div>
      <div className="messages" aria-live="polite">
        {loading && <div className="chat-loading"><span />جارٍ تجهيز مساحة العمل…</div>}
        {!loading && messages.length === 0 && !missingSelection && <div className="chat-welcome">
          <span className="chat-welcome-icon" aria-hidden="true">✦</span>
          <h2>{mode === "agent" ? "ابدأ مهمة مع وكيلك" : "كيف يمكنني مساعدتك؟"}</h2>
          <p>{mode === "agent" ? "صف النتيجة المطلوبة بوضوح، وسيتولى الوكيل تنفيذ الخطوات المسموح بها." : "اختر النموذج، ثم اكتب سؤالك. تُحفظ المحادثة في حسابك تلقائيًا."}</p>
        </div>}
        {!loading && messages.length === 0 && missingSelection && <div className="chat-setup-state">
          <span aria-hidden="true">{mode === "agent" ? "⌁" : "◇"}</span>
          <h2>{mode === "agent" ? "لا يوجد وكيل منشور بعد" : "الدردشة تحتاج نموذجًا مفعّلًا"}</h2>
          <p>{mode === "agent"
            ? "ينشئ مدير المنصة الوكيل ويربطه بنموذج وأدوات، ثم ينشره للمستخدمين المسموحين."
            : "يضيف المدير مزودًا ونموذجًا متاحًا. وبعد ظهوره هنا يمكنك استخدام مفتاح المنصة الافتراضي أو مفتاحك الشخصي."}</p>
          <div>
            <Link className="button secondary" href="/account/api-keys">إدارة مفاتيحي</Link>
            <button className="button primary" type="button" onClick={() => location.reload()}>إعادة الفحص</button>
          </div>
        </div>}
        {messages.map((message) => <article className={`message ${message.role}`} key={message.id}>
          <strong>{message.role === "user" ? "أنت" : mode === "agent" ? "الوكيل" : "المساعد"}</strong>
          <pre>{message.content || (message.status === "streaming" ? "" : "تعذر إنشاء الرد.")}</pre>
          <div className="message-actions">
            {message.content && <button className="link-button" onClick={() => void navigator.clipboard.writeText(message.content)}>نسخ</button>}
            {conversationId && <button className="link-button" onClick={() => setBranchFrom(message)}>فرّع من هنا</button>}
          </div>
        </article>)}
      </div>
      {branchFrom && <div className="notice">سيبدأ الرد التالي فرعًا جديدًا بعد: «{branchFrom.content.slice(0, 80)}»
        <button className="link-button" onClick={() => setBranchFrom(null)}>إلغاء</button>
      </div>}
      {error && <p className="error-state">{error}</p>}
      <div className="composer">
        <textarea value={input} onChange={(event) => setInput(event.target.value)}
          placeholder={mode === "agent" ? "كل تشغيل يُسجل بخطوات وحدود تكلفة ووقت…" : "اكتب رسالتك…"}
          maxLength={100_000} />
        {busy
          ? <button className="button danger" onClick={stop}>إيقاف</button>
          : <button className="button primary composer-send" onClick={() => void send()}
            disabled={(mode === "chat" ? !modelId : !agentId) || !input.trim()}>إرسال</button>}
      </div>
    </section>
  </div>;
}
