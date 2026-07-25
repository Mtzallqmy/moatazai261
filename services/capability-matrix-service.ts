import { ProviderError, type ModelCapabilities } from "@/providers/types";

export type RequestedCapabilities = Partial<Record<
  "streaming" | "tools" | "vision" | "audio" | "structuredOutput" | "embeddings",
  boolean
>>;

export function assertCapabilities(
  capabilities: ModelCapabilities,
  requested: RequestedCapabilities,
) {
  const missing = Object.entries(requested)
    .filter(([, required]) => required)
    .map(([key]) => key as keyof RequestedCapabilities)
    .filter((key) => !capabilities[key]);
  if (missing.length) {
    throw new ProviderError(
      `Model does not support: ${missing.join(", ")}`,
      "CAPABILITY_UNSUPPORTED",
      false,
      422,
      { missing },
    );
  }
}

export function capabilityMatrix(capabilities: ModelCapabilities) {
  return {
    streaming: capabilities.streaming,
    toolCalling: capabilities.tools,
    vision: capabilities.vision,
    audio: capabilities.audio,
    structuredOutputs: capabilities.structuredOutput,
    embeddings: capabilities.embeddings,
    largeContext: (capabilities.contextWindow ?? 0) >= 100_000,
    jsonMode: capabilities.jsonMode ?? capabilities.structuredOutput,
    responsesApi: capabilities.responsesApi ?? false,
    imageGeneration: capabilities.imageGeneration ?? false,
    transcription: capabilities.transcription ?? false,
    textToSpeech: capabilities.speech ?? false,
    reranking: capabilities.reranking ?? false,
  };
}
