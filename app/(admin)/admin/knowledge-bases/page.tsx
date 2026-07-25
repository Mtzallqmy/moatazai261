import { KnowledgeBaseManager } from "@/components/knowledge-base-manager";
import { requirePermission } from "@/lib/auth/guards";

export default async function KnowledgeBasesPage() {
  await requirePermission("knowledge.manage");
  return <section className="page-section">
    <span className="panel-kicker">RETRIEVAL</span>
    <h1>قواعد المعرفة</h1>
    <p>أنشئ مجموعات مستندات خاصة أو مشتركة واربطها بالوكلاء مع عزل المستخدم وسياسات RLS.</p>
    <KnowledgeBaseManager />
  </section>;
}
