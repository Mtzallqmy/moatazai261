import { HealthDashboard } from "@/components/health-dashboard";
import { requirePermission } from "@/lib/auth/guards";
export default async function Page(){await requirePermission("logs.read");return <section className="health-page"><header><span className="panel-kicker">OPERATIONS & RELIABILITY</span><h1>صحة المنصة</h1><p>مركز تشخيص حي لقاعدة البيانات والتخزين والدردشة والمزودات والوكلاء والمهام الخلفية.</p></header><HealthDashboard/></section>;}
