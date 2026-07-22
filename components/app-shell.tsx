import Link from "next/link";

const userLinks = [["/chat","الدردشة"],["/account","الحساب"],["/account/files","ملفاتي"],["/account/settings","الإعدادات"]];
const adminLinks = [["/admin","نظرة عامة"],["/admin/users","المستخدمون"],["/admin/providers","المزودات"],["/admin/models","النماذج"],["/admin/content","المحتوى"],["/admin/categories","التصنيفات"],["/admin/media","الوسائط"],["/admin/schedules","الجدولة"],["/admin/integrations","التكاملات"],["/admin/settings","الإعدادات"],["/admin/logs","السجلات"]];

export function AppShell({ admin=false, title, children }: { admin?: boolean; title: string; children: React.ReactNode }) {
  const links = admin ? adminLinks : userLinks;
  return <div className="app-layout"><aside className="sidebar"><Link className="brand" href="/"><span className="brand-mark">M</span><span>Moataz AI 26</span></Link><nav className="side-nav">{links.map(([href,label])=><Link href={href} key={href}>{label}</Link>)}</nav><form action="/auth/logout" method="post"><button className="button secondary" type="submit">تسجيل الخروج</button></form></aside><main className="app-main"><header className="app-top"><div><small>{admin ? "لوحة الإدارة" : "مساحة المستخدم"}</small><h1>{title}</h1></div><Link className="button secondary" href="/">الموقع العام</Link></header>{children}</main></div>;
}
