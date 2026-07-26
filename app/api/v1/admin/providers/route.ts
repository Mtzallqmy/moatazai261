import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasCurrentPermission, isOwner } from "@/lib/auth/guards";
import { providerInputSchema } from "@/schemas/provider";
import { buildRuntimeProviderConfiguration } from "@/services/provider-runtime-configuration";
import { secretCrypto } from "@/services/secret-crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await hasCurrentPermission("providers.read")) {
    return Response.json({ error: { code: "FORBIDDEN", message: "لا تملك صلاحية عرض المزودات." } }, { status: 403 });
  }
  const { data, error } = await createAdminClient().from("ai_providers").select(`
    id,name,slug,provider_type,base_url,enabled,auth_type,chat_endpoint,models_endpoint,
    api_version,timeout_ms,retry_count,priority,configuration,health_status,
    last_health_check_at,last_latency_ms,last_error_code,created_at,updated_at,
    ai_provider_credentials(
      id,key_hint,status,priority,is_default,usage_limit,usage_count,
      expires_at,last_used_at,created_at
    ),
    provider_connection_tests(
      id,test_type,status,http_status,latency_ms,error_code,response_metadata,created_at
    )
  `).order("priority").order("created_at", { referencedTable: "provider_connection_tests", ascending: false })
    .limit(5, { referencedTable: "provider_connection_tests" });
  if (error) {
    return Response.json({
      error: { code: "DATABASE_ERROR", message: "تعذر تحميل بيانات المزودات.", details: { databaseCode: error.code } },
    }, { status: 500 });
  }
  return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("providers.manage")) {
    return Response.json({ error: { code: "FORBIDDEN", message: "لا تملك صلاحية إدارة المزودات." } }, { status: 403 });
  }
  const parsed = providerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({
      error: {
        code: "VALIDATION_ERROR",
        message: "راجع الحقول المطلوبة وإعدادات الاتصال.",
        details: parsed.error.flatten().fieldErrors,
      },
    }, { status: 422 });
  }
  if (parsed.data.credential && !await isOwner()) {
    return Response.json({
      error: { code: "OWNER_REQUIRED", message: "إدارة المفاتيح المركزية متاحة للمالك فقط." },
    }, { status: 403 });
  }

  try {
    const value = parsed.data;
    const runtime = await buildRuntimeProviderConfiguration(value);
    const providerId = crypto.randomUUID();
    const credentialId = value.credential ? crypto.randomUUID() : undefined;
    const encrypted = value.credential && credentialId
      ? await secretCrypto.encrypt(value.credential.secret, { providerId, credentialId })
      : undefined;
    const credential = value.credential && credentialId && encrypted ? {
      id: credentialId,
      encrypted_secret: encrypted,
      key_hint: maskSecret(value.credential.secret),
      priority: value.credential.priority,
      usage_limit: value.credential.usageLimit ?? null,
      expires_at: value.credential.expiresAt ?? null,
      is_default: value.credential.isDefault,
      auth_metadata: {
        authType: value.authType,
        headerName: value.configuration.headerName ?? value.credential.headerName,
        queryName: value.configuration.queryName ?? value.credential.queryName,
        username: value.configuration.username ?? value.credential.username,
      },
    } : null;

    const admin = createAdminClient();
    const { data: createdId, error } = await admin.rpc("create_ai_provider_atomic", {
      p_provider: {
        id: providerId,
        name: value.name,
        slug: value.slug,
        provider_type: value.providerType,
        base_url: runtime.baseUrl,
        enabled: false,
        auth_type: value.authType,
        chat_endpoint: value.chatEndpoint,
        models_endpoint: value.modelsEndpoint,
        api_version: value.apiVersion ?? null,
        timeout_ms: value.timeoutMs,
        retry_count: value.retryCount,
        priority: value.priority,
        configuration: value.configuration,
      },
      p_credential: credential,
      p_actor_id: user.id,
    });
    if (error || !createdId) {
      const duplicate = error?.code === "23505";
      return Response.json({
        error: {
          code: duplicate ? "PROVIDER_ALREADY_EXISTS" : "PROVIDER_CREATE_FAILED",
          message: duplicate ? "اسم المعرّف مستخدم لمزود آخر." : "تعذر حفظ المزود في قاعدة البيانات.",
          details: { databaseCode: error?.code },
        },
      }, { status: duplicate ? 409 : 500 });
    }

    const { data: provider } = await admin.from("ai_providers")
      .select("id,name,slug,provider_type,base_url,enabled,auth_type,chat_endpoint,models_endpoint,health_status")
      .eq("id", createdId).single();
    await admin.from("audit_logs").insert({
      actor_user_id: user.id,
      action: "provider.created",
      resource_type: "ai_provider",
      resource_id: createdId,
      metadata: { providerType: value.providerType, hasCredential: Boolean(credential) },
    });
    return Response.json({ data: provider }, { status: 201 });
  } catch (error) {
    return Response.json({
      error: {
        code: "PROVIDER_VALIDATION_FAILED",
        message: error instanceof Error ? error.message : "إعدادات المزود غير صالحة.",
      },
    }, { status: 422 });
  }
}

function maskSecret(secret: string) {
  return `••••${secret.slice(-4)}`;
}
