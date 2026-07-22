export type ChatRole = "system" | "user" | "assistant" | "tool";
export type ChatMessage = { role: ChatRole; content: string; name?: string; toolCallId?: string };
export type ModelCapabilities = { text: boolean; vision: boolean; audio: boolean; video: boolean; tools: boolean; jsonMode: boolean; streaming: boolean; contextWindow?: number };
export type ProviderConfiguration = { id: string; type: string; name: string; baseUrl?: string; apiKey?: string; defaultModel?: string; enabled: boolean; timeoutMs?: number; headers?: Record<string,string> };
export type ChatCompletionRequest = { model: string; messages: ChatMessage[]; temperature?: number; maxTokens?: number; stream?: boolean; metadata?: Record<string,string> };
export type UsageMetadata = { inputTokens?: number; outputTokens?: number; totalTokens?: number; providerRequestId?: string; latencyMs?: number };
export type ChatCompletionResponse = { id: string; model: string; content: string; finishReason?: string; usage?: UsageMetadata };
export type StreamingResponse = AsyncIterable<{ type: "delta" | "usage" | "done"; content?: string; usage?: UsageMetadata }>;

export class ProviderError extends Error {
  constructor(message: string, public readonly code: string, public readonly retryable = false, public readonly status?: number) { super(message); this.name = "ProviderError"; }
}

export interface AIProviderAdapter {
  readonly type: string;
  validateConfiguration(configuration: ProviderConfiguration): Promise<void>;
  listModels(configuration: ProviderConfiguration): Promise<Array<{ id: string; capabilities: ModelCapabilities }>>;
  complete(configuration: ProviderConfiguration, request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  stream(configuration: ProviderConfiguration, request: ChatCompletionRequest): StreamingResponse;
}
