import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <span className="brand-mark small" aria-hidden="true">M</span>
          <div><b>Moataz AI</b><p>منصة عربية للذكاء الاصطناعي والمعرفة، مصممة للعمل بثقة ووضوح.</p></div>
        </div>
        <nav className="footer-links" aria-label="روابط المنصة">
          <Link href="/articles">المقالات</Link>
          <Link href="/books">الكتب</Link>
          <Link href="/about">عن المنصة</Link>
          <Link href="/contact">تواصل</Link>
        </nav>
        <div className="footer-status"><span className="status-dot" /> الأنظمة الأساسية تعمل</div>
      </div>
      <div className="shell footer-bottom">
        <span>© 2026 معتز العلقمي — جميع الحقوق محفوظة</span>
        <span>خصوصية وأمان منذ التصميم</span>
      </div>
    </footer>
  );
}
