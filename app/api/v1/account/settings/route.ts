import { z } from "zod";
import { getCurrentUser, getSupabaseServerClient } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  username: z.string().trim().regex(/^[a-zA-Z0-9_]{3,32}$/).nullable(),
  bio: z.string().trim().max(500),
  language: z.enum(["ar", "en"]),
  theme: z.enum(["system", "light", "dark", "eye"]),
  notificationsEnabled: z.boolean(),
  saveChatHistory: z.boolean(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const client = await getSupabaseServerClient();
  const [{ data: profile, error: profileError }, { data: settings, error: settingsError }] = await Promise.all([
    client.from("profiles").select("display_name,username,bio,preferred_language,theme,account_status,created_at").eq("id", user.id).single(),
    client.from("user_settings").select("language,theme,notifications_enabled,save_chat_history,default_model_id").eq("user_id", user.id).single(),
  ]);
  if (profileError || settingsError) return Response.json({ error: { code: "DATABASE_ERROR", message: "تعذر تحميل إعدادات الحساب." } }, { status: 500 });
  return Response.json({ data: { email: user.email, profile, settings } });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR", message: "راجع الاسم واسم المستخدم والقيم المدخلة." } }, { status: 422 });
  const client = await getSupabaseServerClient();
  const now = new Date().toISOString();
  const { error: profileError } = await client.from("profiles").update({
    display_name: parsed.data.displayName,
    username: parsed.data.username || null,
    bio: parsed.data.bio || null,
    preferred_language: parsed.data.language,
    theme: parsed.data.theme,
    updated_at: now,
  }).eq("id", user.id);
  if (profileError) {
    const duplicate = profileError.code === "23505";
    return Response.json({ error: { code: duplicate ? "USERNAME_TAKEN" : "DATABASE_ERROR", message: duplicate ? "اسم المستخدم مستخدم بالفعل." : "تعذر تحديث الملف الشخصي." } }, { status: duplicate ? 409 : 500 });
  }
  const { error: settingsError } = await client.from("user_settings").upsert({
    user_id: user.id,
    language: parsed.data.language,
    theme: parsed.data.theme,
    notifications_enabled: parsed.data.notificationsEnabled,
    save_chat_history: parsed.data.saveChatHistory,
    updated_at: now,
  }, { onConflict: "user_id" });
  if (settingsError) return Response.json({ error: { code: "DATABASE_ERROR", message: "حُفظ الملف، لكن تعذر حفظ تفضيلات الحساب." } }, { status: 500 });
  return Response.json({ data: { updatedAt: now } });
}
