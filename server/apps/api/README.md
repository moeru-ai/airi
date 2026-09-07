# `@proj-airi/api-server`

Project AIRI's resource API. Authentication is a separate workspace app at
`server/apps/auth`; this package does not instantiate Better Auth or expose
auth/OIDC routes.

## Responsibilities

- Hono business APIs and WebSocket endpoints.
- Characters, chats, providers, Flux, Stripe, model routing, and billing.
- PostgreSQL migration ownership for the currently shared database. Drizzle reads the checked-in `drizzle/` journal and SQL files at startup.
- Redis cache, configuration KV, and cross-instance Pub/Sub.
- Local verification of Auth-issued OIDC JWTs through public JWKS.

## Run locally

```sh
pnpm -F @proj-airi/api-server dev
pnpm -F @proj-airi/api-server typecheck
pnpm -F @proj-airi/api-server exec vitest run
pnpm -F @proj-airi/api-server build
```

Run the complete local backend from the repository root:

```sh
pnpm dev:backend
```

For source-level debugging, start `@proj-airi/api-server` and
`@proj-airi/auth-server` separately instead.

`server/docker-compose.yaml` exposes the local Caddy gateway at `http://localhost:6112` and keeps
the API and Auth container ports private.

## Service boundaries

- `AUTH_SERVER_URL` is Auth's canonical public issuer origin used for JWKS,
  issuer, and audience validation. It must exactly equal Auth's `PUBLIC_URL`.
- `/internal/auth/*` is reachable only on the deployment's trusted private
  network. The public edge must reject `/internal/*` and the API service must
  not have its own public ingress.
- `AUTH_SERVER_INTERNAL_URL` optionally sends JWKS fetches directly to Auth on
  the private network while issuer and audience remain `AUTH_SERVER_URL`.
- Auth tables and principal types come from `@proj-airi/auth-shared`; no module
  under `server/apps/auth` is imported.

## Railway

Deploy this as the Resource API Railway service with Config File Path
`/server/apps/api/railway.toml`; keep the service Root Directory at the
repository root because the Dockerfile copies shared workspace packages. The
config owns its Dockerfile, start command, `/readyz` healthcheck, and the
watch patterns for every copied build input.

Set `AUTH_SERVER_INTERNAL_URL` from Auth's Railway private domain. It is only
the private JWKS route; `AUTH_SERVER_URL` remains the public Auth issuer URL.
See [`server/README.md`](../../README.md#railway-deployment) for the complete
cross-service variable and migration contract.

## Responses gateway

`POST /api/v1/openai/responses` supports stateless Responses creation in JSON and SSE form. It uses the same authentication, per-user generation rate limit, alias catalog, and Flux debit transaction as Chat Completions.

Enable the protocol on each compatible `LLM_ROUTER_CONFIG.llm.models[model].upstreams[]` entry:

```json
{
  "baseURL": "https://api.openai.com/v1",
  "protocols": ["chat-completions", "responses"],
  "overrideModel": "your-model",
  "keys": [{ "id": "key-id", "ciphertext": "existing-encrypted-key" }]
}
```

Omitting `protocols` means Chat Completions only. Responses requests skip upstreams that do not declare support. Alias and key fallback finish before the gateway starts forwarding the accepted response. A stream failure does not start another upstream request.

The gateway maps `usage.input_tokens` and `usage.output_tokens` to the existing Flux token policy. If usage is absent, it uses `FLUX_PER_REQUEST`. A completed response gets one debit request ID. Failed, incomplete, cancelled, and truncated streams do not charge. Each SDK tool step is a separate HTTP request and is billed separately. This endpoint retains the existing balance-check and debit policy; it does not reserve Flux before generation.

The endpoint accepts full text, image, file-data, reasoning, function-call, and function-output Items. It forwards native SSE JSON and event names. It supports local function tools and common generation controls. It forces `store: false` and rejects provider-side conversation references, background jobs, and hosted tools with separate provider charges. It does not expose response retrieval, deletion, or a separate search service.

The provider settings catalog can select Responses for OpenAI, OpenAI Compatible, and the official provider. The official provider defaults to Chat Completions until the user selects Responses. This code change does not update live router configuration.
