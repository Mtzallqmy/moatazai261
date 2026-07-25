import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProviderError } from "@/providers/types";
import { mcpRouter } from "@/features/mcp/mcp-router";
import { sanitizeToolOutput, toolRegistry } from "./tool-registry";

export type ToolBinding = {
  id: string;
  slug: string;
  tool_type: "internal" | "mcp" | "http";
  input_schema: Record<string, unknown>;
  enabled: boolean;
  mcp_tools?: Array<{ id: string; enabled: boolean }>;
};

type ExecuteInput = {
  tool: ToolBinding;
  arguments: unknown;
  userId: string;
  agentRunId: string;
  modelId: string;
  roleNames: string[];
  signal?: AbortSignal;
};

export class ToolExecutionService {
  async assertAllowed(tool: ToolBinding, userId: string, modelId: string, roleNames: string[]) {
    if (!tool.enabled) throw new ProviderError("Tool is disabled", "CAPABILITY_UNSUPPORTED", false, 403);
    const { data, error } = await createAdminClient().from("tool_permissions")
      .select("subject_type,subject_id,allowed")
      .eq("tool_id", tool.id);
    if (error) throw new Error("Could not resolve tool permissions");
    const rules = data ?? [];
    const applicable = rules.filter((rule) =>
      (rule.subject_type === "user" && rule.subject_id === userId) ||
      (rule.subject_type === "model" && rule.subject_id === modelId) ||
      (rule.subject_type === "role" && roleNames.includes(rule.subject_id)),
    );
    if (applicable.some((rule) => !rule.allowed)) {
      throw new ProviderError("Tool access is denied", "CAPABILITY_UNSUPPORTED", false, 403);
    }
    if (rules.length > 0 && !applicable.some((rule) => rule.allowed)) {
      throw new ProviderError("Tool access is not granted", "CAPABILITY_UNSUPPORTED", false, 403);
    }
  }

  async execute(input: ExecuteInput) {
    await this.assertAllowed(input.tool, input.userId, input.modelId, input.roleNames);
    assertJsonSchema(input.tool.input_schema, input.arguments);
    const admin = createAdminClient();
    const idempotencyKey = crypto.randomUUID();
    const safeInput = sanitizeToolOutput(input.arguments);
    const { data: execution, error } = await admin.from("tool_executions").insert({
      user_id: input.userId,
      tool_id: input.tool.id,
      agent_run_id: input.agentRunId,
      idempotency_key: idempotencyKey,
      status: "running",
      safe_input: safeInput,
    }).select("id").single();
    if (error || !execution) throw new Error("Could not persist tool execution");
    const started = Date.now();
    try {
      const result = input.tool.tool_type === "internal"
        ? await toolRegistry.execute(input.tool.slug, input.arguments, {
          userId: input.userId,
          runId: input.agentRunId,
          signal: input.signal,
        })
        : await this.executeMcp(input);
      const safeOutput = sanitizeToolOutput(result);
      await admin.from("tool_executions").update({
        status: "completed",
        safe_output: safeOutput,
        duration_ms: Date.now() - started,
        completed_at: new Date().toISOString(),
      }).eq("id", execution.id);
      return safeOutput;
    } catch (cause) {
      await admin.from("tool_executions").update({
        status: input.signal?.aborted ? "cancelled" : "failed",
        error_code: cause instanceof ProviderError ? cause.code : "TOOL_EXECUTION_FAILED",
        duration_ms: Date.now() - started,
        completed_at: new Date().toISOString(),
      }).eq("id", execution.id);
      throw cause;
    }
  }

  private async executeMcp(input: ExecuteInput) {
    if (input.tool.tool_type !== "mcp") {
      throw new ProviderError("HTTP tools require an approved adapter", "CAPABILITY_UNSUPPORTED", false, 409);
    }
    const remote = input.tool.mcp_tools?.find((candidate) => candidate.enabled);
    if (!remote) throw new ProviderError("MCP tool is unavailable", "TOOL_EXECUTION_FAILED", true, 409);
    const parsed = asRecord(input.arguments);
    return mcpRouter.call(remote.id, parsed, input.signal);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderError("Tool arguments must be an object", "INVALID_REQUEST", false, 422);
  }
  return value as Record<string, unknown>;
}

function assertJsonSchema(schema: Record<string, unknown>, value: unknown, path = "$") {
  const type = typeof schema.type === "string" ? schema.type : undefined;
  if (type === "object") {
    const object = asRecord(value);
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [];
    for (const key of required) {
      if (!(key in object)) throw invalidArguments(`${path}.${key} is required`);
    }
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(object).find((key) => !(key in properties));
      if (unknown) throw invalidArguments(`${path}.${unknown} is not allowed`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in object && isRecord(child)) assertJsonSchema(child, object[key], `${path}.${key}`);
    }
  } else if (type === "array") {
    if (!Array.isArray(value)) throw invalidArguments(`${path} must be an array`);
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      throw invalidArguments(`${path} exceeds maxItems`);
    }
    if (isRecord(schema.items)) value.forEach((item, index) => assertJsonSchema(schema.items as Record<string, unknown>, item, `${path}[${index}]`));
  } else if (type === "string" && typeof value !== "string") {
    throw invalidArguments(`${path} must be a string`);
  } else if (type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    throw invalidArguments(`${path} must be a number`);
  } else if (type === "integer" && (typeof value !== "number" || !Number.isInteger(value))) {
    throw invalidArguments(`${path} must be an integer`);
  } else if (type === "boolean" && typeof value !== "boolean") {
    throw invalidArguments(`${path} must be a boolean`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    throw invalidArguments(`${path} has an unsupported value`);
  }
}

function invalidArguments(message: string) {
  return new ProviderError(message, "INVALID_REQUEST", false, 422);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const toolExecutionService = new ToolExecutionService();
