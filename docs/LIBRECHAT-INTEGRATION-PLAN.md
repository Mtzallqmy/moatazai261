# LibreChat integration plan

## 1. Current platform assessment

The platform is a Next.js 16.2 App Router application using React 19, strict TypeScript, Supabase Auth/PostgreSQL/Storage, server-side authorization helpers, and versioned Route Handlers under `/api/v1`. It is not a LibreChat fork.

Current production domains are separated from source and secret configuration. Authentication uses Supabase SSR clients, cookie-based sessions, OAuth callback handling, and permission-code checks. The database already contains RBAC, profiles, providers, encrypted credentials, models, conversations, messages, chat runs, usage records, files, processing jobs, file chunks with pgvector, content, audit logs, and Storage policies.

Existing provider adapters cover OpenAI-compatible providers, Anthropic, Gemini, Cohere, Azure-compatible endpoints, and a Bedrock extension point. Chat is streamed as SSE through a Next.js Route Handler. Provider credentials use AES-GCM on the server. Model capabilities are stored in PostgreSQL and validated before a request.

Known gaps before this integration:

- The chat UI lacks complete rename/archive/pin/search/branch/regenerate APIs.
- Quota checks are read-before-write and need an atomic reservation RPC.
- Provider health lacks durable connection-test history and circuit-breaker state.
- BYOK exists in the schema but is not resolved by the runtime credential service.
- File extraction is complete only for safe inline text formats; rich document extraction requires a worker.
- General background jobs are persisted, but a worker deployment is not part of the web runtime.
- RAG supports pgvector and hybrid-search foundations, but reranking and citation persistence need completion.
- MCP supports safe HTTP/SSE discovery; `stdio` is intentionally unavailable in the serverless web runtime.
- Rate limiting is an interface without a configured distributed store.
- Markdown, math, Mermaid, and artifact rendering require isolated renderers before enablement.

## Implementation status

The additive database phases in this plan were applied to the connected Supabase project on 2026-07-26:

- `agentic_rag_mcp_foundation`
- `librechat_runtime_hardening`
- `distributed_rate_limits`
- `agentic_schema_advisor_hardening`

Implemented paths include encrypted central credentials and BYOK resolution, provider health/circuit state,
atomic quota reservations, hashed distributed rate limits, durable message branches and versions, PostgreSQL
full-text search, signed file access, knowledge-base file attachment, persisted retrieval diagnostics and
citations, versioned agent execution, MCP discovery/execution, tool permission/schema enforcement, reviewed
memory, bounded CSV/JSON profiling, and protected health dashboards.

Rich binary document extraction, OCR, transcription, video processing, unrestricted web research, and raw
HTML/React artifact execution remain disabled until their isolated worker or sandbox dependencies are
deployed. The application does not present those capabilities as active.

## 2. LibreChat components selected as references

LibreChat v0.8.7 is an MIT-licensed monorepo with an Express backend, React client, MongoDB-oriented data layer, endpoint configuration, generation job management, agents, MCP, tools, file search, artifacts, web search, and extensive deployment configuration.

The following patterns are useful:

- Endpoint/provider configuration with optional capabilities.
- Custom OpenAI-compatible endpoints and model discovery.
- Durable generation/run identity, abort, retry, and readiness behavior.
- Message resubmission, forks, and conversation branching.
- Agent versions, allowed tools, skills, and human approval gates.
- MCP discovery, explicit trust, per-server permissions, and SSRF controls.
- File citations and scoped file search.
- Presets, prompts, and versioned instructions.
- Usage transactions and balance/quota tracking.
- Search-provider, scraper, and reranker separation.
- Artifact isolation and strict content security boundaries.
- Startup validation, readiness checks, metrics, and redacted logging.

## 3. Mapping

| LibreChat concept | Platform destination | Adaptation |
| --- | --- | --- |
| Endpoint configuration | `ai_providers`, `ProviderRegistry`, provider adapters | PostgreSQL + Zod; no YAML runtime source of truth |
| Custom endpoints | `ai_providers.base_url`, encrypted credentials | Server-only validation and SSRF guard |
| Model specs | `ai_models`, capability matrix | Database-managed and admin-editable |
| Generation jobs | `chat_runs`, `agent_runs`, `background_jobs` | Supabase persistence and idempotency |
| Message forks | `message_versions`, `message_branches` migration | Parent/branch relations without rewriting history |
| Agents | `agents`, `agent_versions`, `agent_tools`, `agent_runs` | Permission codes and immutable versions |
| MCP | `mcp_servers`, `mcp_tools`, `McpRouter` | HTTP/SSE in web runtime; encrypted credentials |
| Tools | `ToolRegistry`, `tool_permissions`, tool execution records | Zod/JSON Schema validation and allowlists |
| File search | existing `files` + `file_chunks` | pgvector, RLS, hybrid search, signed URLs |
| Web search | `SearchProvider` registry | No unrestricted scraping |
| Presets/prompts | new versioned PostgreSQL entities | RLS and audit logs |
| Memory | `user_memories`, `conversation_memories` | Opt-in, reviewable, secret-redacted |
| Artifacts | `generated_ui_blocks` and sandboxed artifact records | No raw script execution in the application DOM |
| Usage transactions | atomic quota RPC + `provider_usage_records` | PostgreSQL transaction semantics |
| Metrics/readiness | `/api/v1/admin/health` | Redacted, permission-protected data |

