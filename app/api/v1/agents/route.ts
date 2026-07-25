import { agentRunInputSchema } from "@/features/agents/types";
import { agentRunManager } from "@/features/agents/agent-run-manager";
import { getCurrentUser, hasCurrentPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorResponse } from "@/lib/errors";
import { rateLimiter, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("agents.use")) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const admin = createAdminClient();
  const [{ data: roles }, { data, error }] = await Promise.all([
    admin.from("user_roles").select("roles!inner(name)").eq("user_id", user.id),
    admin.from("agents").select("id,slug,name,description,default_model_id,knowledge_base_id,allowed_roles,current_version,ai_models(display_name,capabilities,ai_providers(name))").eq("status", "active").order("name"),
  ]);
  if (error) return Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 });
  const roleNames = new Set((roles ?? []).map((row) => (row.roles as unknown as { name: string }).name));
  return Response.json({ data: (data ?? []).filter((agent) => agent.allowed_roles.some((role: string) => roleNames.has(role))) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("agents.use")) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const limit = await rateLimiter.consume(`agents:user:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!limit.allowed) return Response.json({ error: { code: "RATE_LIMITED" } }, { status: 429, headers: rateLimitHeaders(limit) });
  const parsed = agentRunInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } }, { status: 422 });
  try {
    const data = await agentRunManager.run(user.id, parsed.data);
    return Response.json({ data }, { status: 201, headers: rateLimitHeaders(limit) });
  } catch (error) {
    return errorResponse(error);
  }
}
