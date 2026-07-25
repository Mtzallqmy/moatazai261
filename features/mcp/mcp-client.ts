import "server-only";
import { assertSafeOutboundUrl, assertSafeProviderUrl } from "@/lib/security/provider-url";
import type { McpResource, McpTool, McpTransport } from "./types";

type JsonRpcResponse<T> = { jsonrpc: "2.0"; id: string; result?: T; error?: { code: number; message: string } };

export type McpConnection = {
  transport: McpTransport;
  endpoint?: string;
  headers?: Record<string, string>;
  timeoutMs: number;
};

export class McpClient {
  constructor(private readonly connection: McpConnection) {}

  async inspect(signal?: AbortSignal) {
    if (this.connection.transport === "stdio") {
      throw new Error("stdio MCP is unavailable in the serverless web runtime");
    }
    const initialized = await this.call<{ serverInfo?: { name?: string; version?: string } }>(
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "moataz-ai", version: "1" },
      },
      signal,
    );
    const [toolResult, resourceResult] = await Promise.all([
      this.call<{ tools?: McpTool[] }>("tools/list", {}, signal),
      this.call<{ resources?: McpResource[] }>("resources/list", {}, signal).catch(() => ({ resources: [] })),
    ]);
    return {
      serverInfo: initialized.serverInfo ?? {},
      tools: toolResult.tools ?? [],
      resources: resourceResult.resources ?? [],
    };
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal) {
    return this.call<unknown>("tools/call", { name, arguments: args }, signal);
  }

  private async call<T>(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    if (!this.connection.endpoint) throw new Error("MCP endpoint is required");
    let endpoint = assertSafeProviderUrl(this.connection.endpoint);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.connection.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      for (let redirect = 0; redirect <= 2; redirect += 1) {
        const id = crypto.randomUUID();
        endpoint = await assertSafeOutboundUrl(endpoint);
        const response = await fetch(endpoint, {
          method: "POST",
          redirect: "manual",
          headers: {
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
            ...this.connection.headers,
          },
          body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
          signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) throw new Error("MCP redirect has no location");
          endpoint = assertSafeProviderUrl(new URL(location, endpoint).toString());
          continue;
        }
        if (!response.ok) throw new Error(`MCP request failed with status ${response.status}`);
        const payload = await parseMcpResponse<JsonRpcResponse<T>>(response);
        if (payload.error) throw new Error(`MCP error ${payload.error.code}: ${payload.error.message}`);
        if (payload.result === undefined) throw new Error("MCP returned no result");
        return payload.result;
      }
      throw new Error("MCP redirected too many times");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
}

async function parseMcpResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("text/event-stream")) {
    const data = text.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
    if (!data) throw new Error("MCP SSE response contained no data");
    return JSON.parse(data) as T;
  }
  return JSON.parse(text) as T;
}
