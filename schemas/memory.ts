import { z } from "zod";

export const memoryInputSchema = z.object({
  key: z.string().trim().min(1).max(160),
  value: z.string().trim().min(1).max(4_000),
  memoryType: z.enum(["preference", "fact", "instruction"]).default("preference"),
});

export const memoryDeleteSchema = z.object({ id: z.uuid() });
