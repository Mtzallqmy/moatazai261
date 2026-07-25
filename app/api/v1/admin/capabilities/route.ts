import { hasCurrentPermission } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { modelCapabilities } from "@/services/model-capability-service";
import { capabilityMatrix } from "@/services/capability-matrix-service";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!await hasCurrentPermission("models.manage")) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const { data, error } = await createAdminClient().from("ai_models")
    .select("id,display_name,model_key,enabled,capabilities,context_window,ai_providers(id,name,provider_type,enabled)")
    .order("display_name");
  if (error) return Response.json({ error: { code: "DATABASE_ERROR" } }, { status: 500 });
  return Response.json({ data: (data ?? []).map((model) => ({
    ...model,
    matrix: capabilityMatrix(modelCapabilities({ ...(model.capabilities as object), contextWindow: model.context_window })),
  })) });
}
