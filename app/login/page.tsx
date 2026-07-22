import { LoginForm } from "@/components/login-form";
import { SiteHeader } from "@/components/site-header";
import { safeRelativePath } from "@/lib/safe-redirect";
export default async function LoginPage({searchParams}:{searchParams:Promise<{returnTo?:string;error?:string}>}){const query=await searchParams;return <div className="site-page"><SiteHeader/><main className="page-shell"><section className="auth-card"><span className="state-icon">⌾</span><h1>مرحبًا بك</h1><p>سجّل الدخول للوصول إلى محادثاتك وملفاتك وإعدادات حسابك.</p><LoginForm returnTo={safeRelativePath(query.returnTo)}/>{query.error&&<p className="notice">تعذر إكمال المصادقة أو رُفض الإذن. حاول مرة أخرى.</p>}</section></main></div>;}
