# Moataz AI 26

Production-oriented foundation for an Arabic/English multi-provider AI and content platform. The first two phases establish the application architecture, provider abstraction, Supabase authentication, PostgreSQL schema, RBAC permissions, RLS policies, storage rules, and protected route groups.

## Local setup

1. Use Node.js 22 or newer and run `npm ci`.
2. Copy `.env.example` to `.env.local` and set the public Supabase URL and publishable key.
3. Apply migrations from `supabase/migrations` through the Supabase CLI or migration connector.
4. Configure OAuth redirect URLs as described in `docs/`.
5. Run `npm run dev`.

The service-role key, encryption keys, OAuth secrets, and provider keys are server-only. Never prefix them with `NEXT_PUBLIC_`.

## Quality gates

`npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` are required. GitHub Actions runs the same gates on pushes and pull requests.

## Feature status

Unfinished capabilities are disabled through explicit feature flags. The application never presents a placeholder operation as successful. Full chat, article editing, Telegram integration, and scheduled publishing intentionally remain outside these phases.
