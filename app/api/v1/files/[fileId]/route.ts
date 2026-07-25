import { getCurrentUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { fileId } = await params;
  const admin = createAdminClient();
  const { data: file } = await admin.from("files")
    .select("id,owner_user_id,original_name,storage_path,mime_type,size_bytes,status,uploaded_at")
    .eq("id", fileId).eq("owner_user_id", user.id).is("deleted_at", null).maybeSingle();
  if (!file) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const { data, error } = await admin.storage.from("chat-attachments").createSignedUrl(file.storage_path, 300);
  if (error || !data) return Response.json({ error: { code: "SIGNED_URL_FAILED" } }, { status: 500 });
  return Response.json({ data: { ...file, signedUrl: data.signedUrl, expiresIn: 300 } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const { fileId } = await params;
  const admin = createAdminClient();
  const { data: file } = await admin.from("files").select("id,storage_path").eq("id", fileId)
    .eq("owner_user_id", user.id).is("deleted_at", null).maybeSingle();
  if (!file) return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  const deletedAt = new Date().toISOString();
  const { error } = await admin.from("files").update({ status: "deleted", deleted_at: deletedAt })
    .eq("id", file.id).eq("owner_user_id", user.id);
  if (error) return Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 });
  await admin.from("background_jobs").insert({
    owner_user_id: user.id,
    job_type: "file.purge",
    resource_type: "file",
    resource_id: file.id,
    payload: { bucket: "chat-attachments", storagePath: file.storage_path, notBefore: deletedAt },
    priority: 200,
  });
  return new Response(null, { status: 204 });
}
