import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasCurrentPermission } from "@/lib/auth/guards";
import { assertSafeProviderUrl } from "@/lib/security/provider-url";
import { providerUpdateSchema } from "@/schemas/provider";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ providerId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("providers.manage")) {
    return Response.json({ error: { code: "FORBIDDEN", message: "لا تملك صلاحية إدارة المزودات." } }, { status: 403 });
  }
  const parsed = providerUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({
      error: {
        code: "VALIDATION_ERROR",
        message: "بيانات تحديث المزود غير صالحة.",
        details: parsed.error.flatten().fieldErrors,
      },
    }, { status: 422 });
  }
  const { providerId } = await params;
  const admin = createAdminClient();
  const { data: current } = await admin.from("ai_providers")
    .select("id,auth_type,enabled,updated_at").eq("id", providerId).maybeSingle();
  if (!current) {
    return Response.json({ error: { code: "NOT_FOUND", message: "المزود غير موجود." } }, { status: 404 });
  }
  const value = parsed.data;

  if (value.enabled === true) {
    const authType = value.authType ?? current.auth_type;
    const [{ data: credential }, { data: successfulTest }] = await Promise.all([
      admin.from("ai_provider_credentials").select("id")
        .eq("provider_id", providerId).eq("status", "active").limit(1).maybeSingle(),
      admin.from("provider_connection_tests").select("id,created_at")
        .eq("provider_id", providerId).eq("status", "success")
        .gte("created_at", current.updated_at).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (authType !== "none" && !credential) {
      return Response.json({
        error: { code: "CREDENTIAL_REQUIRED", message: "أضف مفتاحًا فعالًا قبل تفعيل المزود." },
      }, { status: 409 });
    }
    if (!successfulTest) {
      return Response.json({
        error: { code: "SUCCESSFUL_TEST_REQUIRED", message: "نفّذ اختبار اتصال ناجح بعد آخر تعديل قبل التفعيل." },
      }, { status: 409 });
    }
  }

  try {
    const structuralChange = [
      "baseUrl", "authType", "chatEndpoint", "modelsEndpoint", "apiVersion", "configuration",
    ].some((field) => field in value);
    const fields = {
      ...(value.name !== undefined ? { name: value.name } : {}),
      ...(value.providerType !== undefined ? { provider_type: value.providerType } : {}),
      ...(value.baseUrl !== undefined ? { base_url: assertSafeProviderUrl(value.baseUrl) } : {}),
      ...(value.authType !== undefined ? { auth_type: value.authType } : {}),
      ...(value.chatEndpoint !== undefined ? { chat_endpoint: value.chatEndpoint } : {}),
      ...(value.modelsEndpoint !== undefined ? { models_endpoint: value.modelsEndpoint } : {}),
      ...(value.apiVersion !== undefined ? { api_version: value.apiVersion || null } : {}),
      ...(value.timeoutMs !== undefined ? { timeout_ms: value.timeoutMs } : {}),
      ...(value.retryCount !== undefined ? { retry_count: value.retryCount } : {}),
      ...(value.priority !== undefined ? { priority: value.priority } : {}),
      ...(value.configuration !== undefined ? { configuration: value.configuration } : {}),
      ...(value.enabled !== undefined ? { enabled: value.enabled } : {}),
      ...(structuralChange ? {
        enabled: false,
        health_status: "unknown",
        last_error_code: null,
        consecutive_failures: 0,
        circuit_state: "closed",
      } : {}),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from("ai_providers").update(fields)
      .eq("id", providerId)
      .select("id,name,slug,provider_type,base_url,enabled,auth_type,chat_endpoint,models_endpoint,health_status,updated_at")
      .maybeSingle();
    if (error || !data) {
      return Response.json({
        error: {
          code: error?.code === "23505" ? "PROVIDER_ALREADY_EXISTS" : "PROVIDER_UPDATE_FAILED",
          message: error?.code === "23505" ? "اسم المعرّف مستخدم بالفعل." : "تعذر تحديث المزود.",
          details: { databaseCode: error?.code },
        },
      }, { status: error?.code === "23505" ? 409 : 500 });
    }
    await admin.from("audit_logs").insert({
      actor_user_id: user.id,
      action: value.enabled === true ? "provider.enabled" : value.enabled === false ? "provider.disabled" : "provider.updated",
      resource_type: "ai_provider",
      resource_id: providerId,
      metadata: { fields: Object.keys(value), structuralChange },
    });
    return Response.json({ data });
  } catch (error) {
    return Response.json({
      error: {
        code: "PROVIDER_VALIDATION_FAILED",
        message: error instanceof Error ? error.message : "رابط المزود غير آمن أو غير صالح.",
      },
    }, { status: 422 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ providerId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("providers.manage")) {
    return Response.json({ error: { code: "FORBIDDEN", message: "لا تملك صلاحية حذف المزودات." } }, { status: 403 });
  }
  const { providerId } = await params;
  const admin = createAdminClient();
  const [{ count: models }, { count: runs }] = await Promise.all([
    admin.from("ai_models").select("id", { count: "exact", head: true }).eq("provider_id", providerId),
    admin.from("chat_runs").select("id", { count: "exact", head: true }).eq("provider_id", providerId),
  ]);
  if ((models ?? 0) > 0 || (runs ?? 0) > 0) {
    return Response.json({
      error: {
        code: "PROVIDER_IN_USE",
        message: "المزود مرتبط بنماذج أو سجلات تشغيل؛ عطّله بدل حذفه للحفاظ على سلامة البيانات.",
      },
    }, { status: 409 });
  }
  const { data, error } = await admin.from("ai_providers").delete()
    .eq("id", providerId).select("id,name").maybeSingle();
  if (error || !data) {
    return Response.json({
      error: { code: "DELETE_FAILED", message: "تعذر حذف المزود أو أنه غير موجود." },
    }, { status: error ? 500 : 404 });
  }
  await admin.from("audit_logs").insert({
    actor_user_id: user.id,
    action: "provider.deleted",
    resource_type: "ai_provider",
    resource_id: providerId,
    metadata: { name: data.name },
  });
  return new Response(null, { status: 204 });
}
