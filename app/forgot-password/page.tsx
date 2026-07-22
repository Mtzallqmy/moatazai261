import { PasswordRecoveryForm } from "@/components/password-recovery-form";import { SiteHeader } from "@/components/site-header";
export default function Page(){return <div className="site-page"><SiteHeader/><main className="page-shell"><section className="auth-card"><h1>استعادة كلمة المرور</h1><p>سنرسل رابطًا آمنًا إذا كان البريد مسجلًا.</p><PasswordRecoveryForm/></section></main></div>;}
