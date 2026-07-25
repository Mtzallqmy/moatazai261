import { hasCurrentPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!await hasCurrentPermission("agent_runs.read")) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const { data, error } = await createAdminClient().from("retrieval_runs")
    .select("id,user_id,knowledge_base_id,strategy,status,confidence,diagnostics,created_at,completed_at,retrieval_results(count)")
    .order("created_at", { ascending: false }).limit(100);
  return error ? Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 }) : Response.json({ data });
}
