"use client";

import { useEffect, useState } from "react";

type AccountData = {
  email?: string;
  profile: { display_name?: string; username?: string; bio?: string; preferred_language: "ar" | "en"; theme: "system" | "light" | "dark" | "eye" };
  settings: { language: "ar" | "en"; theme: "system" | "light" | "dark" | "eye"; notifications_enabled: boolean; save_chat_history: boolean };
};

export function AccountSettings() {
  const [data, setData] = useState<AccountData | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    queueMicrotask(() => void fetch("/api/v1/account/settings").then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message);
      setData(body.data);
    }).catch(() => setMessage("تعذر تحميل إعدادات الحساب.")));
  }, []);

  async function save(formData: FormData) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/v1/account/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: formData.get("displayName"),
        username: String(formData.get("username") ?? "").trim() || null,
        bio: formData.get("bio"),
        language: formData.get("language"),
        theme: formData.get("theme"),
        notificationsEnabled: formData.get("notificationsEnabled") === "on",
        saveChatHistory: formData.get("saveChatHistory") === "on",
      }),
    });
    const body = await response.json();
    if (response.ok) {
      const selectedTheme = String(formData.get("theme") ?? "system");
      const visualTheme = selectedTheme === "eye" ? "comfort" : selectedTheme === "system"
        ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
        : selectedTheme;
      localStorage.setItem("moataz-theme", visualTheme);
      document.documentElement.dataset.theme = visualTheme;
      document.documentElement.style.colorScheme = visualTheme === "light" ? "light" : "dark";
    }
    setMessage(response.ok ? "حُفظت إعدادات حسابك." : body.error?.message ?? "تعذر حفظ الإعدادات.");
    setBusy(false);
  }

  if (!data) return <div className="chat-loading"><span />جارٍ تحميل الإعدادات…</div>;
  return <form className="account-settings-form" action={(formData) => void save(formData)}>
    <section>
      <header><span className="panel-kicker">PROFILE</span><h2>الملف الشخصي</h2></header>
      <div className="form-grid">
        <label>الاسم الظاهر<input name="displayName" required minLength={2} maxLength={120} defaultValue={data.profile.display_name ?? ""} /></label>
        <label>اسم المستخدم<input name="username" pattern="[a-zA-Z0-9_]{3,32}" dir="ltr" defaultValue={data.profile.username ?? ""} placeholder="moataz_ai" /></label>
        <label className="wide">نبذة قصيرة<textarea name="bio" rows={4} maxLength={500} defaultValue={data.profile.bio ?? ""} /></label>
        <label>البريد<input value={data.email ?? ""} readOnly dir="ltr" /></label>
      </div>
    </section>
    <section>
      <header><span className="panel-kicker">PREFERENCES</span><h2>التفضيلات والخصوصية</h2></header>
      <div className="form-grid">
        <label>اللغة<select name="language" defaultValue={data.settings.language}><option value="ar">العربية</option><option value="en">English</option></select></label>
        <label>المظهر<select name="theme" defaultValue={data.settings.theme}><option value="system">حسب الجهاز</option><option value="dark">داكن</option><option value="light">فاتح</option><option value="eye">مريح للعين</option></select></label>
        <label className="toggle-row"><input name="notificationsEnabled" type="checkbox" defaultChecked={data.settings.notifications_enabled} /><span><b>الإشعارات</b><small>السماح بإشعارات الحساب والتشغيل.</small></span></label>
        <label className="toggle-row"><input name="saveChatHistory" type="checkbox" defaultChecked={data.settings.save_chat_history} /><span><b>حفظ سجل الدردشة</b><small>الاحتفاظ بالمحادثات الخاصة في حسابك.</small></span></label>
      </div>
    </section>
    {message && <p className="notice" role="status">{message}</p>}
    <button className="button primary settings-save" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ التغييرات"}</button>
  </form>;
}
