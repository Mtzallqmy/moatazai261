import { z } from "zod";

const tableBlock = z.object({
  type: z.literal("table"),
  title: z.string().max(160).optional(),
  columns: z.array(z.object({ key: z.string().max(80), label: z.string().max(120) })).max(30),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(1_000),
});
const metricBlock = z.object({
  type: z.literal("metrics"),
  items: z.array(z.object({
    label: z.string().max(120),
    value: z.union([z.string().max(200), z.number()]),
    change: z.number().optional(),
  })).max(12),
});
const chartBlock = z.object({
  type: z.literal("chart"),
  chart: z.enum(["bar", "line", "pie"]),
  title: z.string().max(160).optional(),
  xKey: z.string().max(80),
  series: z.array(z.object({ key: z.string().max(80), label: z.string().max(120) })).max(12),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).max(1_000),
});
const actionBlock = z.object({
  type: z.literal("actions"),
  actions: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_-]+$/),
    label: z.string().max(80),
    action: z.enum(["copy", "download", "retry", "open-source"]),
    payload: z.record(z.string(), z.string()).default({}),
  })).max(8),
});

export const generatedUiBlockSchema = z.discriminatedUnion("type", [
  tableBlock,
  metricBlock,
  chartBlock,
  actionBlock,
]);
export type GeneratedUiBlock = z.infer<typeof generatedUiBlockSchema>;

export function validateGeneratedUiBlock(value: unknown): GeneratedUiBlock {
  return generatedUiBlockSchema.parse(value);
}
