import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasCurrentPermission, isOwner } from "@/lib/auth/guards";
import { rateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { providerErrorResponse, safeProviderError } from "@/providers/error-normalizer";
import { providerDraftTestSchema } from "@/schemas/provider";
import { buildRuntimeProviderConfiguration } from "@/services/provider-runtime-configuration";
import { runProviderDiagnostics } from "@/services/provider-test-service";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("providers.manage")) {
    return Response.json({ error: { code: "FORBIDDEN", message: "لا تملك صلاحية اختبار المزودات." } }, { status: 403 });
  }
  const limit = await rateLimiter.consume(`provider-draft-test:${user.id}`, { limit: 10, windowMs: 60_000 });
  if (!limit.allowed) {
    return Response.json({
      error: { code: "RATE_LIMITED", message: "تم تجاوز عدد اختبارات الاتصال المسموح. حاول بعد قليل." },
    }, { status: 429, headers: rateLimitHeaders(limit) });
  }
  const parsed = providerDraftTestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({
      error: {
        code: "VALIDATION_ERROR",
        message: "لا يمكن الاختبار قبل تصحيح إعدادات المزود.",
        details: parsed.error.flatten().fieldErrors,
      },
    }, { status: 422, headers: rateLimitHeaders(limit) });
  }
  if (parsed.data.credential && !await isOwner()) {
    return Response.json({
      error: { code: "OWNER_REQUIRED", message: "اختبار مفتاح مركزي متاح للمالك فقط." },
    }, { status: 403, headers: rateLimitHeaders(limit) });
  }
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const hostname = new URL(parsed.data.baseUrl).hostname;
  try {
    const configuration = await buildRuntimeProviderConfiguration(parsed.data);
    const health = await runProviderDiagnostics(configuration, {
      requestId,
      userId: user.id,
      signal: request.signal,
      timeoutMs: Math.min(parsed.data.timeoutMs, 30_000),
    }, parsed.data.testModel);
    await createAdminClient().from("audit_logs").insert({
      actor_user_id: user.id,
      action: "provider.draft_connection_tested",
      resource_type: "ai_provider_draft",
      metadata: {
        ok: true,
        providerType: parsed.data.providerType,
        hostname,
        latencyMs: health.latencyMs,
        modelCount: health.modelCount,
        testedModel: health.testedModel,
      },
    });
    return Response.json({ data: health }, { headers: { ...rateLimitHeaders(limit), "Cache-Control": "no-store" } });
  } catch (cause) {
    const error = safeProviderError(cause);
    await createAdminClient().from("audit_logs").insert({
      actor_user_id: user.id,
      action: "provider.draft_connection_tested",
      resource_type: "ai_provider_draft",
      metadata: {
        ok: false,
        providerType: parsed.data.providerType,
        hostname,
        latencyMs: Date.now() - startedAt,
        errorCode: error.code,
        errorId: error.errorId,
        httpStatus: error.details?.httpStatus ?? error.status,
      },
    });
    return providerErrorResponse(cause);
  }
}
