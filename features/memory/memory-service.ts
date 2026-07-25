import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const secretPatterns = [
  /\b(sk-[A-Za-z0-9_-]{12,})\b/g,
  /\b(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  /\b(Bearer\s+[A-Za-z0-9._-]{12,})\b/gi,
  /\b(password|كلمة المرور|api[ _-]?key)\s*[:=]\s*\S+/gi,
];

export function sanitizeMemoryValue(value: string) {
  return secretPatterns.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), value)
    .trim()
    .slice(0, 4_000);
}

export class MemoryService {
  async list(userId: string) {
    const { data, error } = await createAdminClient()
      .from("user_memories")
      .select("id,memory_type,key,value,confidence,source,created_at,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async upsert(userId: string, input: { key: string; value: string; memoryType?: string; source?: string }) {
    const value = sanitizeMemoryValue(input.value);
    if (!value || value === "[REDACTED]") throw new Error("Sensitive or empty memories are not stored");
    const { data, error } = await createAdminClient()
      .from("user_memories")
      .upsert({
        user_id: userId,
        memory_type: input.memoryType ?? "preference",
        key: input.key,
        value,
        source: input.source ?? "user",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,memory_type,key" })
      .select("id,memory_type,key,value,confidence,source,created_at,updated_at")
      .single();
    if (error) throw error;
    return data;
  }

  async remove(userId: string, memoryId: string) {
    const { error } = await createAdminClient().from("user_memories").delete().eq("id", memoryId).eq("user_id", userId);
    if (error) throw error;
  }
}

export const memoryService = new MemoryService();
