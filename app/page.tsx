import Link from "next/link";
import { FeatureCard } from "@/components/feature-card";
import { FeaturedContent } from "@/components/featured-content";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { listFeaturedContent } from "@/lib/content";

export const revalidate = 60;

export default async function Home() {
  const featured = await listFeaturedContent(3);
  return (
    <div className="site-page">
      <SiteHeader />
      <main>
        <section className="hero shell">
          <div className="hero-copy">
            <span className="eyebrow"><i /> منصة عربية للذكاء الاصطناعي والمعرفة</span>
            <h1>مساحة عمل ذكية،<em>تبني معك لا بدلًا عنك.</em></h1>
            <p>دردشة متعددة المزودات، أدوات ووكلاء، ملفات ومعرفة، ومحتوى متخصص في تجربة واحدة محمية ومنظمة وقابلة للتوسع.</p>
            <div className="actions">
              <Link className="button primary" href="/login">ابدأ من مساحتك <span aria-hidden="true">←</span></Link>
              <Link className="button secondary" href="/articles">استكشف المعرفة</Link>
            </div>
            <div className="trust-row">
              <span><b>خصوصية</b><small>محادثات وملفات خاصة</small></span>
              <span><b>مرونة</b><small>مزودات ونماذج متعددة</small></span>
              <span><b>تحكم</b><small>صلاحيات وحدود واضحة</small></span>
            </div>
          </div>
          <div className="hero-product" aria-label="نظرة على مساحة العمل">
            <div className="product-window">
              <header><span className="window-dots"><i /><i /><i /></span><b>مساحة العمل</b><span className="live-chip"><i /> جاهز</span></header>
              <div className="product-layout">
                <aside>
                  <span className="product-logo">M</span>
                  <i className="active" /><i /><i /><i />
                </aside>
                <section>
                  <div className="product-meta"><small>جلسة جديدة</small><span>النموذج المناسب يُحدد حسب المهمة</span></div>
                  <div className="prompt-card"><b>كيف يمكنني مساعدتك اليوم؟</b><p>اكتب سؤالك، أرفق ملفًا، أو اختر وكيلًا متخصصًا.</p><div><span>ملف</span><span>بحث</span><span>تحليل</span></div></div>
                  <div className="product-composer"><span>اكتب رسالتك هنا...</span><b>↑</b></div>
                </section>
              </div>
            </div>
            <span className="floating-badge secure">مفاتيح مشفرة <b>✓</b></span>
            <span className="floating-badge streaming">بث لحظي <b>●</b></span>
          </div>
        </section>
        <section className="shell platform-strip" aria-label="ركائز المنصة">
          <span>دردشة ووكلاء</span><i /> <span>بحث ومعرفة</span><i /> <span>ملفات وتحليل</span><i /> <span>إدارة وحوكمة</span>
        </section>
        <section className="shell feature-grid" aria-label="قدرات المنصة">
          <FeatureCard icon="01" title="ذكاء متعدد المزودات" description="اختر المزود والنموذج وفق المهمة، مع تحقق من القدرات ومسارات احتياطية وإدارة آمنة للمفاتيح." status="مرن حسب إعدادك" />
          <FeatureCard icon="02" title="معرفة قابلة للاستخدام" description="اربط ملفاتك وقواعد المعرفة بالمحادثة، واسترجع الإجابات مع مصادر وسياق منظم." status="خصوصية افتراضية" />
          <FeatureCard icon="03" title="تشغيل تحت السيطرة" description="صلاحيات، حصص استخدام، تدقيق، مراقبة صحية وسجل عمليات يمنح الإدارة رؤية حقيقية." status="حوكمة مدمجة" />
        </section>
        <section className="shell workflow-section">
          <div className="workflow-copy"><span className="eyebrow">من الفكرة إلى النتيجة</span><h2>تجربة واحدة، مهما اختلفت المهمة.</h2><p>ابدأ بسؤال بسيط، انتقل إلى تحليل ملف أو بحث عميق، واحتفظ بالسياق والنتائج داخل حسابك دون تشتيت بين أدوات منفصلة.</p><Link className="text-link" href="/about">تعرّف على المنصة <span>←</span></Link></div>
          <ol className="workflow-list">
            <li><b>01</b><div><strong>اختر طريقة العمل</strong><span>دردشة، وكيل، بحث أو تحليل بيانات.</span></div></li>
            <li><b>02</b><div><strong>أضف سياقك</strong><span>ملفاتك ومعرفتك تبقى ضمن صلاحياتك.</span></div></li>
            <li><b>03</b><div><strong>استلم نتيجة موثقة</strong><span>مخرجات واضحة قابلة للمراجعة والمتابعة.</span></div></li>
          </ol>
        </section>
        <FeaturedContent items={featured} />
      </main>
      <SiteFooter />
    </div>
  );
}
