import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { secretCrypto } from "@/services/secret-crypto";

export const dynamic = "force-dynamic";
const inputSchema = z.object({ providerId: z.uuid(), secret: z.string().min(4).max(20_000) });
const deleteSchema = z.object({ providerId: z.uuid() });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { data, error } = await createAdminClient().from("user_api_keys")
    .select("id,provider_id,key_hint,status,last_used_at,created_at,updated_at,ai_providers(name,slug,enabled)")
    .eq("user_id", user.id).order("updated_at", { ascending: false });
  return error ? Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 }) : Response.json({ data });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  const admin = createAdminClient();
  const { data: provider } = await admin.from("ai_providers").select("id,name,enabled").eq("id", parsed.data.providerId).single();
  if (!provider || !provider.enabled) return Response.json({ error: { code: "PROVIDER_UNAVAILABLE" } }, { status: 409 });
  const { data: current } = await admin.from("user_api_keys").select("id").eq("user_id", user.id).eq("provider_id", provider.id).maybeSingle();
  const keyId = current?.id ?? crypto.randomUUID();
  const encrypted = await secretCrypto.encrypt(parsed.data.secret, {
    providerId: provider.id,
    userId: user.id,
    userApiKeyId: keyId,
  });
  const { data, error } = await admin.from("user_api_keys").upsert({
    id: keyId,
    user_id: user.id,
    provider_id: provider.id,
    encrypted_secret: encrypted,
    key_hint: `••••${parsed.data.secret.slice(-4)}`,
    status: "active",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider_id" }).select("id,provider_id,key_hint,status,updated_at").single();
  if (error) return Response.json({ error: { code: "CREDENTIAL_SAVE_FAILED" } }, { status: 500 });
  await admin.from("audit_logs").insert({
    actor_user_id: user.id,
    action: current ? "user_api_key.rotated" : "user_api_key.created",
    resource_type: "user_api_key",
    resource_id: keyId,
    metadata: { providerId: provider.id },
  });
  return Response.json({ data });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("user_api_keys").update({
    status: "revoked",
    updated_at: new Date().toISOString(),
  }).eq("user_id", user.id).eq("provider_id", parsed.data.providerId).select("id").maybeSingle();
  if (error || !data) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  await admin.from("audit_logs").insert({
    actor_user_id: user.id,
    action: "user_api_key.revoked",
    resource_type: "user_api_key",
    resource_id: data.id,
    metadata: { providerId: parsed.data.providerId },
  });
  return new Response(null, { status: 204 });
}
