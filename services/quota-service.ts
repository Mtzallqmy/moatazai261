import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProviderError } from "@/providers/types";

export async function reserveUsage(input: {
  userId: string;
  modelId: string;
  providerId: string;
  idempotencyKey: string;
  reservedTokens?: number;
  reservedCost?: number;
}) {
  const { data, error } = await createAdminClient().rpc("reserve_usage", {
    p_user_id: input.userId,
    p_model_id: input.modelId,
    p_provider_id: input.providerId,
    p_idempotency_key: input.idempotencyKey,
    p_reserved_tokens: input.reservedTokens ?? 0,
    p_reserved_cost: input.reservedCost ?? 0,
  });
  if (error) {
    if (error.message.includes("USAGE_LIMIT_REACHED")) {
      throw new ProviderError("Usage limit reached", "RATE_LIMITED", false, 429);
    }
    throw new ProviderError("Could not reserve usage", "PROVIDER_UNAVAILABLE", true, 503);
  }
  return String(data);
}

export async function finalizeUsage(
  reservationId: string,
  actualTokens: number,
  actualCost: number,
  release = false,
) {
  const { data, error } = await createAdminClient().rpc("finalize_usage_reservation", {
    p_reservation_id: reservationId,
    p_actual_tokens: Math.max(0, actualTokens),
    p_actual_cost: Math.max(0, actualCost),
    p_release: release,
  });
  if (error) throw new Error("Could not finalize usage reservation");
  return Boolean(data);
}
