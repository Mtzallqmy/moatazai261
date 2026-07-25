import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const querySchema = z.object({
  q: z.string().trim().min(2).max(200),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  scope: z.enum(["all", "conversations", "messages", "files"]).default("all"),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  const { q, page, limit, scope } = parsed.data;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const admin = createAdminClient();

  const conversations = scope === "all" || scope === "conversations"
    ? admin.from("conversations").select("id,title,summary,updated_at")
      .eq("user_id", user.id).neq("status", "deleted")
      .textSearch("search_vector", q, { config: "simple", type: "websearch" }).range(from, to)
    : Promise.resolve({ data: [], error: null });
  const messages = scope === "all" || scope === "messages"
    ? admin.from("messages").select("id,conversation_id,role,content,created_at,conversations!inner(user_id,title)")
      .eq("conversations.user_id", user.id).eq("status", "completed")
      .textSearch("search_vector", q, { config: "simple", type: "websearch" }).range(from, to)
    : Promise.resolve({ data: [], error: null });
  const files = scope === "all" || scope === "files"
    ? admin.from("file_chunks").select("id,file_id,content,metadata,files!inner(owner_user_id,original_name,mime_type)")
      .eq("files.owner_user_id", user.id)
      .textSearch("search_vector", q, { config: "simple", type: "websearch" }).range(from, to)
    : Promise.resolve({ data: [], error: null });
  const [conversationResult, messageResult, fileResult] = await Promise.all([conversations, messages, files]);
  if (conversationResult.error || messageResult.error || fileResult.error) {
    return Response.json({ error: { code: "SEARCH_FAILED" } }, { status: 500 });
  }
  return Response.json({
    data: {
      conversations: conversationResult.data ?? [],
      messages: (messageResult.data ?? []).map((message) => ({ ...message, content: snippet(message.content, q) })),
      files: (fileResult.data ?? []).map((chunk) => ({ ...chunk, content: snippet(chunk.content, q) })),
    },
    pagination: { page, limit },
  });
}

function snippet(content: string, query: string) {
  const firstTerm = query.split(/\s+/).find((term) => term.length > 1)?.toLowerCase();
  const index = firstTerm ? content.toLowerCase().indexOf(firstTerm) : -1;
  const start = Math.max(0, index < 0 ? 0 : index - 120);
  return content.slice(start, start + 360);
}
