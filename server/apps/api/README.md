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

## Payment

`src/services/domain/payment` owns pack grant and `payment_order` rows.
CORE exposes `settle` and `deleteAllForUser`.

Checkout, package list, and session mapping live in the Stripe channel
at `src/routes/stripe`. Each provider keeps its own HTTP paths. Stripe
stays on `/api/v1/stripe/*`. CORE never sees a raw provider event.

- `settle` claims a pending order (`pending` to `paid`). One transaction
  writes `credited_at` and calls `creditFlux`. Replay returns `applied: false`.
- Pack snapshots (`pack_key`, `flux_amount`) live on the order row.
- The Stripe channel reads `FLUX_PACKS` and Stripe Price objects for
  display prices.
- `POST /api/v1/stripe/checkout` inserts the pending order, then creates
  the Checkout Session.
- `POST /api/v1/stripe/webhook` verifies the signature, maps the session
  to a `ClaimReceipt`, and calls `settle`.

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
