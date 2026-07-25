import { HealthDashboard } from "@/components/health-dashboard";
import { requirePermission } from "@/lib/auth/guards";
export default async function Page(){await requirePermission("logs.read");return <section><h1>صحة المنصة</h1><p>مؤشرات حقيقية من قاعدة البيانات والتخزين والمزودات وMCP والمهام.</p><HealthDashboard/></section>;}
