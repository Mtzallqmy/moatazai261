import { z } from "zod";
import { normalizeProviderBaseUrl, normalizeProviderEndpoint } from "@/providers/url";

export const providerTypes = z.enum([
  "openai", "anthropic", "google-gemini", "openrouter", "groq", "mistral",
  "cohere", "deepseek", "xai", "azure-openai", "amazon-bedrock", "ollama",
  "openai-compatible",
]);
export const providerAuthTypes = z.enum([
  "bearer", "api_key_header", "query", "basic", "custom_headers",
  "oauth_client_credentials", "none",
]);

const safeHeaderName = z.string().trim().regex(/^[A-Za-z0-9-]{1,80}$/);
const safeHeaders = z.record(safeHeaderName, z.string().max(8_000)).superRefine((headers, context) => {
  for (const name of Object.keys(headers)) {
    if (/^(authorization|cookie|set-cookie|proxy-authorization)$/i.test(name)) {
      context.addIssue({ code: "custom", message: `لا يُسمح بحفظ ${name} ضمن الرؤوس العامة.` });
    }
  }
});
const endpoint = (fallback: string) => z.string().trim().max(200)
  .transform((value, context) => {
    try {
      return normalizeProviderEndpoint(value, fallback);
    } catch (error) {
      context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "مسار غير صالح." });
      return z.NEVER;
    }
  });
const baseUrl = z.url().transform((value, context) => {
  try {
    return normalizeProviderBaseUrl(value);
  } catch {
    context.addIssue({ code: "custom", message: "رابط المزود الأساسي غير صالح." });
    return z.NEVER;
  }
});

export const providerCredentialInputSchema = z.object({
  secret: z.string().trim().min(4).max(20_000),
  headerName: safeHeaderName.optional(),
  queryName: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,80}$/).optional(),
  username: z.string().trim().max(200).optional(),
  priority: z.number().int().min(0).max(10_000).default(100),
  usageLimit: z.number().int().positive().optional(),
  expiresAt: z.iso.datetime().optional(),
  isDefault: z.boolean().default(true),
  authType: providerAuthTypes.optional(),
});

export const providerCredentialUpdateSchema = z.object({
  credentialId: z.uuid(),
  secret: z.string().trim().min(4).max(20_000).optional(),
  priority: z.number().int().min(0).max(10_000).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  isDefault: z.boolean().optional(),
}).refine((value) =>
  value.secret !== undefined || value.priority !== undefined ||
  value.status !== undefined || value.isDefault !== undefined,
  { message: "لا يوجد تغيير مطلوب." },
);

const providerInputBaseSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  providerType: providerTypes,
  baseUrl,
  authType: providerAuthTypes.default("bearer"),
  chatEndpoint: endpoint("/chat/completions").default("/chat/completions"),
  modelsEndpoint: endpoint("/models").default("/models"),
  apiVersion: z.string().trim().max(50).optional(),
  timeoutMs: z.number().int().min(1_000).max(120_000).default(30_000),
  retryCount: z.number().int().min(0).max(3).default(1),
  priority: z.number().int().min(0).max(10_000).default(100),
  enabled: z.boolean().default(false),
  configuration: z.object({
    headers: safeHeaders.optional(),
    headerName: safeHeaderName.optional(),
    queryName: z.string().trim().regex(/^[A-Za-z0-9_.-]{1,80}$/).optional(),
    username: z.string().trim().max(200).optional(),
  }).strict().default({}),
  credential: providerCredentialInputSchema.omit({ authType: true }).optional(),
});

function validateProviderAuthentication(
  value: z.infer<typeof providerInputBaseSchema>,
  context: z.RefinementCtx,
) {
  if (value.authType === "oauth_client_credentials") {
    context.addIssue({ code: "custom", path: ["authType"], message: "OAuth Client Credentials غير مفعّل لهذا المسار." });
  }
  if (value.authType === "basic" && !value.configuration.username) {
    context.addIssue({ code: "custom", path: ["configuration", "username"], message: "اسم المستخدم مطلوب للمصادقة Basic." });
  }
  if (value.authType === "custom_headers" && value.credential) {
    try {
      const parsed = JSON.parse(value.credential.secret) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      safeHeaders.parse(parsed);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["credential", "secret"],
        message: "أدخل الرؤوس السرية بصيغة JSON صحيحة، مثل {\"X-API-Key\":\"...\"}.",
      });
    }
  }
  if (value.authType === "none" && value.credential) {
    context.addIssue({ code: "custom", path: ["credential"], message: "لا يلزم مفتاح عند اختيار بدون مصادقة." });
  }
}

export const providerInputSchema = providerInputBaseSchema.superRefine(validateProviderAuthentication);

export const providerUpdateSchema = providerInputBaseSchema.omit({ slug: true, credential: true })
  .partial()
  .extend({ enabled: z.boolean().optional() })
  .superRefine((value, context) => {
    if (value.authType === "oauth_client_credentials") {
      context.addIssue({ code: "custom", path: ["authType"], message: "OAuth Client Credentials غير مفعّل لهذا المسار." });
    }
    if (value.authType === "basic" && !value.configuration?.username) {
      context.addIssue({ code: "custom", path: ["configuration", "username"], message: "اسم المستخدم مطلوب للمصادقة Basic." });
    }
  })
  .refine((value) => Object.keys(value).length > 0, { message: "لا يوجد تغيير مطلوب." });

export const providerDraftTestSchema = providerInputBaseSchema.extend({
  testModel: z.string().trim().max(200).optional(),
}).superRefine(validateProviderAuthentication);
export const modelInputSchema=z.object({providerId:z.uuid(),modelKey:z.string().trim().min(1).max(200),modelAlias:z.string().regex(/^[a-z0-9][a-z0-9._-]{1,100}$/).optional(),displayName:z.string().trim().min(1).max(120),description:z.string().max(1000).optional(),enabled:z.boolean().default(false),visibleToUsers:z.boolean().default(true),isDefault:z.boolean().default(false),contextWindow:z.number().int().positive().optional(),maxOutputTokens:z.number().int().positive().optional(),maxMessageChars:z.number().int().positive().default(100000),inputModalities:z.array(z.enum(["text","image","audio","video","document"])).min(1),outputModalities:z.array(z.enum(["text","image","audio"])).min(1),capabilities:z.object({streaming:z.boolean(),tools:z.boolean(),vision:z.boolean(),audio:z.boolean(),video:z.boolean(),documents:z.boolean(),embeddings:z.boolean(),structuredOutput:z.boolean(),responsesApi:z.boolean().optional(),jsonMode:z.boolean().optional(),imageGeneration:z.boolean().optional(),transcription:z.boolean().optional(),speech:z.boolean().optional(),reranking:z.boolean().optional()}),pricingMetadata:z.record(z.string(),z.number().nonnegative()).default({}),billingTier:z.enum(["free","paid","premium"]).default("paid"),releaseStage:z.enum(["stable","beta"]).default("stable")});
export const modelUpdateSchema=z.object({
  displayName:z.string().trim().min(1).max(120).optional(),
  description:z.string().max(1000).nullable().optional(),
  enabled:z.boolean().optional(),
  visibleToUsers:z.boolean().optional(),
  isDefault:z.boolean().optional(),
  contextWindow:z.number().int().positive().nullable().optional(),
  maxOutputTokens:z.number().int().positive().nullable().optional(),
  maxMessageChars:z.number().int().positive().optional(),
  billingTier:z.enum(["free","paid","premium"]).optional(),
  releaseStage:z.enum(["stable","beta"]).optional(),
}).refine(value=>Object.keys(value).length>0);
