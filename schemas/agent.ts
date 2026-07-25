import { z } from "zod";

export const agentAdminInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1_000).optional(),
  systemPrompt: z.string().trim().min(1).max(100_000),
  defaultModelId: z.uuid(),
  knowledgeBaseId: z.uuid().nullable().optional(),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().min(1).max(128_000).default(4096),
  memoryEnabled: z.boolean().default(false),
  toolIds: z.array(z.uuid()).max(50).default([]),
  allowedRoles: z.array(z.string().regex(/^[a-z][a-z0-9_-]+$/)).min(1).max(20).default(["user"]),
  status: z.enum(["draft", "active", "disabled"]).default("draft"),
  policy: z.object({
    maxSteps: z.number().int().min(1).max(50).default(8),
    timeoutMs: z.number().int().min(1_000).max(900_000).default(120_000),
    maxCostUsd: z.number().nonnegative().max(1_000).default(1),
    requireEvidence: z.boolean().default(false),
    minimumConfidence: z.number().min(0).max(1).default(0.55),
  }),
});
