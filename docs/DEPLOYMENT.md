# Deployment

## Local

1. Copy `.env.example` to a local ignored environment file.
2. Configure a non-production Supabase project.
3. Install with `npm install`.
4. Apply migrations in timestamp order.
5. Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.
6. Start the production artifact and verify `/api/health`.

## Supabase

- Review the remote migration ledger before applying new migrations.
- Back up production before schema changes.
- Apply additive migrations through the Supabase migration workflow.
- The current required migration target is `agentic_schema_advisor_hardening` (`20260726023000` in source).
- Verify RLS, grants, Storage buckets, triggers, pgvector, and security advisors.
- Enable leaked-password protection in the Supabase Auth dashboard for production password login.
- Never paste the service-role secret into SQL, Git, browser configuration, or logs.

## Hosting

- Configure browser-safe variables and server-only secrets separately.
- Use Node 22 or the runtime defined by the project.
- Run the verified build command.
- Keep the official domain in Supabase Auth URL configuration and OAuth provider consoles.
- Verify database, Storage, provider, MCP, RAG, queue, and chat health from the protected health dashboard.

## Rollback

1. Disable the affected feature entry point.
2. Redeploy the last known-good application version.
3. Do not destructively roll back additive tables while records depend on them.
4. Release expired quota reservations and reconcile incomplete runs.
5. Preserve audit and failure records for diagnosis.

## Troubleshooting

- Authentication loops: verify the canonical site URL, allowed redirects, cookie origin, and OAuth callback.
- Provider failures: use the server-side connection test and inspect the redacted error code/circuit state.
- Empty model list: ensure provider and model are enabled and model discovery has completed.
- Queued files: deploy a processing worker; the web service only handles bounded inline extraction.
- RAG returns no evidence: verify the file is ready, chunks exist, embedding dimensions match, and the knowledge-base association is ready.
