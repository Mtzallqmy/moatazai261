import { hasCurrentPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!await hasCurrentPermission("agent_runs.read")) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const status = new URL(request.url).searchParams.get("status");
  let query = createAdminClient().from("background_jobs")
    .select("id,job_type,resource_type,resource_id,status,priority,progress,attempts,max_attempts,error_code,available_at,created_at,updated_at,completed_at")
    .order("created_at", { ascending: false }).limit(100);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  return error ? Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 }) : Response.json({ data });
}
