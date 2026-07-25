import { agentAdminInputSchema } from "@/schemas/agent";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasCurrentPermission } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await hasCurrentPermission("agents.manage")) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const { data, error } = await createAdminClient().from("agents")
    .select("id,slug,name,description,status,current_version,default_model_id,knowledge_base_id,allowed_roles,created_at,updated_at,ai_models(display_name,ai_providers(name)),agent_tools(tools(id,name,slug))")
    .order("updated_at", { ascending: false });
  return error ? Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 }) : Response.json({ data });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("agents.manage")) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = agentAdminInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } }, { status: 422 });
  const input = parsed.data;
  const admin = createAdminClient();
  const { data: agent, error } = await admin.from("agents").insert({
    slug: input.slug,
    name: input.name,
    description: input.description,
    status: input.status,
    default_model_id: input.defaultModelId,
    knowledge_base_id: input.knowledgeBaseId,
    allowed_roles: input.allowedRoles,
    created_by: user.id,
    updated_by: user.id,
  }).select("id,slug,name,status,current_version").single();
  if (error || !agent) return Response.json({ error: { code: "AGENT_CREATE_FAILED", message: "تعذر إنشاء الوكيل." } }, { status: 409 });
  const { error: versionError } = await admin.from("agent_versions").insert({
    agent_id: agent.id,
    version: 1,
    system_prompt: input.systemPrompt,
    temperature: input.temperature,
    max_tokens: input.maxTokens,
    memory_enabled: input.memoryEnabled,
    policy: input.policy,
    created_by: user.id,
  });
  if (versionError) {
    await admin.from("agents").delete().eq("id", agent.id);
    return Response.json({ error: { code: "AGENT_VERSION_FAILED" } }, { status: 500 });
  }
  if (input.toolIds.length) {
    const { error: toolsError } = await admin.from("agent_tools").insert(input.toolIds.map((toolId) => ({ agent_id: agent.id, tool_id: toolId })));
    if (toolsError) {
      await admin.from("agents").delete().eq("id", agent.id);
      return Response.json({ error: { code: "AGENT_TOOLS_FAILED" } }, { status: 500 });
    }
  }
  await admin.from("audit_logs").insert({
    actor_user_id: user.id,
    action: "agent.created",
    resource_type: "agent",
    resource_id: agent.id,
    metadata: { toolCount: input.toolIds.length, status: input.status },
  });
  return Response.json({ data: agent }, { status: 201 });
}
