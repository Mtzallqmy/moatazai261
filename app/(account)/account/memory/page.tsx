import { MemoryManager } from "@/components/memory-manager";
import { requirePermission } from "@/lib/auth/guards";
export default async function Page(){await requirePermission("memory.manage");return <section><h1>ذاكرتي</h1><p>يمكنك مراجعة كل معلومة طويلة المدى وتعديلها أو حذفها. لا تُحفظ الأسرار تلقائيًا.</p><MemoryManager/></section>;}
