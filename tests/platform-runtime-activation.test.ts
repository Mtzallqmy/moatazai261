import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("built-in agent tools are registered idempotently with role permissions", () => {
  const sql = read("supabase/migrations/20260726040000_register_builtin_agent_tools.sql");
  assert.match(sql, /knowledge\.search/);
  assert.match(sql, /data\.profile/);
  assert.match(sql, /on conflict \(slug\) do update/);
  assert.match(sql, /tool_permissions/);
});

test("tool management is permission protected and audit logged", () => {
  const route = read("app/api/v1/admin/tools/route.ts");
  assert.match(route, /hasCurrentPermission\("tools\.manage"\)/);
  assert.match(route, /tool\.configuration_updated/);
  assert.doesNotMatch(route, /encrypted_secret|service_role/);
});

test("agents may be drafted without a model but cannot be activated without one", () => {
  const schema = read("schemas/agent.ts");
  assert.match(schema, /defaultModelId: z\.uuid\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /value\.status === "active" && !value\.defaultModelId/);
});
