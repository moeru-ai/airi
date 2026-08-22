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
- The Stripe channel reads `FLUX_PACKS` through payment CORE and Stripe Price
  objects for display prices.
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

- `@proj-airi/api-server` (this package): listens on `PORT=3000` (local `https://localhost:3000` or via Caddy edge at `https://dev.airi.moeru.ai/api/v1`).
- `@proj-airi/auth-server`: listens on `PORT=3001` (local `https://localhost:3001` or via Caddy edge at `https://dev.airi.moeru.ai/api/auth`).
- `server/dev/caddy`: terminates HTTPS on `dev.airi.moeru.ai` with local mkcert certificates, routing `/api/auth/*` to auth and everything else to api.
- `server/docker-compose.yaml`: starts Postgres and Redis.
- `pnpm dev:backend` at the repo root starts Caddy and the containers, then runs both servers under `dotenvx` with `.env.local`.

## Configuration

Environment variables are validated with Valibot in `src/libs/env.ts`.

Key variables:

- `DATABASE_URL`: PostgreSQL connection string.
- `REDIS_URL`: Redis connection string.
- `AUTH_JWKS_URL`: URL to fetch the Auth service's public JWKS for OIDC JWT verification (defaults to `http://127.0.0.1:3001/api/auth/jwks`).
- `AUTH_ISSUER`: Expected `iss` claim on incoming JWTs (defaults to `http://127.0.0.1:3001/api/auth`).
- `PORT`: HTTP port (defaults to 3000).
- `HOST`: Bind host (defaults to `0.0.0.0`).
