import { ModelManager } from "@/components/model-manager";
import { requirePermission } from "@/lib/auth/guards";
export default async function Page(){await requirePermission("providers.read");return <section className="page-section"><h1>النماذج والإمكانات</h1><p>إضافة يدوية أو استيراد حقيقي من المزود، مع تحكم واضح في التفعيل والظهور والنموذج الافتراضي.</p><ModelManager/></section>}
