import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { providerRegistry } from "@/providers/provider-registry";
import { ProviderError } from "@/providers/types";
import { loadProviderConfiguration } from "@/services/provider-config-service";

type EmbeddingModelRow = {
  id: string;
  model_key: string;
  capabilities: unknown;
  ai_providers: {
    id: string;
    name: string;
    provider_type: string;
    base_url: string | null;
    enabled: boolean;
    embeddings_endpoint?: string;
    configuration?: unknown;
  };
};

export class EmbeddingService {
  async embed(modelId: string, inputs: string[], dimensions = 1536, userId?: string) {
    if (!inputs.length || inputs.length > 128) throw new Error("Embedding batch size must be between 1 and 128");
    const { data, error } = await createAdminClient().from("ai_models")
      .select("id,model_key,capabilities,ai_providers!inner(*)")
      .eq("id", modelId).eq("enabled", true).single();
    if (error || !data) throw new ProviderError("Embedding model is unavailable", "MODEL_UNAVAILABLE", false, 404);
    const model = data as unknown as EmbeddingModelRow;
    const capabilities = (model.capabilities ?? {}) as Record<string, unknown>;
    if (!capabilities.embeddings) throw new ProviderError("Model does not support embeddings", "CAPABILITY_UNSUPPORTED", false, 422);
    const configuration = await loadProviderConfiguration(model.ai_providers,userId);
    const adapter = providerRegistry.get(configuration.type);
    if (!adapter.embed) throw new ProviderError("Provider adapter does not implement embeddings", "CAPABILITY_UNSUPPORTED", false, 422);
    return adapter.embed(configuration, { model: model.model_key, inputs, dimensions }, {
      requestId: crypto.randomUUID(),
      timeoutMs: 60_000,
    });
  }
}

export const embeddingService = new EmbeddingService();
