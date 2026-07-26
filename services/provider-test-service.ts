import { providerRegistry } from "@/providers/provider-registry";
import { ProviderError, type ProviderConfiguration, type ProviderHealth, type ProviderRequestContext } from "@/providers/types";

export async function runProviderDiagnostics(
  configuration: ProviderConfiguration,
  context: ProviderRequestContext,
  requestedModel?: string,
): Promise<ProviderHealth> {
  const startedAt = Date.now();
  const adapter = providerRegistry.get(configuration.type);
  await adapter.validateConfig(configuration);
  const models = await adapter.listModels(configuration, context);
  const testModel = requestedModel || configuration.defaultModel || models[0]?.id;
  if (!testModel) {
    throw new ProviderError(
      "تم الاتصال، لكن المزود لم يُرجع نماذج. أدخل معرّف نموذج للاختبار.",
      "MODEL_NOT_FOUND",
      false,
      422,
    );
  }
  const response = await adapter.chat(configuration, {
    model: testModel,
    messages: [{ role: "user", content: "Reply with OK only." }],
    temperature: 0,
    maxOutputTokens: 8,
  }, context);
  if (!response.content.trim()) {
    throw new ProviderError("نجح الاتصال لكن اختبار الرسالة أعاد استجابة فارغة.", "INVALID_RESPONSE", false, 502);
  }
  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    checkedAt: new Date().toISOString(),
    modelCount: models.length,
    testedModel: testModel,
    requestId: response.providerRequestId,
  };
}
