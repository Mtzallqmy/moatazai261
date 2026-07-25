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
