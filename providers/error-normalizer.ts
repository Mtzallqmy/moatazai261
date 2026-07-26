import { ProviderError, type ProviderErrorCode } from "./types";
import { redactProviderText } from "./http";

export type SafeProviderError = {
  code: ProviderErrorCode;
  message: string;
  status: number;
  retryable: boolean;
  errorId: string;
  details?: {
    httpStatus?: number;
    requestId?: string;
    providerMessage?: string;
  };
};

export function normalizeProviderException(cause: unknown): ProviderError {
  if (cause instanceof ProviderError) return cause;
  if (cause instanceof DOMException && cause.name === "AbortError") {
    return new ProviderError("تم إلغاء الطلب.", "ABORTED", false, 499);
  }
  return new ProviderError("حدث خطأ داخلي أثناء الاتصال بالمزود.", "UNKNOWN", false, 500);
}

export function safeProviderError(cause: unknown): SafeProviderError {
  const error = normalizeProviderException(cause);
  const details = error.safeDetails ?? {};
  return {
    code: error.code,
    message: redactProviderText(error.message),
    status: error.status,
    retryable: error.retryable,
    errorId: error.errorId,
    details: {
      httpStatus: typeof details.httpStatus === "number" ? details.httpStatus : undefined,
      requestId: typeof details.requestId === "string" ? redactProviderText(details.requestId) : undefined,
      providerMessage: typeof details.providerMessage === "string"
        ? redactProviderText(details.providerMessage)
        : undefined,
    },
  };
}

export function providerErrorResponse(cause: unknown, statusOverride?: number) {
  const error = safeProviderError(cause);
  return Response.json(
    { error },
    {
      status: statusOverride ?? normalizeHttpStatus(error.status),
      headers: { "Cache-Control": "no-store", "X-Error-ID": error.errorId },
    },
  );
}

function normalizeHttpStatus(status: number) {
  return status >= 400 && status <= 599 ? status : 502;
}
