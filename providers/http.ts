import { ProviderError, type ProviderConfiguration, type ProviderRequestContext } from "./types";
import { assertSafeOutboundUrl } from "@/lib/security/provider-url";
import { buildProviderUrl } from "./url";

const retryableStatus = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const secretPattern = /(bearer\s+|sk-[a-z0-9_-]{8,}|api[_-]?key["'\s:=]+)[^\s"',}]+/gi;
export function buildUrl(baseUrl: string, endpoint: string) { return buildProviderUrl(baseUrl, endpoint); }
export function authHeaders(configuration: ProviderConfiguration) {
  const credential=configuration.credential;
  if (!credential || credential.authType === "none") return { ...configuration.headers };
  if (credential.authType === "api_key_header") return { ...configuration.headers, [credential.headerName ?? "x-api-key"]: credential.secret };
  if (credential.authType === "basic") return { ...configuration.headers, Authorization:`Basic ${btoa(`${credential.username ?? ""}:${credential.secret}`)}` };
  if (credential.authType === "custom_headers") return { ...configuration.headers, ...credential.customHeaders };
  if (credential.authType === "query") return { ...configuration.headers };
  return { ...configuration.headers, Authorization:`Bearer ${credential.secret}` };
}
export async function providerFetch(configuration: ProviderConfiguration, input: URL, init: RequestInit, context: ProviderRequestContext) {
  const outbound = new URL(input);
  if (configuration.credential?.authType === "query") {
    outbound.searchParams.set(configuration.credential.queryName ?? "key", configuration.credential.secret);
  }
  const safeInput = await assertSafeOutboundUrl(outbound.toString());
  const attempts=(configuration.retryCount ?? 2)+1;
  for(let attempt=1;attempt<=attempts;attempt++){
    const timeout=AbortSignal.timeout(context.timeoutMs ?? configuration.timeoutMs ?? 90_000);
    const signal=context.signal ? AbortSignal.any([context.signal,timeout]) : timeout;
    try {
      const response=await fetch(safeInput,{...init,redirect:"error",signal});
      if(response.ok || !retryableStatus.has(response.status) || attempt===attempts) return response;
    } catch(error) {
      if(context.signal?.aborted) throw new ProviderError("Request cancelled","ABORTED",false,499);
      const timedOut = timeout.aborted || error instanceof DOMException && error.name === "TimeoutError";
      if(attempt===attempts) throw new ProviderError(
        timedOut ? "انتهت مهلة اتصال المزود." : "تعذر الوصول إلى شبكة المزود.",
        timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        true,
        timedOut ? 504 : 502,
      );
    }
    await new Promise(resolve=>setTimeout(resolve,Math.min(250*2**(attempt-1),2000)+Math.random()*100));
  }
  throw new ProviderError("Provider unavailable","PROVIDER_UNAVAILABLE",true,503);
}
export function normalizedError(status:number, fallback="Provider request failed") {
  const message = redactProviderText(fallback);
  if(status===401) return new ProviderError("رفض المزود بيانات المصادقة.","AUTHENTICATION_FAILED",false,status,{providerMessage:message});
  if(status===403) return new ProviderError("لا يملك المفتاح صلاحية تنفيذ هذا الطلب.","PERMISSION_ERROR",false,status,{providerMessage:message});
  if(status===404) return new ProviderError("لم يعثر المزود على المسار أو النموذج المطلوب.","MODEL_NOT_FOUND",false,status,{providerMessage:message});
  if(status===429) return new ProviderError("تجاوز المفتاح حد الطلبات لدى المزود.","RATE_LIMITED",true,status,{providerMessage:message});
  if(status>=500) return new ProviderError("خدمة المزود غير متاحة حاليًا.","PROVIDER_UNAVAILABLE",true,status,{providerMessage:message});
  return new ProviderError(message || "رفض المزود الطلب.","INVALID_REQUEST",false,status);
}

export async function providerErrorFromResponse(response: Response, fallback = "Provider request failed") {
  const requestId = response.headers.get("x-request-id") ??
    response.headers.get("x-openai-request-id") ??
    response.headers.get("cf-ray") ?? undefined;
  const contentType = response.headers.get("content-type") ?? "";
  let providerMessage = fallback;
  try {
    if (contentType.includes("json")) {
      const body = await response.clone().json() as {
        error?: { message?: string; code?: string } | string;
        message?: string;
      };
      providerMessage = typeof body.error === "string"
        ? body.error
        : body.error?.message ?? body.message ?? fallback;
    } else {
      providerMessage = (await response.clone().text()).slice(0, 1_000) || fallback;
    }
  } catch {
    providerMessage = fallback;
  }
  const error = normalizedError(response.status, providerMessage);
  return new ProviderError(error.message, error.code, error.retryable, error.status, {
    ...error.safeDetails,
    requestId,
    httpStatus: response.status,
  });
}

export function redactProviderText(value: string) {
  return value.replace(secretPattern, "$1[REDACTED]").replace(/[\r\n\t]+/g, " ").slice(0, 1_000).trim();
}

export async function* parseSse(response:Response, map:(value:unknown)=>string | null):AsyncIterable<string>{
  if(!response.body) throw new ProviderError("Provider returned no stream","INVALID_RESPONSE");
  const reader=response.body.pipeThrough(new TextDecoderStream()).getReader(); let buffer="";
  try { while(true){const {value,done}=await reader.read();if(done)break;buffer+=value;const frames=buffer.split(/\r?\n\r?\n/);buffer=frames.pop()??"";for(const frame of frames){for(const line of frame.split(/\r?\n/)){if(!line.startsWith("data:"))continue;const raw=line.slice(5).trim();if(!raw || raw==="[DONE]")continue;try{const delta=map(JSON.parse(raw));if(delta)yield delta;}catch{/* malformed provider event is ignored; final validation still applies */}}}} } finally {reader.releaseLock();}
}
