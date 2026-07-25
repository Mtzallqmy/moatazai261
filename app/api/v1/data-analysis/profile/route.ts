import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileDataset } from "@/features/data-analysis/profiler";

const inputSchema = z.object({ fileId: z.uuid() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  const admin = createAdminClient();
  const { data: file } = await admin.from("files")
    .select("id,mime_type,original_name,status,file_extracted_contents(text_content)")
    .eq("id", parsed.data.fileId).eq("owner_user_id", user.id).is("deleted_at", null).maybeSingle();
  if (!file) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  if (file.status !== "ready") return Response.json({ error: { code: "FILE_NOT_READY" } }, { status: 409 });
  const extracted = (file.file_extracted_contents as unknown as Array<{ text_content: string }> | null)?.[0]?.text_content;
  if (!extracted) return Response.json({ error: { code: "NO_TABULAR_CONTENT" } }, { status: 422 });
  try {
    const dataset = file.mime_type === "text/csv" ? parseCsv(extracted) : parseJsonRows(extracted);
    const profile = profileDataset(dataset);
    const { data: block } = await admin.from("generated_ui_blocks").insert({
      user_id: user.id,
      block_type: "table",
      content: { title: `تحليل ${file.original_name}`, columns: ["name", "inferredType", "missing", "unique", "minimum", "maximum", "mean"], rows: profile.columns },
    }).select("id").single();
    return Response.json({ data: { file: { id: file.id, name: file.original_name }, profile, uiBlockId: block?.id } });
  } catch {
    return Response.json({ error: { code: "INVALID_TABULAR_DATA", message: "تعذر تفسير الملف كجدول آمن." } }, { status: 422 });
  }
}

function parseJsonRows(text: string) {
  const value = JSON.parse(text) as unknown;
  if (!Array.isArray(value) || value.length > 50_000 || value.some((row) => !isRecord(row))) throw new Error();
  const columns = [...new Set(value.flatMap((row) => Object.keys(row as Record<string, unknown>)))].slice(0, 500);
  return { columns, rows: value.map((row) => filterScalarRow(row as Record<string, unknown>, columns)) };
}

function parseCsv(text: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length && records.length <= 50_000; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { field += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) { record.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field); field = "";
      if (record.some(Boolean)) records.push(record);
      record = [];
    } else field += character;
  }
  if (field || record.length) { record.push(field); records.push(record); }
  if (quoted || records.length < 2) throw new Error();
  const columns = records[0]!.map((column) => column.trim()).slice(0, 500);
  if (columns.some((column) => !column) || new Set(columns).size !== columns.length) throw new Error();
  const rows = records.slice(1).map((values) => Object.fromEntries(columns.map((column, index) =>
    [column, parseScalar(values[index] ?? "")]
  )));
  return { columns, rows };
}

function parseScalar(value: string): string | number | boolean | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const number = Number(trimmed);
    if (Number.isFinite(number)) return number;
  }
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true";
  return trimmed.slice(0, 10_000);
}

function filterScalarRow(row: Record<string, unknown>, columns: string[]) {
  return Object.fromEntries(columns.map((column) => {
    const value = row[column];
    return [column, typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
      ? value : JSON.stringify(value).slice(0, 10_000)];
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
