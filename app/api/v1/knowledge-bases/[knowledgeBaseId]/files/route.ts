import { z } from "zod";
import { getCurrentUser, hasCurrentPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

const inputSchema = z.object({ fileIds: z.array(z.uuid()).min(1).max(100) });

export async function POST(request: Request, { params }: { params: Promise<{ knowledgeBaseId: string }> }) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("knowledge.use")) {
    return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  const { knowledgeBaseId } = await params;
  const admin = createAdminClient();
  const { data: knowledgeBase } = await admin.from("knowledge_bases")
    .select("id,owner_user_id,embedding_model_id").eq("id", knowledgeBaseId)
    .eq("owner_user_id", user.id).eq("enabled", true).maybeSingle();
  if (!knowledgeBase) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const { data: files, error } = await admin.from("files").select("id,status")
    .eq("owner_user_id", user.id).in("id", parsed.data.fileIds).is("deleted_at", null);
  if (error || files?.length !== new Set(parsed.data.fileIds).size) {
    return Response.json({ error: { code: "FILE_ACCESS_DENIED" } }, { status: 403 });
  }
  if (files.some((file) => file.status !== "ready")) {
    return Response.json({ error: { code: "FILE_NOT_READY", message: "انتظر اكتمال معالجة الملفات أولًا." } }, { status: 409 });
  }
  const rows = files.map((file) => ({
    knowledge_base_id: knowledgeBase.id,
    file_id: file.id,
    added_by: user.id,
    status: "ready",
  }));
  const { error: attachError } = await admin.from("knowledge_base_files").upsert(rows, {
    onConflict: "knowledge_base_id,file_id",
  });
  if (attachError) return Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 });
  await admin.from("audit_logs").insert({
    actor_user_id: user.id,
    action: "knowledge_base.files_attached",
    resource_type: "knowledge_base",
    resource_id: knowledgeBase.id,
    metadata: { fileIds: files.map((file) => file.id), embeddingPending: Boolean(knowledgeBase.embedding_model_id) },
  });
  return Response.json({ data: { attached: files.length, retrieval: knowledgeBase.embedding_model_id ? "keyword_until_embeddings_ready" : "keyword" } }, { status: 201 });
}
