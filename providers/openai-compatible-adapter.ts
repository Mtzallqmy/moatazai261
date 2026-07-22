import type { AIProviderAdapter, ChatCompletionRequest, ChatCompletionResponse, ModelCapabilities, ProviderConfiguration, StreamingResponse } from "./types";
import { ProviderError } from "./types";

const textCapabilities: ModelCapabilities = { text:true, vision:false, audio:false, video:false, tools:true, jsonMode:true, streaming:true };

export class OpenAICompatibleAdapter implements AIProviderAdapter {
  readonly type = "openai-compatible";
  async validateConfiguration(configuration: ProviderConfiguration) {
    if (!configuration.baseUrl || !configuration.apiKey) throw new ProviderError("Provider URL and API key are required", "INVALID_CONFIGURATION");
    new URL(configuration.baseUrl);
  }
  async listModels(configuration: ProviderConfiguration) {
    await this.validateConfiguration(configuration);
    const response = await fetch(new URL("models", configuration.baseUrl!.endsWith("/") ? configuration.baseUrl : `${configuration.baseUrl}/`), { headers:{ Authorization:`Bearer ${configuration.apiKey}`, ...configuration.headers }, signal:AbortSignal.timeout(configuration.timeoutMs ?? 20_000) });
    if (!response.ok) throw new ProviderError("Provider model discovery failed", "MODEL_DISCOVERY_FAILED", response.status >= 500, response.status);
    const body = await response.json() as { data?: Array<{ id:string }> };
    return (body.data ?? []).map(({id})=>({ id, capabilities:textCapabilities }));
  }
  async complete(configuration: ProviderConfiguration, request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    await this.validateConfiguration(configuration);
    const started = Date.now();
    const response = await fetch(new URL("chat/completions", configuration.baseUrl!.endsWith("/") ? configuration.baseUrl : `${configuration.baseUrl}/`), { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${configuration.apiKey}`, ...configuration.headers }, body:JSON.stringify({...request, max_tokens:request.maxTokens, stream:false}), signal:AbortSignal.timeout(configuration.timeoutMs ?? 90_000) });
    const body = await response.json().catch(()=>null) as { id?:string; model?:string; choices?:Array<{message?:{content?:string};finish_reason?:string}>; usage?:{prompt_tokens?:number;completion_tokens?:number;total_tokens?:number}; error?:{message?:string} } | null;
    if (!response.ok) throw new ProviderError(body?.error?.message ?? "Provider request failed", "PROVIDER_REQUEST_FAILED", response.status >= 500 || response.status === 429, response.status);
    return { id:body?.id ?? crypto.randomUUID(), model:body?.model ?? request.model, content:body?.choices?.[0]?.message?.content ?? "", finishReason:body?.choices?.[0]?.finish_reason, usage:{ inputTokens:body?.usage?.prompt_tokens, outputTokens:body?.usage?.completion_tokens, totalTokens:body?.usage?.total_tokens, latencyMs:Date.now()-started } };
  }
  async *stream(configuration: ProviderConfiguration, request: ChatCompletionRequest): StreamingResponse {
    const response = await this.complete(configuration, {...request, stream:false});
    yield { type:"delta", content:response.content };
    if (response.usage) yield { type:"usage", usage:response.usage };
    yield { type:"done" };
  }
}
