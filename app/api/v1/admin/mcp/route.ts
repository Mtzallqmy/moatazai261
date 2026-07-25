import { getCurrentUser, hasCurrentPermission, isOwner } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSafeProviderUrl } from "@/lib/security/provider-url";
import { secretCrypto } from "@/services/secret-crypto";
import { McpClient } from "@/features/mcp/mcp-client";
import { mcpServerInputSchema } from "@/features/mcp/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await hasCurrentPermission("mcp.manage")) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const { data, error } = await createAdminClient().from("mcp_servers")
    .select("id,name,description,transport,endpoint,auth_type,key_hint,header_name,enabled,timeout_ms,status,last_checked_at,last_latency_ms,last_error_code,created_at,updated_at,mcp_tools(id,remote_name,description,input_schema,enabled),mcp_resources(id,uri,name,description,mime_type,enabled)")
    .order("updated_at", { ascending: false });
  return error ? Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 }) : Response.json({ data });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !await isOwner()) return Response.json({ error: { code: "OWNER_REQUIRED" } }, { status: 403 });
  const parsed = mcpServerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } }, { status: 422 });
  const input = parsed.data;
  if (input.transport === "stdio") return Response.json({ error: { code: "UNSUPPORTED_RUNTIME", message: "stdio يحتاج عاملًا خاصًا ولا يعمل داخل الاستضافة serverless." } }, { status: 422 });
  if (!input.endpoint) return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  try {
    const endpoint = assertSafeProviderUrl(input.endpoint);
    const headers = authHeaders(input.authType, input.secret, input.headerName);
    const started = Date.now();
    const inspection = await new McpClient({ transport: input.transport, endpoint, headers, timeoutMs: input.timeoutMs }).inspect();
    const admin = createAdminClient();
    const serverId = crypto.randomUUID();
    const encrypted = input.secret ? await secretCrypto.encrypt(input.secret, { mcpServerId: serverId }) : null;
    const { data: server, error } = await admin.from("mcp_servers").insert({
      id: serverId,
      name: input.name,
      description: input.description,
      transport: input.transport,
      endpoint,
      auth_type: input.authType,
      encrypted_secret: encrypted,
      key_hint: input.secret ? `••••${input.secret.slice(-4)}` : null,
      header_name: input.headerName,
      enabled: input.enabled,
      timeout_ms: input.timeoutMs,
      status: "healthy",
      last_checked_at: new Date().toISOString(),
      last_latency_ms: Date.now() - started,
      created_by: user.id,
      updated_by: user.id,
    }).select("id,name,transport,endpoint,key_hint,status,last_checked_at,last_latency_ms").single();
    if (error || !server) return Response.json({ error: { code: "MCP_SAVE_FAILED" } }, { status: 500 });
    if (inspection.tools.length) await admin.from("mcp_tools").insert(inspection.tools.map((tool) => ({
      server_id: server.id, remote_name: tool.name, description: tool.description, input_schema: tool.inputSchema, enabled: false,
    })));
    if (inspection.resources.length) await admin.from("mcp_resources").insert(inspection.resources.map((resource) => ({
      server_id: server.id, uri: resource.uri, name: resource.name, description: resource.description, mime_type: resource.mimeType, enabled: false,
    })));
    await admin.from("audit_logs").insert({
      actor_user_id: user.id, action: "mcp_server.created", resource_type: "mcp_server", resource_id: server.id,
      metadata: { transport: input.transport, toolCount: inspection.tools.length, resourceCount: inspection.resources.length },
    });
    return Response.json({ data: { ...server, toolsDiscovered: inspection.tools.length, resourcesDiscovered: inspection.resources.length } }, { status: 201 });
  } catch {
    return Response.json({ error: { code: "MCP_CONNECTION_FAILED", message: "فشل فحص خادم MCP أو كان عنوانه غير آمن." } }, { status: 422 });
  }
}

function authHeaders(authType: string, secret?: string, headerName?: string) {
  if (!secret || authType === "none") return {};
  if (authType === "bearer") return { Authorization: `Bearer ${secret}` };
  if (authType === "api_key_header") return { [headerName ?? "X-API-Key"]: secret };
  return JSON.parse(secret) as Record<string, string>;
}
