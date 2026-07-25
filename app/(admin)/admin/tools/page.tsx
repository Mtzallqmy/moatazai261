import { ToolManager } from "@/components/tool-manager";
import { requirePermission } from "@/lib/auth/guards";

export default async function ToolsPage() {
  await requirePermission("tools.manage");
  return <section className="page-section">
    <span className="panel-kicker">TOOL REGISTRY</span>
    <h1>الأدوات والسياسات</h1>
    <p>تحكم فعلي في تفعيل الأدوات وفرض موافقة المستخدم. لا تُنفذ أداة غير مسجلة أو غير مسموحة.</p>
    <ToolManager />
  </section>;
}
