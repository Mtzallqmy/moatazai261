# Provider adapters

Every provider implements `AIProviderAdapter` and is registered in `ProviderRegistry`. Route Handlers never call vendor APIs directly.

Required operations:

- configuration validation;
- connection test;
- model listing;
- non-streaming completion;
- true streaming completion.

Optional operations are exposed only when implemented:

- Responses API;
- embeddings;
- image generation;
- transcription;
- text-to-speech;
- reranking;
- tool calling and structured output through the unified chat contract.

To add a provider:

1. Create an adapter under `providers/`.
2. Transform `UnifiedChatRequest` into the vendor request.
3. Normalize content, tool calls, usage, finish reason, latency, and errors.
4. Route all network calls through the guarded provider HTTP layer.
5. Declare conservative capabilities; unsupported capabilities must remain false.
6. Register the adapter and add the provider type to the Zod schema.
7. Add mock-server tests for discovery, completion, streaming, errors, timeout, and abort.
8. Configure the provider and encrypted credential from the admin dashboard.
9. Test the connection and a specific disabled model before making it visible.

OpenAI-compatible endpoints must not be assumed to implement every OpenAI feature. Model capability flags remain authoritative.

## Administration workflow

1. Select OpenAI, OpenRouter, or the OpenAI-compatible preset.
2. Review the normalized base URL and relative endpoints. The URL builder removes duplicate slashes and overlapping version segments such as `/v1/v1`.
3. Select exactly one authentication mode. Public headers cannot contain `Authorization`, cookies or other secrets.
4. Use **Test connection before save**. A draft test performs model discovery and a short non-streaming chat request.
5. Save the provider disabled. Failed external connectivity does not destroy a structurally valid draft.
6. Import discovered models, review their capability flags, and enable only the intended models.
7. Enable the provider only after a successful test made after its latest structural change.

Leaving a credential field blank during an update preserves the existing encrypted credential. The API returns only its masked hint. Central credentials can be created or rotated only by the platform owner.

## OpenRouter preset

- Base URL: `https://openrouter.ai/api/v1`
- Chat endpoint: `/chat/completions`
- Models endpoint: `/models`
- Authentication: `Authorization: Bearer <API_KEY>`
- Public attribution headers: `HTTP-Referer` and `X-Title`

## Network security

Production provider URLs must use HTTPS. Loopback, private, link-local, cloud-metadata and DNS-resolved private destinations are rejected. Redirect following is disabled. `ALLOW_PRIVATE_PROVIDER_URLS` must remain `false` in public deployments.
