import { ProviderManager } from "@/components/provider-manager";
import { requirePermission } from "@/lib/auth/guards";
export default async function Page(){await requirePermission("providers.read");return <section className="page-section"><h1>مزودو الذكاء الاصطناعي</h1><p>إدارة الحالة، المفاتيح المخفية، واختبارات الاتصال الحقيقية.</p><ProviderManager/></section>}
