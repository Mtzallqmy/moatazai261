import { FeatureCard } from "@/components/feature-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function Home() {
  return (
    <div className="site-page">
      <SiteHeader />
      <main>
        <section className="hero shell">
          <span className="eyebrow">المرحلة الأولى — أساس إنتاجي قابل للتوسع</span>
          <h1>ذكاء اصطناعي متعدد المزودات، <em>في مساحة واحدة.</em></h1>
          <p>دردشة خاصة، إدارة مزودات مرنة، ومحتوى عربي وإنجليزي ضمن معمارية مصممة للنمو بأمان.</p>
          <div className="actions"><a className="button primary" href="/login">ابدأ الآن</a><a className="button secondary" href="/about">اكتشف المنصة</a></div>
          <div className="status-line"><span>بنية API موحدة</span><span>صلاحيات محمية</span><span>لا مفاتيح في المتصفح</span></div>
        </section>
        <section className="shell feature-grid" aria-label="قدرات المنصة">
          <FeatureCard icon="✦" title="دردشة متعددة المزودات" description="طبقة موحدة تفصل تجربة الدردشة عن أي شركة أو نموذج بعينه." status="مفعلة تدريجيًا" />
          <FeatureCard icon="▤" title="محتوى احترافي" description="أساس للمقالات والمنشورات والكتب مع تصنيفات ووسوم ونشر منظم." status="الأساس جاهز" />
          <FeatureCard icon="⌾" title="إدارة آمنة" description="صلاحيات واضحة، سجل تدقيق، تحقق من المدخلات ورؤوس حماية افتراضية." status="محمي افتراضيًا" />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
