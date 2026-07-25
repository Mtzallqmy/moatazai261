import { z } from "zod";

export async function validateStructuredOutput<T>(
  schema: z.ZodType<T>,
  value: unknown,
): Promise<T> {
  return schema.parseAsync(value);
}

export function parseJsonOutput(value: string): unknown {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse((fenced ?? value).trim()) as unknown;
}
