import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260726030000_decommission_legacy_user_uploads_bucket.sql",
    import.meta.url,
  ),
  "utf8",
);

test("legacy storage cleanup is conditional and concurrency-safe", () => {
  assert.match(migration, /from storage\.buckets[\s\S]*for update/i);
  assert.match(migration, /lock table storage\.objects/i);
  assert.match(migration, /storage\.s3_multipart_uploads/i);
  assert.match(migration, /storage\.vector_indexes/i);
  assert.match(migration, /if legacy_bucket_has_data then/i);
  assert.match(migration, /preserving legacy bucket user-uploads/i);
});

test("legacy storage cleanup revokes policies only after the guard", () => {
  const guardIndex = migration.indexOf("if legacy_bucket_has_data then");
  const policyIndex = migration.indexOf(
    "drop policy if exists user_uploads_owner_read",
  );

  assert.ok(guardIndex >= 0);
  assert.ok(policyIndex > guardIndex);
  assert.doesNotMatch(migration, /delete from storage\.buckets/i);
  assert.match(migration, /remove its bucket record through the Storage API/i);
});
