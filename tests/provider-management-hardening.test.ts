import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authHeaders, normalizedError } from "../providers/http";
import { getProviderPreset } from "../providers/presets";
import {
  buildProviderUrl,
  normalizeProviderBaseUrl,
  normalizeProviderEndpoint,
} from "../providers/url";
import type { ProviderConfiguration } from "../providers/types";
import {
  providerCredentialUpdateSchema,
  providerInputSchema,
} from "../schemas/provider";

const baseConfiguration: ProviderConfiguration = {
  id: "provider",
  type: "openai-compatible",
  name: "Provider",
  baseUrl: "https://api.example.com/v1",
  enabled: false,
};

test("provider URL normalization removes duplicate slashes and version segments", () => {
  assert.equal(
    normalizeProviderBaseUrl("https://api.example.com//v1//v1/"),
    "https://api.example.com/v1",
  );
  assert.equal(
    buildProviderUrl("https://api.example.com/v1/", "/v1/chat/completions").toString(),
    "https://api.example.com/v1/chat/completions",
  );
  assert.equal(normalizeProviderEndpoint("chat//completions", "/chat/completions"), "/chat/completions");
  assert.throws(() => normalizeProviderEndpoint("https://evil.example", "/models"));
  assert.throws(() => normalizeProviderEndpoint("../metadata", "/models"));
});

test("OpenRouter preset uses its documented OpenAI-compatible defaults", () => {
  const preset = getProviderPreset("openrouter");
  assert.equal(preset.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(preset.chatEndpoint, "/chat/completions");
  assert.equal(preset.modelsEndpoint, "/models");
  assert.equal(preset.authType, "bearer");
});

test("authentication headers are emitted only for the selected mode", () => {
  assert.deepEqual(authHeaders({
    ...baseConfiguration,
    credential: { secret: "bearer-secret", authType: "bearer" },
  }), { Authorization: "Bearer bearer-secret" });
  assert.deepEqual(authHeaders({
    ...baseConfiguration,
    credential: { secret: "header-secret", authType: "api_key_header", headerName: "X-API-Key" },
  }), { "X-API-Key": "header-secret" });
  assert.deepEqual(authHeaders({
    ...baseConfiguration,
    credential: { secret: "query-secret", authType: "query", queryName: "key" },
  }), {});
  assert.deepEqual(authHeaders({
    ...baseConfiguration,
    credential: {
      secret: "{}",
      authType: "custom_headers",
      customHeaders: { "X-Secret": "hidden" },
    },
  }), { "X-Secret": "hidden" });
});

test("provider input validation allows disabled no-auth providers and rejects secret public headers", () => {
  const valid = providerInputSchema.parse({
    name: "Trusted remote",
    slug: "trusted-remote",
    providerType: "openai-compatible",
    baseUrl: "https://models.example.com/v1",
    authType: "none",
  });
  assert.equal(valid.enabled, false);
  assert.throws(() => providerInputSchema.parse({
    name: "Unsafe headers",
    slug: "unsafe-headers",
    providerType: "openai-compatible",
    baseUrl: "https://models.example.com/v1",
    authType: "bearer",
    configuration: { headers: { Authorization: "Bearer must-not-live-here" } },
  }));
});

test("blank credential updates do not overwrite existing encrypted keys", () => {
  assert.equal(providerCredentialUpdateSchema.safeParse({
    credentialId: "00000000-0000-4000-8000-000000000001",
  }).success, false);
  assert.equal(providerCredentialUpdateSchema.safeParse({
    credentialId: "00000000-0000-4000-8000-000000000001",
    priority: 10,
  }).success, true);
});

test("HTTP errors are normalized into stable provider error codes", () => {
  assert.equal(normalizedError(401).code, "AUTHENTICATION_FAILED");
  assert.equal(normalizedError(403).code, "PERMISSION_ERROR");
  assert.equal(normalizedError(404).code, "MODEL_NOT_FOUND");
  assert.equal(normalizedError(429).code, "RATE_LIMITED");
  assert.equal(normalizedError(503).code, "PROVIDER_UNAVAILABLE");
});

test("provider management routes require permissions, atomic writes and secret-safe responses", () => {
  const createRoute = readFileSync("app/api/v1/admin/providers/route.ts", "utf8");
  const updateRoute = readFileSync("app/api/v1/admin/providers/[providerId]/route.ts", "utf8");
  const draftTestRoute = readFileSync("app/api/v1/admin/providers/test/route.ts", "utf8");
  const credentialRoute = readFileSync(
    "app/api/v1/admin/providers/[providerId]/credentials/route.ts",
    "utf8",
  );
  const migration = readFileSync(
    "supabase/migrations/20260726050000_provider_management_hardening.sql",
    "utf8",
  );

  for (const source of [createRoute, updateRoute, draftTestRoute]) {
    assert.match(source, /hasCurrentPermission\("providers\.manage"\)/);
  }
  assert.match(createRoute, /create_ai_provider_atomic/);
  assert.match(createRoute, /secretCrypto\.encrypt/);
  assert.match(credentialRoute, /key_hint/);
  assert.doesNotMatch(createRoute, /select\([^)]*encrypted_secret/);
  assert.doesNotMatch(credentialRoute, /\.select\([^)]*encrypted_secret/);
  assert.match(migration, /revoke all on function public\.create_ai_provider_atomic/);
  assert.match(migration, /grant execute[\s\S]*service_role/);
});
