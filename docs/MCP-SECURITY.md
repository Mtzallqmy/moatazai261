# MCP security

MCP servers are administrative integrations. Credentials are encrypted with AES-256-GCM and context-bound to the server record. APIs expose only a key hint.

Controls:

- HTTP and SSE endpoints require HTTPS in production.
- URL credentials are rejected.
- literal and DNS-resolved loopback, private, link-local, reserved, and metadata addresses are rejected;
- every redirect is checked again and redirect count is bounded;
- connection and tool calls have abort signals and timeouts;
- tools are disabled after discovery until explicitly allowed;
- an agent receives only its allowed tools;
- tool arguments are validated against the registered schema;
- results are size-bounded, normalized, and secret-redacted;
- administrative changes and tests are written to audit logs.

`stdio` MCP is not executed by the serverless web application. It requires a separately managed worker with a command allowlist, filesystem isolation, resource ceilings, and no inherited platform secrets.

Enabling private endpoints requires `ALLOW_PRIVATE_PROVIDER_URLS=true` and is suitable only for a controlled network. An outbound proxy with destination policy is recommended for the strongest DNS-rebinding and egress guarantees.
