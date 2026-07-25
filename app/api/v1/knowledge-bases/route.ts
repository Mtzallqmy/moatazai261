import { z } from "zod";
import { getCurrentUser, hasCurrentPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const inputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1_000).optional(),
  embeddingModelId: z.uuid().nullable().optional(),
  visibility: z.enum(["private", "role"]).default("private"),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("knowledge.use")) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const { data, error } = await createAdminClient().from("knowledge_bases")
    .select("id,name,description,visibility,embedding_model_id,retrieval_configuration,enabled,created_at,updated_at,knowledge_base_files(count)")
    .or(`owner_user_id.eq.${user.id},visibility.eq.platform`).eq("enabled", true).order("updated_at", { ascending: false });
  return error ? Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 }) : Response.json({ data });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("knowledge.use")) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } }, { status: 422 });
  const { data, error } = await createAdminClient().from("knowledge_bases").insert({
    owner_user_id: user.id,
    name: parsed.data.name,
    description: parsed.data.description,
    visibility: parsed.data.visibility,
    embedding_model_id: parsed.data.embeddingModelId,
    created_by: user.id,
  }).select("id,name,description,visibility,embedding_model_id,enabled,created_at").single();
  return error ? Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 }) : Response.json({ data }, { status: 201 });
}
