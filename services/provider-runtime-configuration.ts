import type { z } from "zod";
import type { providerInputSchema } from "@/schemas/provider";
import type { ProviderConfiguration, ProviderCredential } from "@/providers/types";
import { assertSafeOutboundUrl } from "@/lib/security/provider-url";

type ProviderInput = z.infer<typeof providerInputSchema>;

export async function buildRuntimeProviderConfiguration(
  value: ProviderInput,
  id = "draft",
): Promise<ProviderConfiguration> {
  const authType = value.authType as ProviderCredential["authType"];
  const secret = value.credential?.secret ?? "";
  return {
    id,
    type: value.providerType,
    name: value.name,
    baseUrl: await assertSafeOutboundUrl(value.baseUrl),
    enabled: value.enabled,
    chatEndpoint: value.chatEndpoint,
    modelsEndpoint: value.modelsEndpoint,
    apiVersion: value.apiVersion,
    timeoutMs: value.timeoutMs,
    retryCount: value.retryCount,
    headers: value.configuration.headers,
    credential: {
      secret,
      authType,
      headerName: value.configuration.headerName ?? value.credential?.headerName,
      queryName: value.configuration.queryName ?? value.credential?.queryName,
      username: value.configuration.username ?? value.credential?.username,
      customHeaders: authType === "custom_headers" ? parseCustomHeaders(secret) : undefined,
    },
  };
}

function parseCustomHeaders(secret: string): Record<string, string> {
  const parsed = JSON.parse(secret) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
