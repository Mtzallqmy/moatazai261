import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { modelInputSchema, modelUpdateSchema, providerInputSchema } from "../schemas/provider";

test("provider setup accepts an optional credential and marks an included credential as default", () => {
  const withoutCredential = providerInputSchema.parse({
    name: "Local provider",
    slug: "local-provider",
    providerType: "openai-compatible",
    baseUrl: "https://models.example.com/v1",
    authType: "none",
  });
  assert.equal(withoutCredential.credential, undefined);

  const withCredential = providerInputSchema.parse({
    name: "Cloud provider",
    slug: "cloud-provider",
    providerType: "openai-compatible",
    baseUrl: "https://api.example.com/v1",
    credential: { secret: "secret-value" },
  });
  assert.equal(withCredential.credential?.isDefault, true);
});

test("manual model validation requires explicit capability metadata", () => {
  const model = modelInputSchema.parse({
    providerId: "00000000-0000-4000-8000-000000000001",
    modelKey: "production-model",
    displayName: "Production Model",
    inputModalities: ["text"],
    outputModalities: ["text"],
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      audio: false,
      video: false,
      documents: false,
      embeddings: false,
      structuredOutput: false,
    },
  });
  assert.equal(model.enabled, false);
  assert.equal(model.visibleToUsers, true);
  assert.equal(model.capabilities.streaming, true);
  assert.equal(modelUpdateSchema.parse({ isDefault: true }).isDefault, true);
});

const providerRoute = await readFile(new URL("../app/api/v1/admin/providers/route.ts", import.meta.url), "utf8");
const credentialRoute = await readFile(new URL("../app/api/v1/admin/providers/[providerId]/credentials/route.ts", import.meta.url), "utf8");
const modelRoute = await readFile(new URL("../app/api/v1/admin/models/[modelId]/route.ts", import.meta.url), "utf8");
const resolver = await readFile(new URL("../services/credential-resolver.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260726033000_provider_default_selection.sql", import.meta.url), "utf8");

test("admin provider responses never expose encrypted credentials", () => {
  assert.doesNotMatch(providerRoute, /select\("[^"]*encrypted_secret/);
  assert.doesNotMatch(credentialRoute, /\.select\("[^"]*encrypted_secret/);
  assert.match(providerRoute, /key_hint/);
});

test("default credential and model selections are enforced server-side and audited", () => {
  assert.match(resolver, /order\("is_default", \{ ascending: false \}\)/);
  assert.match(migration, /unique index if not exists ai_provider_credentials_one_default_per_provider_idx/);
  assert.match(credentialRoute, /provider\.credential_updated/);
  assert.match(modelRoute, /model\.updated/);
  assert.match(modelRoute, /is_default: false/);
});
