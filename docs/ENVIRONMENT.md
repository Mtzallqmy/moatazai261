# Environment

## Browser-safe variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes for authentication/data features | Public project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes for authentication/data features | Publishable key protected by RLS |
| `NEXT_PUBLIC_SITE_URL` | Yes in production | Canonical application origin |
| `NEXT_PUBLIC_PASSWORD_AUTH_ENABLED` | Optional | Shows password authentication when the server setting also permits it |

No secret may use the `NEXT_PUBLIC_` prefix.

## Server-only variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | Yes for production runtime writes | Server-only administrative client |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy fallback | Compatibility only; prefer `SUPABASE_SECRET_KEY` |
| `PROVIDER_ENCRYPTION_KEY` | Yes before saving credentials | Base64-encoded 32-byte AES-256-GCM master key |
| `PLATFORM_OWNER_EMAILS` | Yes | Comma-separated owner allowlist |
| `ALLOW_PRIVATE_PROVIDER_URLS` | No; default `false` | Explicitly permits private endpoints only in controlled deployments |
| `MAX_UPLOAD_BYTES` | No | Server-side upload ceiling |
| `PASSWORD_AUTH_ENABLED` | No | Enables password login on the server |
| `ALLOWED_ORIGINS` | Yes in production | Comma-separated CORS origins |

`PROVIDER_ENCRYPTION_KEY` is not an API key and must be backed up separately. Rotation requires decrypting with the old key version and re-encrypting with a new version; never overwrite it before rotation completes.

## Feature switches

`AI_CHAT_ENABLED`, `FILE_UPLOADS_ENABLED`, `CONTENT_EDITOR_ENABLED`, `TELEGRAM_INTEGRATION_ENABLED`, and `SCHEDULED_PUBLISHING_ENABLED` accept `true` or `false`.

## Deployment rules

- Configure secrets in the hosting environment, never in Git.
- Preview environments must use a non-production database or restricted credentials.
- The service-role secret and encryption key must never appear in client bundles, logs, screenshots, build output, or support messages.
- Custom provider and MCP endpoints are resolved and checked against private, loopback, link-local, and metadata networks unless the explicit private-endpoint switch is enabled.
