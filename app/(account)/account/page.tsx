import Link from "next/link";
import { getCurrentProfile, requireUser } from "@/lib/auth/guards";

export default async function AccountPage(){
  const user = await requireUser("/account");
  const profile = await getCurrentProfile();
  return <section className="account-overview">
    <div className="account-hero">
      <span className="account-avatar">{(profile?.display_name || user.email || "M").slice(0, 1).toUpperCase()}</span>
      <div><span className="panel-kicker">ACCOUNT OVERVIEW</span><h1>{profile?.display_name || "حسابي"}</h1><p dir="ltr">{user.email}</p></div>
      <span className={`account-status ${profile?.account_status ?? "active"}`}>{profile?.account_status === "active" ? "حساب نشط" : "حالة مقيّدة"}</span>
    </div>
    <div className="account-action-grid">
      <Link href="/chat"><span>✦</span><div><b>الدردشة</b><small>ابدأ محادثة أو مهمة جديدة</small></div><i>←</i></Link>
      <Link href="/account/files"><span>⇧</span><div><b>ملفاتي</b><small>رفع الملفات ومعالجتها</small></div><i>←</i></Link>
      <Link href="/account/api-keys"><span>⌁</span><div><b>مفاتيحي</b><small>مفاتيح مزودات مشفرة</small></div><i>←</i></Link>
      <Link href="/account/memory"><span>◫</span><div><b>ذاكرتي</b><small>مراجعة الذاكرة طويلة المدى</small></div><i>←</i></Link>
      <Link href="/account/settings"><span>⚙</span><div><b>الإعدادات</b><small>الملف والتفضيلات والخصوصية</small></div><i>←</i></Link>
    </div>
  </section>;
}
