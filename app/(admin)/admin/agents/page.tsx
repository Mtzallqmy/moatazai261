import { AgentManager } from "@/components/agent-manager";
import { requirePermission } from "@/lib/auth/guards";
export default async function Page(){await requirePermission("agents.manage");return <section className="page-section"><h1>الوكلاء</h1><p>إنشاء وكلاء بإصدارات ثابتة ونموذج وحدود تشغيل حقيقية.</p><AgentManager/></section>;}
