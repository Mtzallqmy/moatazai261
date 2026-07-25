import { z } from "zod";
import { agentRunManager } from "@/features/agents/agent-run-manager";
import { getCurrentUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const idSchema = z.uuid();

export async function GET(_: Request, context: { params: Promise<{ runId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const parsed = idSchema.safeParse((await context.params).runId);
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  const { data, error } = await createAdminClient().from("agent_runs")
    .select("id,status,safe_output,current_step,error_code,usage_metadata,estimated_cost,started_at,completed_at,agent_run_steps(id,sequence,step_type,status,safe_output,started_at,completed_at)")
    .eq("id", parsed.data).eq("user_id", user.id).single();
  return error ? Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 }) : Response.json({ data });
}

export async function DELETE(_: Request, context: { params: Promise<{ runId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const parsed = idSchema.safeParse((await context.params).runId);
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  const data = await agentRunManager.cancel(user.id, parsed.data);
  return data ? Response.json({ data }) : Response.json({ error: { code: "NOT_RUNNING" } }, { status: 409 });
}
