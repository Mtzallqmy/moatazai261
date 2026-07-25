import { z } from "zod";
import { getCurrentUser, isOwner } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { McpClient } from "@/features/mcp/mcp-client";
import { secretCrypto } from "@/services/secret-crypto";

export const dynamic = "force-dynamic";

export async function POST(_: Request, context: { params: Promise<{ serverId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !await isOwner()) return Response.json({ error: { code: "OWNER_REQUIRED" } }, { status: 403 });
  const parsed = z.uuid().safeParse((await context.params).serverId);
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  const admin = createAdminClient();
  const { data: server, error } = await admin.from("mcp_servers")
    .select("id,transport,endpoint,auth_type,encrypted_secret,header_name,timeout_ms")
    .eq("id", parsed.data).single();
  if (error || !server || server.transport === "stdio" || !server.endpoint) return Response.json({ error: { code: "MCP_UNAVAILABLE" } }, { status: 409 });
  const secret = server.encrypted_secret ? await secretCrypto.decrypt(server.encrypted_secret, { mcpServerId: server.id }) : undefined;
  const headers = buildHeaders(server.auth_type, secret, server.header_name);
  const started = Date.now();
  try {
    const inspection = await new McpClient({
      transport: server.transport,
      endpoint: server.endpoint,
      headers,
      timeoutMs: server.timeout_ms,
    }).inspect();
    const latency = Date.now() - started;
    await Promise.all([
      admin.from("mcp_servers").update({ status: "healthy", last_checked_at: new Date().toISOString(), last_latency_ms: latency, last_error_code: null }).eq("id", server.id),
      admin.from("audit_logs").insert({ actor_user_id: user.id, action: "mcp_server.tested", resource_type: "mcp_server", resource_id: server.id, metadata: { ok: true, toolCount: inspection.tools.length, resourceCount: inspection.resources.length } }),
    ]);
    return Response.json({ data: { ok: true, latencyMs: latency, toolCount: inspection.tools.length, resourceCount: inspection.resources.length } });
  } catch {
    const latency = Date.now() - started;
    await admin.from("mcp_servers").update({ status: "unavailable", last_checked_at: new Date().toISOString(), last_latency_ms: latency, last_error_code: "CONNECTION_FAILED" }).eq("id", server.id);
    return Response.json({ error: { code: "MCP_CONNECTION_FAILED", message: "فشل اختبار الاتصال." }, data: { ok: false, latencyMs: latency } }, { status: 422 });
  }
}

function buildHeaders(authType: string, secret?: string, headerName?: string | null) {
  if (!secret || authType === "none") return {};
  if (authType === "bearer") return { Authorization: `Bearer ${secret}` };
  if (authType === "api_key_header") return { [headerName ?? "X-API-Key"]: secret };
  return JSON.parse(secret) as Record<string, string>;
}
