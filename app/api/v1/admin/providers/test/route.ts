import { getCurrentUser, hasCurrentPermission, isOwner } from "@/lib/auth/guards";
import { rateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { providerErrorResponse } from "@/providers/error-normalizer";
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
  try {
    const configuration = await buildRuntimeProviderConfiguration(parsed.data);
    const health = await runProviderDiagnostics(configuration, {
      requestId: crypto.randomUUID(),
      userId: user.id,
      signal: request.signal,
      timeoutMs: Math.min(parsed.data.timeoutMs, 30_000),
    }, parsed.data.testModel);
    return Response.json({ data: health }, { headers: { ...rateLimitHeaders(limit), "Cache-Control": "no-store" } });
  } catch (error) {
    return providerErrorResponse(error);
  }
}
