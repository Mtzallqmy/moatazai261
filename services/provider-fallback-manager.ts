import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { modelCapabilities, validateModelCapabilities } from "./model-capability-service";
import type { UnifiedContentPart } from "@/providers/types";

export type FallbackTarget = {
  id: string;
  provider_id: string;
  model_key: string;
  pricing_metadata: unknown;
  ai_providers: {
    id: string;
    name: string;
    provider_type: string;
    base_url: string | null;
    enabled: boolean;
    chat_endpoint?: string;
    models_endpoint?: string;
    embeddings_endpoint?: string;
    api_version?: string | null;
    timeout_ms?: number;
    retry_count?: number;
    configuration?: unknown;
  };
};

export async function resolveFallbackTarget(input: {
  fallbackProviderId?: string | null;
  modelAlias?: string | null;
  modelKey: string;
  contentParts: UnifiedContentPart[];
}): Promise<FallbackTarget | null> {
  if (!input.fallbackProviderId) return null;
  const admin = createAdminClient();
  let query = admin.from("ai_models")
    .select("id,provider_id,model_key,capabilities,pricing_metadata,ai_providers!inner(*)")
    .eq("provider_id", input.fallbackProviderId)
    .eq("enabled", true)
    .eq("visible_to_users", true)
    .eq("ai_providers.enabled", true);
  query = input.modelAlias
    ? query.or(`model_alias.eq.${input.modelAlias},model_key.eq.${input.modelKey}`)
    : query.eq("model_key", input.modelKey);
  const { data } = await query.order("fallback_priority").limit(1).maybeSingle();
  if (!data) return null;
  try {
    validateModelCapabilities(modelCapabilities(data.capabilities), input.contentParts);
  } catch {
    return null;
  }
  return data as unknown as FallbackTarget;
}
