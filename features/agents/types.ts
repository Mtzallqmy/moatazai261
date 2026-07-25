import { z } from "zod";

export const agentModeSchema = z.enum(["chat", "agent", "research", "files", "data"]);
export type AgentMode = z.infer<typeof agentModeSchema>;

export const agentPolicySchema = z.object({
  maxSteps: z.number().int().min(1).max(50).default(8),
  timeoutMs: z.number().int().min(1_000).max(900_000).default(120_000),
  maxCostUsd: z.number().nonnegative().max(1_000).default(1),
  fallbackModelId: z.uuid().nullable().default(null),
  requireEvidence: z.boolean().default(false),
  minimumConfidence: z.number().min(0).max(1).default(0.55),
});
export type AgentPolicy = z.infer<typeof agentPolicySchema>;

export const agentRunInputSchema = z.object({
  agentId: z.uuid(),
  conversationId: z.uuid().optional(),
  prompt: z.string().trim().min(1).max(100_000),
  fileIds: z.array(z.uuid()).max(20).default([]),
  knowledgeBaseId: z.uuid().optional(),
  idempotencyKey: z.uuid().optional(),
});
export type AgentRunInput = z.infer<typeof agentRunInputSchema>;

export type AgentDefinition = {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
  modelId: string | null;
  knowledgeBaseId: string | null;
  memoryEnabled: boolean;
  policy: AgentPolicy;
  toolIds: string[];
  version: number;
};

export type AgentStepStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type AgentStep = {
  id: string;
  runId: string;
  sequence: number;
  kind: "route" | "retrieve" | "tool" | "model" | "handoff" | "finalize";
  status: AgentStepStatus;
  safeInput: Record<string, unknown>;
  safeOutput: Record<string, unknown>;
};
