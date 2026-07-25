import { memoryDeleteSchema, memoryInputSchema } from "@/schemas/memory";
import { getCurrentUser, hasCurrentPermission } from "@/lib/auth/guards";
import { memoryService } from "@/features/memory/memory-service";

export const dynamic = "force-dynamic";

async function authorizedUser() {
  const user = await getCurrentUser();
  return user && await hasCurrentPermission("memory.manage") ? user : null;
}

export async function GET() {
  const user = await authorizedUser();
  if (!user) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  return Response.json({ data: await memoryService.list(user.id) });
}

export async function PUT(request: Request) {
  const user = await authorizedUser();
  if (!user) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = memoryInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.flatten().fieldErrors } }, { status: 422 });
  try {
    return Response.json({ data: await memoryService.upsert(user.id, parsed.data) });
  } catch {
    return Response.json({ error: { code: "MEMORY_REJECTED", message: "لم يتم حفظ قيمة فارغة أو حساسة." } }, { status: 422 });
  }
}

export async function DELETE(request: Request) {
  const user = await authorizedUser();
  if (!user) return Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const parsed = memoryDeleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: { code: "VALIDATION_ERROR" } }, { status: 422 });
  await memoryService.remove(user.id, parsed.data.id);
  return new Response(null, { status: 204 });
}