## 4. Features to rebuild

1. Durable provider tests, capability resolution, retries, fallback, and circuit breaker.
2. Atomic quota reservation/finalization.
3. Message versions, branches, regeneration, and idempotent chat runs.
4. Conversation and message full-text search with ownership filters.
5. Versioned agents, tools, MCP, prompts, presets, and memories.
6. Worker-compatible file processing and pgvector retrieval.
7. Citation persistence and token-aware context assembly.
8. Health, usage, cost, job, and RAG diagnostics dashboards.
9. Structured, redacted logging and normalized errors.
10. Secure artifact and generative-UI registries.

## 5. Exclusions

- LibreChat's MongoDB models and Meilisearch are excluded; PostgreSQL FTS and pgvector are used.
- Its Express server and SPA routing are excluded; Next.js App Router remains authoritative.
- Its branding, visual assets, and page layouts are excluded.
- Its code interpreter is excluded until a real isolated sandbox service is configured.
- Unrestricted web scraping is excluded.
- `stdio` MCP is excluded from serverless deployment; it can be enabled only in a separately managed worker.
- MongoDB migration scripts, Docker topology, and balance scripts are not copied.

## 6. Database changes

Additive migrations will extend existing tables and create only missing entities:

- provider connection tests, health state, and circuit-breaker fields;
- message versions/branches, prompt and preset versions, tool executions;
- atomic quota reservations;
- FTS indexes for conversations, messages, and file chunks;
- existing agent, MCP, memory, RAG, citation, and background-job foundations;
- RLS policies and explicit grants for every exposed table.

No destructive rename, type conversion, or table replacement is permitted.

## 7. API changes

Keep `/api/v1/chat`, `/api/v1/conversations`, `/api/v1/files`, and current admin endpoints backward compatible. Add resource routes for message branching, search, prompts, presets, usage, tools, agent runs, MCP tests, and health. Every write route requires schema validation, authenticated authorization, request IDs, idempotency where applicable, and audit records.

## 8. Security changes

- Extend server-only AES-256-GCM context binding to provider, BYOK, and MCP secrets.
- Reject unsafe schemes, credentials in URLs, private/link-local/metadata destinations, and unsafe redirects.
- Require explicit permission codes for all administration.
- Add atomic quota reservations and concurrent-run protection.
- Redact authorization headers, cookies, tokens, secrets, and private content from logs.
- Keep artifacts isolated; never render model-generated JavaScript in the application DOM.
- Require signed, short-lived URLs for private files.

## 9. Migration and rollback

Migrations are append-only and ordered. Each migration uses `if not exists` where safe, separate constraints/indexes, and RLS before client grants. Rollback is performed by disabling the new feature flags and API entry points first; database entities remain compatible and can be removed only after confirming no dependent records. The four additive migrations listed above were applied and verified with security and performance advisors.

## 10. Test plan

- Unit: adapters, capabilities, encryption, error normalization, token budgets, RRF, citations, memory redaction, structured UI, SSRF.
- Integration: provider test, chat streaming, abort, idempotency, fallback, agent/tool execution, MCP inspection.
- Database: migrations, ownership RLS, admin permission RLS, credential denial, atomic quota races, search isolation.
- Files: MIME/signature validation, unsafe extension rejection, processing states, chunk ownership.
- Build: lint, strict TypeScript, tests, production build, secret scan.

## 11. Risks and mitigations

- Provider response differences: adapter-level normalization and capability gates.
- Long-running work in serverless requests: persistent jobs and external worker contract.
- DNS rebinding: deny private address classes, validate redirects, and require an egress proxy for high-risk custom endpoints.
- Migration drift: compare the remote migration ledger before applying.
- Partial provider success with failed persistence: durable run state and reconciliation records.
- Cost overruns: atomic reservations, timeout, step, token, and cost ceilings.

## 12. Execution order

1. Inventory and licensing.
2. Shared security and error contracts.
3. Provider runtime and atomic quotas.
4. Message versions, branches, and search.
5. Files and RAG completion.
6. Agents, tools, MCP, prompts, presets, and memory.
7. Admin and user UI connections.
8. Tests, documentation, PR, and deployment instructions.

## 13. Planned file groups

- `providers/*`, `services/*`, `features/providers/*`
- `features/chat/*`, `features/rag/*`, `features/agents/*`
- `features/tools/*`, `features/mcp/*`, `features/memory/*`
- `app/api/v1/*`, `components/*`
- `supabase/migrations/*`, `tests/*`, `docs/*`
- `.env.example`, CI workflow, and security configuration

## 14. Acceptance criteria

- No provider secret is returned by any client API or written to logs.
- Normal users cannot access admin, other users' conversations, files, memories, runs, or credentials.
- Unsupported model capabilities fail before contacting a provider.
- Chat streams incrementally, is cancellable, and is idempotent.
- Usage reservation is atomic and finalized exactly once.
- Provider and MCP tests originate on the server and persist redacted results.
- RAG citations map to owner-accessible sources.
- All new UI controls call real authorized APIs.
- `npm install`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` succeed before the PR is opened.
