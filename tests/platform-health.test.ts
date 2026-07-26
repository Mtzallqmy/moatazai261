import assert from "node:assert/strict";
import test from "node:test";
import { buildPlatformHealthSummary } from "../services/platform-health";

const healthy = {
  databaseOk: true,
  storageOk: true,
  chatRuns: 10,
  chatFailures: 0,
  failedJobs: 0,
  ragRuns: 5,
  ragFailures: 0,
  providers: [{ enabled: true, name: "OpenRouter", health_status: "healthy", circuit_state: "closed" }],
  mcp: [],
};

test("platform health is operational when dependencies are healthy", () => {
  const result = buildPlatformHealthSummary(healthy);
  assert.equal(result.status, "operational");
  assert.equal(result.score, 100);
  assert.deepEqual(result.issues, []);
});

test("platform health reports critical provider and database failures", () => {
  const result = buildPlatformHealthSummary({
    ...healthy,
    databaseOk: false,
    providers: [{
      enabled: true,
      name: "OpenRouter",
      health_status: "unavailable",
      circuit_state: "open",
      last_error_code: "RATE_LIMITED",
    }],
  });
  assert.equal(result.status, "outage");
  assert.ok(result.score < 100);
  assert.ok(result.issues.some((issue) => issue.code === "DATABASE_UNAVAILABLE"));
  assert.ok(result.issues.some((issue) => issue.code === "PROVIDER_UNAVAILABLE"));
});

test("disabled providers do not degrade platform health", () => {
  const result = buildPlatformHealthSummary({
    ...healthy,
    providers: [{ enabled: false, name: "Disabled", health_status: "unavailable", circuit_state: "open" }],
  });
  assert.equal(result.status, "operational");
});

test("chat, RAG and background failures produce actionable warnings", () => {
  const result = buildPlatformHealthSummary({
    ...healthy,
    chatRuns: 20,
    chatFailures: 4,
    failedJobs: 2,
    ragRuns: 10,
    ragFailures: 2,
  });
  assert.equal(result.status, "degraded");
  assert.ok(result.issues.some((issue) => issue.href === "/admin/jobs"));
  assert.ok(result.issues.some((issue) => issue.href === "/admin/rag-diagnostics"));
  assert.ok(result.issues.some((issue) => issue.code === "CHAT_ERROR_RATE_HIGH"));
});
