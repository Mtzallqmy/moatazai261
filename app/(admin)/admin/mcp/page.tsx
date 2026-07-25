import { McpManager } from "@/components/mcp-manager";
import { requirePermission } from "@/lib/auth/guards";
export default async function Page(){await requirePermission("mcp.manage");return <section className="page-section"><h1>خوادم MCP</h1><p>يُفحص الاتصال قبل الحفظ، وتظل الأسرار مشفرة ولا تعود إلى المتصفح.</p><McpManager/></section>;}
