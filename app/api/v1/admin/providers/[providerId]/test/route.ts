import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasCurrentPermission } from "@/lib/auth/guards";
import { rateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { assertSafeProviderUrl } from "@/lib/security/provider-url";
import { providerErrorResponse, safeProviderError } from "@/providers/error-normalizer";
import type { ProviderConfiguration, ProviderCredential } from "@/providers/types";
import { providerUpdateSchema } from "@/schemas/provider";
import { loadProviderConfiguration, recordProviderHealth } from "@/services/provider-config-service";
import { runProviderDiagnostics } from "@/services/provider-test-service";

const testInput = z.object({
  model: z.string().trim().max(200).optional(),
  draft: providerUpdateSchema.optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ providerId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("providers.manage")) {
    return Response.json({ error: { code: "FORBIDDEN", message: "لا تملك صلاحية اختبار المزودات." } }, { status: 403 });
  }
  const parsed = testInput.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "معرّف نموذج الاختبار غير صالح." } }, { status: 422 });
  }
  const { providerId } = await params;
  const limit = await rateLimiter.consume(`provider-test:${user.id}:${providerId}`, { limit: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return Response.json({
      error: { code: "RATE_LIMITED", message: "تم تجاوز عدد اختبارات الاتصال المسموح." },
    }, { status: 429, headers: rateLimitHeaders(limit) });
  }

  const admin = createAdminClient();
  const { data: provider, error: providerError } = await admin.from("ai_providers")
    .select("*").eq("id", providerId).maybeSingle();
  if (providerError || !provider) {
    return Response.json({ error: { code: "NOT_FOUND", message: "المزود غير موجود." } }, { status: 404 });
  }
  const startedAt = Date.now();
  try {
    const storedConfiguration = await loadProviderConfiguration(provider);
    const configuration = parsed.data.draft
      ? await applyDraftConfiguration(storedConfiguration, parsed.data.draft)
      : storedConfiguration;
    const health = await runProviderDiagnostics(configuration, {
      requestId: crypto.randomUUID(),
      userId: user.id,
      signal: request.signal,
      timeoutMs: Math.min(provider.timeout_ms ?? 30_000, 30_000),
    }, parsed.data.model);
    await Promise.all([
      recordProviderHealth(providerId, health),
      admin.from("provider_connection_tests").insert({
        provider_id: providerId,
        tested_by: user.id,
        test_type: "connection",
        status: "success",
        http_status: 200,
        latency_ms: health.latencyMs,
        response_metadata: {
          checkedAt: health.checkedAt,
          modelCount: health.modelCount,
          testedModel: health.testedModel,
          requestId: health.requestId,
        },
      }),
      admin.from("audit_logs").insert({
        actor_user_id: user.id,
        action: "provider.connection_tested",
        resource_type: "ai_provider",
        resource_id: providerId,
        metadata: {
          ok: true,
          latencyMs: health.latencyMs,
          modelCount: health.modelCount,
          testedModel: health.testedModel,
        },
      }),
    ]);
    return Response.json({ data: health }, {
      headers: { ...rateLimitHeaders(limit), "Cache-Control": "no-store" },
    });
  } catch (cause) {
    const error = safeProviderError(cause);
    const latencyMs = Date.now() - startedAt;
    await Promise.all([
      recordProviderHealth(providerId, { ok: false, latencyMs, errorCode: error.code }).catch(() => undefined),
      admin.from("provider_connection_tests").insert({
        provider_id: providerId,
        tested_by: user.id,
        test_type: "connection",
        status: "failure",
        http_status: error.details?.httpStatus ?? error.status,
        latency_ms: latencyMs,
        error_code: error.code,
        response_metadata: {
          errorId: error.errorId,
          message: error.message,
          providerMessage: error.details?.providerMessage,
          requestId: error.details?.requestId,
          retryable: error.retryable,
        },
      }),
      admin.from("audit_logs").insert({
        actor_user_id: user.id,
        action: "provider.connection_tested",
        resource_type: "ai_provider",
        resource_id: providerId,
        metadata: { ok: false, latencyMs, errorCode: error.code, errorId: error.errorId },
      }),
    ]);
    return providerErrorResponse(cause);
  }
}

async function applyDraftConfiguration(
  stored: ProviderConfiguration,
  draft: z.infer<typeof providerUpdateSchema>,
): Promise<ProviderConfiguration> {
  const authType = (draft.authType ?? stored.credential?.authType ?? "bearer") as ProviderCredential["authType"];
  return {
    ...stored,
    type: draft.providerType ?? stored.type,
    name: draft.name ?? stored.name,
    baseUrl: draft.baseUrl ? assertSafeProviderUrl(draft.baseUrl) : stored.baseUrl,
    chatEndpoint: draft.chatEndpoint ?? stored.chatEndpoint,
    modelsEndpoint: draft.modelsEndpoint ?? stored.modelsEndpoint,
    apiVersion: draft.apiVersion ?? stored.apiVersion,
    timeoutMs: draft.timeoutMs ?? stored.timeoutMs,
    retryCount: draft.retryCount ?? stored.retryCount,
    headers: draft.configuration?.headers ?? stored.headers,
    credential: authType === "none"
      ? { secret: "", authType: "none" }
      : stored.credential
        ? {
          ...stored.credential,
          authType,
          headerName: draft.configuration?.headerName ?? stored.credential.headerName,
          queryName: draft.configuration?.queryName ?? stored.credential.queryName,
          username: draft.configuration?.username ?? stored.credential.username,
        }
        : undefined,
  };
}
