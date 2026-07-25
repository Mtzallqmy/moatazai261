import { z } from "zod";

export const mcpTransportSchema = z.enum(["http", "sse", "stdio"]);
export type McpTransport = z.infer<typeof mcpTransportSchema>;

export const mcpServerInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  transport: mcpTransportSchema,
  endpoint: z.url().optional(),
  authType: z.enum(["none", "bearer", "api_key_header", "custom_headers"]).default("none"),
  secret: z.string().min(8).max(10_000).optional(),
  headerName: z.string().regex(/^[A-Za-z0-9-]+$/).optional(),
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().min(1_000).max(120_000).default(15_000),
});
export type McpServerInput = z.infer<typeof mcpServerInputSchema>;

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

export type McpResource = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
};
