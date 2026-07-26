# Product reference matrix

This platform remains an independent Next.js and Supabase product. External projects are used as architectural references, not copied applications.

## Selected patterns

| Reference | Pattern adopted | Platform implementation |
| --- | --- | --- |
| LibreChat | Multi-provider conversations, versioned agents, MCP/tool permissions, durable runs | Existing Provider Registry, Agent Run Manager, MCP Router, PostgreSQL records and permission codes |
| Open WebUI | Low-friction OpenAI-compatible connection setup, model discovery, tools and knowledge attached to agents | Provider presets, encrypted central/BYOK credentials, model import, curated agent starters |
| Vercel AI SDK | Provider-neutral request contracts, streaming and bounded multi-step tool execution | Internal unified request/response contracts and SSE route; no vendor lock-in introduced |
| Vercel MCP security guidance | Reviewable allowlists and protection from upstream tool-schema drift | Stored MCP tools remain disabled until reviewed; agent versions reference explicitly allowed tools |

## Product decisions

- A provider can be saved without a key and remains disabled. This supports staged configuration and trusted no-auth endpoints without pretending the connection works.
- A model is optional while an agent is a draft. Publishing an agent requires a real enabled model.
- Central credentials are owner-managed. Users may add isolated BYOK credentials without seeing platform secrets.
- Provider tests run from the server, discover models, execute a bounded chat request, persist latency and a redacted result, and never return the credential.
- OpenAI-compatible providers share protocol mechanics only. Capabilities remain model-specific and must be enabled explicitly.
- The chat interface exposes only enabled, visible models and active agents. Empty states direct the operator to the exact setup step.
- Rich binary extraction, arbitrary code execution and unrestricted web scraping are not marked active until isolated workers or sandboxes are deployed.

## Curated agent starters

The administrator can create real, versioned agents from six configuration starters:

- deep research;
- document analysis;
- bounded data analysis;
- software architecture;
- content studio;
- operations copilot.

The starters provide reviewed instructions and execution ceilings. They do not create mock agents or bypass the requirement for a real model, credential, permission and tool allowlist.

## Licensing

No source files, logos, datasets or visual assets were copied from the referenced applications. The implementation uses original code and the platform's existing identity. If source is later copied from a third party, its license and required notices must be reviewed before merge.
