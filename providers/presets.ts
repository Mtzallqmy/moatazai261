export type ProviderPreset = {
  type: "openai" | "openrouter" | "openai-compatible";
  label: string;
  name: string;
  baseUrl: string;
  chatEndpoint: string;
  modelsEndpoint: string;
  authType: "bearer" | "api_key_header" | "basic" | "custom_headers" | "none";
  headerName?: string;
  headers?: Record<string, string>;
};

export const providerPresets: Record<ProviderPreset["type"], ProviderPreset> = {
  openai: {
    type: "openai",
    label: "OpenAI",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    chatEndpoint: "/chat/completions",
    modelsEndpoint: "/models",
    authType: "bearer",
  },
  openrouter: {
    type: "openrouter",
    label: "OpenRouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    chatEndpoint: "/chat/completions",
    modelsEndpoint: "/models",
    authType: "bearer",
    headers: {
      "HTTP-Referer": "https://moatazalalqami.online",
      "X-Title": "Moataz AI",
    },
  },
  "openai-compatible": {
    type: "openai-compatible",
    label: "مزود متوافق مع OpenAI",
    name: "",
    baseUrl: "",
    chatEndpoint: "/chat/completions",
    modelsEndpoint: "/models",
    authType: "bearer",
  },
};

export function getProviderPreset(type: string): ProviderPreset {
  return providerPresets[type as ProviderPreset["type"]] ?? providerPresets["openai-compatible"];
}
