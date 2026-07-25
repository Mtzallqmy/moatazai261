import { z } from "zod";

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const tabularDatasetSchema = z.object({
  columns: z.array(z.string().min(1).max(120)).min(1).max(500),
  rows: z.array(z.record(z.string(), scalar)).max(50_000),
});

export function profileDataset(value: unknown) {
  const dataset = tabularDatasetSchema.parse(value);
  return {
    rowCount: dataset.rows.length,
    columnCount: dataset.columns.length,
    columns: dataset.columns.map((name) => profileColumn(name, dataset.rows.map((row) => row[name]))),
  };
}

function profileColumn(name: string, values: Array<string | number | boolean | null | undefined>) {
  const present = values.filter((value): value is string | number | boolean => value !== null && value !== undefined && value !== "");
  const numbers = present.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    name,
    inferredType: numbers.length === present.length && present.length ? "number" :
      present.every((value) => typeof value === "boolean") ? "boolean" : "string",
    missing: values.length - present.length,
    unique: new Set(present.map(String)).size,
    minimum: numbers.length ? Math.min(...numbers) : null,
    maximum: numbers.length ? Math.max(...numbers) : null,
    mean: numbers.length ? numbers.reduce((sum, number) => sum + number, 0) / numbers.length : null,
  };
}
