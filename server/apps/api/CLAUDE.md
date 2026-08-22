# Server CLAUDE.md

Agent-facing guide for `server/apps/api`.

## Overview

Hono-based Node.js resource API. The sibling `server/apps/auth` workspace app owns Better Auth, OIDC, sessions, and account lifecycle; this package owns billing, chat sync, LLM gateway forwarding, and business observability. **Multi-instance deployed on Railway** — design all features assuming N>1 instances sharing the same Postgres and Redis.

## Deployment Model

- Hosted on **Railway**, multiple instances behind a load balancer.
- Independent applications: `server/apps/api/src/main.ts` and `server/apps/auth/src/main.ts`. There is no runtime role CLI and neither app imports the other service graph.
- The API has no background polling loops or fire-and-forget tasks — every business write happens inside the request thread.
- Stateless per-instance: no local state that matters across requests.
- Cross-instance coordination via Redis Pub/Sub (WebSocket broadcast). DB-level idempotency (`(userId, requestId)` partial unique index on `flux_transaction`) covers retries.
- Rate limiting is currently **in-memory** (not distributed) — keep this in mind when adding rate-sensitive features.

## Tech Stack

Hono, Drizzle ORM, PostgreSQL, Redis, Stripe, OpenTelemetry, Valibot, injeca (DI), tsx. Better Auth lives only in `server/apps/auth`.

## Commands

```sh
pnpm -F @proj-airi/api-server dev                # dev with dotenvx (.env.local)
pnpm -F @proj-airi/api-server typecheck
pnpm -F @proj-airi/api-server exec vitest run    # all server tests
pnpm exec vitest run server/apps/api/src/...     # single test file
pnpm -F @proj-airi/api-server db:generate        # drizzle-kit generate
pnpm -F @proj-airi/api-server db:push            # drizzle-kit push
pnpm -F @proj-airi/auth-server auth:generate # better-auth → server/packages/auth-shared/src/schema.ts
```

Local observability is maintained in `proj-airi/airi-railway`; run its `otel/docker-compose.yaml` stack.

## Architecture Summary

**Entry & DI**: `server/apps/api/src/main.ts` → `src/server.ts` → `src/app.ts`; `server/apps/auth/src/main.ts` → `src/server.ts`. The workspace apps have separate package manifests, env schemas, Dockerfiles, and composition roots.

**Layering**:
- **Routes** (`src/routes/`): thin — param validation (Valibot), auth guards, error mapping. No business logic here.
- **Services** (`src/services/`): core business logic and DB transactions.
- **Schemas** (`src/schemas/`): Drizzle table definitions. Drizzle loads migrations from `drizzle/` at startup.

**Middleware chain** (`/api/*`): CORS → hono/logger → optional otel → sessionMiddleware → bodyLimit(1MB) → per-route guards. WebSocket `/ws/chat` registered before bodyLimit.

**Error model**: `ApiError(statusCode, errorCode, message, details)` in `src/utils/error.ts`.

## Key Design Decisions

- **Flux read/write separation**: `FluxService` reads (Redis cache-aside), `BillingService` writes (single Postgres tx that mutates `user_flux` and writes the matching `flux_transaction` ledger row). Never put write-balance logic in `flux.ts`.
- **No async billing pipeline**: debits and credits update balance + ledger in one transaction. The `(user_id, request_id)` partial unique index gives DB-level idempotency for retries; LLM `request log` rows are written best-effort right after the response is delivered.
- **In-process LLM/TTS router**: `/api/v1/openai` is dispatched by `services/domain/llm-router` reading `LLM_ROUTER_CONFIG` (per-model upstream chain + envelope-encrypted keys). `chat/completions` walks LLM upstreams with key fallback; `audio/speech` delegates to a TTS adapter (`azure` / `dashscope-cosyvoice` / `volcengine`); `audio/voices` returns the adapter's compiled-in catalog. Server handles auth/billing/logging, not model execution.
- **Redis is cache + pub/sub, not truth**: balance cache, app_settings read cache, WebSocket cross-instance pub/sub. Truth is always Postgres.
- **Auth boundary**: `server/apps/auth` owns Better Auth + OIDC. The API's `sessionMiddleware` validates Auth-issued JWTs and fills context but doesn't block; `authGuard` returns 401.
- **Multi-instance safe**: all writes go through Postgres transactions; cross-instance messaging uses Redis Pub/Sub. No async work or in-process singletons.
