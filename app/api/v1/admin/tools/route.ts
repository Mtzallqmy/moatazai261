import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasCurrentPermission } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  id: z.uuid(),
  enabled: z.boolean().optional(),
  requiresConfirmation: z.boolean().optional(),
}).refine((value) => value.enabled !== undefined || value.requiresConfirmation !== undefined);

export async function GET() {
  if (!await hasCurrentPermission("tools.manage")) {
    return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const { data, error } = await createAdminClient().from("tools")
    .select("id,slug,name,description,tool_type,risk_level,requires_confirmation,enabled,updated_at,tool_permissions(count),agent_tools(count)")
    .order("name");
  return error
    ? Response.json({ error: { code: "DATABASE_ERROR", message: "تعذر تحميل الأدوات." } }, { status: 500 })
    : Response.json({ data });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user || !await hasCurrentPermission("tools.manage")) {
    return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  }
  const update: Record<string, boolean | string> = { updated_at: new Date().toISOString() };
  if (parsed.data.enabled !== undefined) update.enabled = parsed.data.enabled;
  if (parsed.data.requiresConfirmation !== undefined) {
    update.requires_confirmation = parsed.data.requiresConfirmation;
  }
  const { data, error } = await createAdminClient().from("tools").update(update)
    .eq("id", parsed.data.id)
    .select("id,slug,name,risk_level,requires_confirmation,enabled,updated_at")
    .single();
  if (error) return Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 });
  await createAdminClient().from("audit_logs").insert({
    actor_user_id: user.id,
    action: "tool.configuration_updated",
    resource_type: "tool",
    resource_id: parsed.data.id,
    metadata: {
      enabled: parsed.data.enabled,
      requiresConfirmation: parsed.data.requiresConfirmation,
    },
  });
  return Response.json({ data });
}
