import { getCurrentUser, hasCurrentPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { modelUpdateSchema } from "@/schemas/provider";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ modelId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("models.manage")) {
    return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const parsed = modelUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({
      error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors },
    }, { status: 422 });
  }

  const { modelId } = await params;
  const admin = createAdminClient();
  const value = parsed.data;
  if (value.isDefault) {
    await admin.from("ai_models").update({ is_default: false }).eq("is_default", true).neq("id", modelId);
  }
  const fields = {
    ...(value.displayName !== undefined ? { display_name: value.displayName } : {}),
    ...(value.description !== undefined ? { description: value.description } : {}),
    ...(value.enabled !== undefined ? { enabled: value.enabled } : {}),
    ...(value.visibleToUsers !== undefined ? { visible_to_users: value.visibleToUsers } : {}),
    ...(value.isDefault !== undefined ? { is_default: value.isDefault } : {}),
    ...(value.contextWindow !== undefined ? { context_window: value.contextWindow } : {}),
    ...(value.maxOutputTokens !== undefined ? { max_output_tokens: value.maxOutputTokens } : {}),
    ...(value.maxMessageChars !== undefined ? { max_message_chars: value.maxMessageChars } : {}),
    ...(value.billingTier !== undefined ? { billing_tier: value.billingTier } : {}),
    ...(value.releaseStage !== undefined ? { release_stage: value.releaseStage } : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from("ai_models").update(fields).eq("id", modelId)
    .select("id,provider_id,model_key,display_name,enabled,visible_to_users,is_default,billing_tier,release_stage")
    .maybeSingle();
  if (error || !data) {
    return Response.json({ error: { code: "NOT_FOUND", message: "النموذج غير موجود." } }, { status: 404 });
  }
  await admin.from("audit_logs").insert({
    actor_user_id: user.id,
    action: "model.updated",
    resource_type: "ai_model",
    resource_id: modelId,
    metadata: { fields: Object.keys(value) },
  });
  return Response.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ modelId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("models.manage")) {
    return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { modelId } = await params;
  const admin = createAdminClient();
  const [{ count: conversations }, { count: runs }, { count: agents }] = await Promise.all([
    admin.from("conversations").select("id", { count: "exact", head: true }).eq("selected_model_id", modelId),
    admin.from("chat_runs").select("id", { count: "exact", head: true }).eq("model_id", modelId),
    admin.from("agents").select("id", { count: "exact", head: true }).eq("default_model_id", modelId),
  ]);
  if ((conversations ?? 0) > 0 || (runs ?? 0) > 0 || (agents ?? 0) > 0) {
    return Response.json({
      error: { code: "MODEL_IN_USE", message: "عطّل النموذج بدل حذفه لأنه مرتبط بمحادثات أو وكلاء." },
    }, { status: 409 });
  }
  const { error } = await admin.from("ai_models").delete().eq("id", modelId);
  if (error) return Response.json({ error: { code: "DELETE_FAILED" } }, { status: 500 });
  await admin.from("audit_logs").insert({
    actor_user_id: user.id,
    action: "model.deleted",
    resource_type: "ai_model",
    resource_id: modelId,
    metadata: {},
  });
  return new Response(null, { status: 204 });
}
