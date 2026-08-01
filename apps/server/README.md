# `@proj-airi/server`

Project AIRI's resource API. Authentication is a separate workspace app at
`apps/auth-server`; this package does not instantiate Better Auth or expose
auth/OIDC routes.

## Responsibilities

- Hono business APIs and WebSocket endpoints.
- Characters, chats, providers, Flux, Stripe, model routing, and billing.
- PostgreSQL migration ownership for the currently shared database.
- Redis cache, configuration KV, and cross-instance Pub/Sub.
- Local verification of Auth-issued OIDC JWTs through public JWKS.

## Run locally

```sh
pnpm -F @proj-airi/server dev
pnpm -F @proj-airi/server typecheck
pnpm -F @proj-airi/server exec vitest run
pnpm -F @proj-airi/server build
```

Run the authentication application separately:

```sh
pnpm -F @proj-airi/auth-server dev
```

## Service boundaries

- `AUTH_SERVER_URL` is the public issuer origin used for JWKS, issuer, and
  audience validation. With Caddy routing, it remains `https://api.airi.build`.
- `AUTH_INTERNAL_SECRET` authenticates the private `/internal/auth/*` contract
  shared with auth-server.
- Auth tables and principal types come from `@proj-airi/auth-shared`; no module
  under `apps/auth-server` is imported.
- `ADMIN_UI_URL` controls the standalone admin UI redirect and defaults to
  `https://admin.airi.build`.

For the complete extraction and Caddy boundary, see
[`docs/ai-context/auth-service-extraction.md`](docs/ai-context/auth-service-extraction.md).
