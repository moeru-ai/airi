# Server CLAUDE.md

Agent-facing guide for `apps/server`. Detailed topic docs live in `docs/ai-context/` — read the relevant file before modifying that area.

## Overview

Hono-based Node.js backend. Owns auth, billing, chat sync, LLM gateway forwarding, and observability. **Multi-instance deployed on Railway** — design all features assuming N>1 instances sharing the same Postgres and Redis.

## Deployment Model

- Hosted on **Railway**, multiple instances behind a load balancer.
- Single CLI role: `api` (see `src/bin/run.ts`). No background polling loops, no fire-and-forget tasks — every write happens inside the request thread.
- Stateless per-instance: no local state that matters across requests.
- Cross-instance coordination via Redis Pub/Sub (WebSocket broadcast). DB-level idempotency (`(userId, requestId)` partial unique index on `flux_transaction`) covers retries.
- Rate limiting is currently **in-memory** (not distributed) — keep this in mind when adding rate-sensitive features.

## Tech Stack

Hono, Better Auth (OIDC provider, RS256 JWT), Drizzle ORM, PostgreSQL, Redis, Stripe, OpenTelemetry, Valibot, injeca (DI), tsx.

## Commands

```sh
pnpm -F @proj-airi/server dev                # dev with dotenvx (.env.local)
pnpm -F @proj-airi/server typecheck
pnpm -F @proj-airi/server exec vitest run    # all server tests
pnpm exec vitest run apps/server/src/...     # single test file
pnpm -F @proj-airi/server db:generate        # drizzle-kit generate
pnpm -F @proj-airi/server db:push            # drizzle-kit push
pnpm -F @proj-airi/server auth:generate      # better-auth → src/schemas/accounts.ts
```

Local observability: `docker compose -f apps/server/docker-compose.otel.yml up -d`

## Architecture Summary

**Entry & DI**: `src/app.ts` (`createApp()`) → logger, env, OTel, Postgres/Redis, DB migrations, services via `injeca`, routes/middleware. CLI entry `src/bin/run.ts`.

**Layering**:
- **Routes** (`src/routes/`): thin — param validation (Valibot), auth guards, error mapping. No business logic here.
- **Services** (`src/services/`): core business logic and DB transactions.
- **Schemas** (`src/schemas/`): Drizzle table definitions. Migrations in `@proj-airi/server-schema`.

**Middleware chain** (`/api/*`): CORS → hono/logger → optional otel → sessionMiddleware → bodyLimit(1MB) → per-route guards. WebSocket `/ws/chat` registered before bodyLimit.

**Error model**: `ApiError(statusCode, errorCode, message, details)` in `src/utils/error.ts`.

## Key Design Decisions

- **Flux read/write separation**: `FluxService` reads (Redis cache-aside), `BillingService` writes (single Postgres tx that mutates `user_flux` and writes the matching `flux_transaction` ledger row). Never put write-balance logic in `flux.ts`.
- **No async billing pipeline**: debits and credits update balance + ledger in one transaction. The `(user_id, request_id)` partial unique index gives DB-level idempotency for retries; LLM `request log` rows are written best-effort right after the response is delivered.
- **LLM gateway proxy**: `/api/v1/openai` forwards to `GATEWAY_BASE_URL`. Server handles auth/billing/logging — not model execution.
- **Redis is cache + pub/sub, not truth**: balance cache, app_settings read cache, WebSocket cross-instance pub/sub. Truth is always Postgres.
- **Auth**: Better Auth + OIDC. `sessionMiddleware` fills context but doesn't block; `authGuard` returns 401.
- **Multi-instance safe**: all writes go through Postgres transactions; cross-instance messaging uses Redis Pub/Sub. No async work, no in-process singletons — admin flux grants happen synchronously inside the POST that triggered them.

## Detailed Context Docs

See `docs/ai-context/README.md` for the full index. Key files:
- `architecture-overview.md` — entry, DI, assembly, boundaries
- `transport-and-routes.md` — API surface, route→service mapping
- `data-model-and-state.md` — tables, state ownership, caching
- `billing-architecture.md` — Flux/Stripe ledger
- `redis-boundaries-and-pubsub.md` — Redis key/channel boundaries
- `auth-and-oidc.md` — auth flows, OIDC, trusted clients
- `config-and-naming-conventions.md` — configKV, naming rules
- `workers-and-runtime.md` — single `api` role, no background loops, no fire-and-forget; everything is synchronous in-request
- `admin-flux-grants.md` — synchronous one-shot flux grant endpoint (no batch tables, no state machine)
- `observability-conventions.md` — OTel naming, custom attributes
