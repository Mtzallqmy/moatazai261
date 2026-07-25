import Link from "next/link";
import { AppearanceControls } from "@/components/appearance-controls";

const links = [
  ["/articles", "المقالات"],
  ["/books", "الكتب"],
  ["/posts", "المنشورات"],
  ["/about", "عن المنصة"],
  ["/contact", "تواصل"],
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="الصفحة الرئيسية">
          <span className="brand-mark" aria-hidden="true"><i />M</span>
          <span><b>Moataz AI</b><small>ذكاء منظم. أثر حقيقي.</small></span>
        </Link>
        <nav className="nav" aria-label="التنقل العام">
          {links.map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}
        </nav>
        <div className="header-actions">
          <AppearanceControls compact />
          <Link className="button secondary login-link" href="/login"><span className="status-dot" /> تسجيل الدخول</Link>
          <details className="mobile-menu">
            <summary aria-label="فتح قائمة التنقل"><span /><span /><span /></summary>
            <nav aria-label="التنقل على الهاتف">
              {links.map(([href, label]) => <Link href={href} key={href}>{label}</Link>)}
              <Link href="/login">تسجيل الدخول</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
