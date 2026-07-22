import type { AIProviderAdapter } from "./types";
import { OpenAICompatibleAdapter } from "./openai-compatible-adapter";

export class ProviderRegistry {
  private readonly adapters = new Map<string, AIProviderAdapter>();
  register(adapter: AIProviderAdapter) { if (this.adapters.has(adapter.type)) throw new Error(`Adapter already registered: ${adapter.type}`); this.adapters.set(adapter.type, adapter); return this; }
  get(type: string) { const adapter = this.adapters.get(type); if (!adapter) throw new Error(`Unsupported provider adapter: ${type}`); return adapter; }
  supportedTypes() { return [...this.adapters.keys()]; }
}

export const providerRegistry = new ProviderRegistry().register(new OpenAICompatibleAdapter());
