import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { secretCrypto } from "@/services/secret-crypto";
import { McpClient } from "./mcp-client";

type McpToolRow = {
  remote_name: string;
  mcp_servers: {
    id: string;
    transport: "http" | "sse" | "stdio";
    endpoint: string | null;
    auth_type: string;
    encrypted_secret: string | null;
    header_name: string | null;
    timeout_ms: number;
    enabled: boolean;
  };
};

export class McpRouter {
  async call(toolId: string, args: Record<string, unknown>, signal?: AbortSignal) {
    const { data, error } = await createAdminClient().from("mcp_tools")
      .select("remote_name,mcp_servers!inner(id,transport,endpoint,auth_type,encrypted_secret,header_name,timeout_ms,enabled)")
      .eq("id", toolId).eq("enabled", true).single();
    if (error || !data) throw new Error("MCP tool is unavailable");
    const row = data as unknown as McpToolRow;
    const server = row.mcp_servers;
    if (!server.enabled || server.transport === "stdio" || !server.endpoint) throw new Error("MCP server is unavailable in this runtime");
    const secret = server.encrypted_secret ? await secretCrypto.decrypt(server.encrypted_secret, { mcpServerId: server.id }) : undefined;
    const headers = buildHeaders(server.auth_type, secret, server.header_name);
    return new McpClient({ transport: server.transport, endpoint: server.endpoint, headers, timeoutMs: server.timeout_ms })
      .callTool(row.remote_name, args, signal);
  }
}

function buildHeaders(authType: string, secret?: string, headerName?: string | null) {
  if (!secret || authType === "none") return {};
  if (authType === "bearer") return { Authorization: `Bearer ${secret}` };
  if (authType === "api_key_header") return { [headerName ?? "X-API-Key"]: secret };
  return JSON.parse(secret) as Record<string, string>;
}

export const mcpRouter = new McpRouter();
