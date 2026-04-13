# Server CLAUDE.md

Agent-facing guide for `apps/server`. Detailed topic docs live in `docs/ai-context/` — read the relevant file before modifying that area.

## Overview

Hono-based Node.js backend. Owns auth, billing, chat sync, LLM gateway forwarding, and observability. **Multi-instance deployed on Railway** — design all features assuming N>1 instances sharing the same Postgres and Redis.

## Deployment Model

- Hosted on **Railway**, multiple instances behind a load balancer.
- Each instance runs one CLI role: `api` or `billing-consumer` (see `src/bin/run.ts`).
- Stateless per-instance: no local state that matters across requests.
- Cross-instance coordination via Redis Pub/Sub (WebSocket broadcast) and Redis Streams (billing events).
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

- **Flux read/write separation**: `FluxService` reads (Redis cache-aside), `BillingService` writes (Postgres tx + Redis Stream XADD). Never put write-balance logic in `flux.ts`.
- **LLM gateway proxy**: `/api/v1/openai` forwards to `GATEWAY_BASE_URL`. Server handles auth/billing/logging — not model execution.
- **Redis is cache + messaging, not truth**: balance cache, app_settings read cache, WS cross-instance pub/sub, billing event streams. Truth is always Postgres.
- **Auth**: Better Auth + OIDC. `sessionMiddleware` fills context but doesn't block; `authGuard` returns 401.
- **Multi-instance safe**: all writes go through Postgres transactions; cross-instance messaging uses Redis Pub/Sub and Streams. No in-process singletons that hold mutable state across requests.

## Detailed Context Docs

See `docs/ai-context/README.md` for the full index. Key files:
- `architecture-overview.md` — entry, DI, assembly, boundaries
- `transport-and-routes.md` — API surface, route→service mapping
- `data-model-and-state.md` — tables, state ownership, caching
- `billing-architecture.md` — Flux/Stripe/outbox/Streams
- `redis-boundaries-and-pubsub.md` — Redis key/channel boundaries
- `auth-and-oidc.md` — auth flows, OIDC, trusted clients
- `config-and-naming-conventions.md` — configKV, naming rules
- `workers-and-runtime.md` — CLI roles, outbox, Streams consumer
- `observability-conventions.md` — OTel naming, custom attributes
