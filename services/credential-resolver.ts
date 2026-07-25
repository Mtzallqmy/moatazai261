import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProviderCredential } from "@/providers/types";
import { secretCrypto } from "./secret-crypto";

export async function resolveProviderCredential(
  providerId: string,
  userId?: string,
  defaults?: Pick<ProviderCredential, "authType" | "headerName" | "queryName" | "username">,
): Promise<ProviderCredential> {
  const admin = createAdminClient();
  if (defaults?.authType === "none") {
    return { secret: "", source: "platform", authType: "none" };
  }
  if (userId) {
    const { data: personal, error } = await admin.from("user_api_keys")
      .select("id,user_id,provider_id,encrypted_secret,status")
      .eq("user_id", userId).eq("provider_id", providerId).eq("status", "active").maybeSingle();
    if (error) throw new Error("Personal credential lookup failed");
    if (personal) {
      const secret = await secretCrypto.decrypt(personal.encrypted_secret, {
        providerId,
        userId,
        userApiKeyId: personal.id,
      });
      await admin.from("user_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", personal.id);
      const customHeaders = defaults?.authType === "custom_headers"
        ? parseCustomHeaders(secret)
        : undefined;
      return {
        id: personal.id,
        secret,
        authType: defaults?.authType ?? "bearer",
        headerName: defaults?.headerName,
        queryName: defaults?.queryName,
        username: defaults?.username,
        customHeaders,
        source: "user",
      };
    }
  }

  const { data, error } = await admin.from("ai_provider_credentials")
    .select("id,encrypted_secret,auth_metadata,status,expires_at,usage_limit,usage_count")
    .eq("provider_id", providerId).eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("priority").limit(10);
  if (error) throw new Error("Credential lookup failed");
  const item = data?.find((credential) => credential.usage_limit == null || credential.usage_count < credential.usage_limit);
  if (!item) throw new Error("No active provider credential");
  const metadata = (item.auth_metadata ?? {}) as Record<string, unknown>;
  const secret = await secretCrypto.decrypt(item.encrypted_secret, { providerId, credentialId: item.id });
  return {
    id: item.id,
    secret,
    source: "platform",
    authType: typeof metadata.authType === "string" ? metadata.authType as ProviderCredential["authType"] : undefined,
    headerName: typeof metadata.headerName === "string" ? metadata.headerName : undefined,
    queryName: typeof metadata.queryName === "string" ? metadata.queryName : undefined,
    username: typeof metadata.username === "string" ? metadata.username : undefined,
    customHeaders: typeof metadata.customHeaders === "object" && metadata.customHeaders
      ? metadata.customHeaders as Record<string, string>
      : undefined,
  };
}

function parseCustomHeaders(secret: string) {
  try {
    const parsed = JSON.parse(secret) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const entries = Object.entries(parsed);
    if (!entries.length || entries.some(([key, value]) =>
      !/^[A-Za-z0-9-]{1,80}$/.test(key) || typeof value !== "string" || value.length > 8_000
    )) throw new Error();
    return Object.fromEntries(entries) as Record<string, string>;
  } catch {
    throw new Error("Custom header credential must be a JSON object of string values");
  }
}
