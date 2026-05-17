# LLM/TTS router replacing knoway — verification

Verification artifacts for the in-process router. Scope tracked against
`docs/plans/2026-05-15-001-feat-llm-tts-router-replacing-knoway-plan.md`.

## Coverage status

| User path | Code wired | Has fresh evidence |
|---|---|---|
| chat completions happy (router → OpenRouter) | ✅ | ✅ commit `3a88f4225`, 2026-05-15 |
| chat completions fallback (key/upstream exhaustion) | ✅ | ❌ unit-test only, needs real-wire run |
| TTS speech (Azure) via `routeTts` | ✅ | ⏳ pending (was knoway-fetch until 2026-05-15) |
| TTS speech (dashscope-cosyvoice) via `routeTts` | ✅ | ⏳ pending |
| TTS speech (Volcengine) via `routeTts` | ✅ | ⏳ pending |
| `/audio/voices` from adapter catalog (no upstream) | ✅ | ⏳ pending (sanity curl) |
| `/livez` | ✅ | ✅ commit `cfad87757`, 2026-05-15 |
| `/readyz` | ✅ | ✅ commit `cfad87757`, 2026-05-15 |

The TTS paths and `/audio/voices` were missing from the prior revision of
this doc (which claimed `shipped across U1-U9` while the route handlers
were still hitting `GATEWAY_BASE_URL`). The router-side wiring landed
2026-05-15; the table above tracks the real evidence backlog so the doc
stops asserting completion ahead of measurement.

## E2E: chat completion through router service

- **Scenario**: operator seeds `LLM_ROUTER_CONFIG` with one OpenRouter LLM
  upstream, then invokes the router directly to call OpenRouter for a chat
  completion. Validates envelope decrypt → configKV load → key rotation →
  upstream fetch → response parse on the real wire path.
- **Command** (admin endpoint replaced the seed script on 2026-05-18; the
  2026-05-15 evidence below was captured with the now-removed
  `scripts/seed-router-config.ts`):
  ```bash
  # 1. seed via the admin endpoint — requires an account whose email is in
  #    ADMIN_EMAILS and is verified.
  curl -sS -X POST http://localhost:3000/api/admin/config/router \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "mode": "merge",
      "slices": [{
        "kind": "openrouter",
        "modelName": "chat-default",
        "overrideModel": "openai/gpt-4o-mini",
        "plaintextKey": "<OPENROUTER_KEY>"
      }],
      "defaults": { "chatModel": "chat-default" }
    }' | jq

  # 2. exercise the router via the in-process e2e harness.
  cd apps/server
  pnpm exec dotenvx run --env-file=.env.local -- \
    tsx scripts/e2e-llm-router.ts
  ```
- **Expected output**: `status 200`, JSON body with `choices[0].message.content`
  populated, and `E2E PASS — router service successfully called OpenRouter
  and returned a usable response.`
- **Actual output** (commit `3a88f4225`, 2026-05-15):
  ```
  → calling router.route() with model=chat-default
    fetch → POST https://openrouter.ai/api/v1/chat/completions
    auth   = Bearer sk-or-v1-bb1a38505a7309...
    body   = {"messages":[{"role":"user","content":"Say \"hello world\" in exactly 3 words, no period."}],"max_tokens":20,"model":"openai/gpt-4o-mini"}
  ← status 200 (2958ms)

  Assistant response:
    model:  openai/gpt-4o-mini
    text:   "hello world!"
    tokens: prompt=21 completion=3

  E2E PASS — router service successfully called OpenRouter and returned a usable response.
  ```
- **Environment**: commit `3a88f4225`, local dev (Node 26, pnpm 10, Postgres
  + Redis via local services), Hono 4.11.3, `.env.local` with a generated
  32-byte base64 `LLM_ROUTER_MASTER_KEY`.
- **Last verified**: 2026-05-15.

## Liveness probe

- **Scenario**: `GET /livez` returns 200 with `{status: "live"}` even
  when external dependencies are degraded. K8s-style flat naming; legacy
  `/health` and nested `/healthz/live` removed in this revision.
- **Command**: `curl -i http://localhost:3000/livez`
- **Expected output**: HTTP 200, body `{"status":"live"}`.
- **Actual output** (commit `cfad87757` + uncommitted route rename, 2026-05-15):
  ```
  HTTP 200
  {"status":"live"}
  ```
  Cross-check: `curl http://localhost:3000/health` → HTTP 404 (legacy
  endpoint removed); `curl http://localhost:3000/healthz/live` → HTTP 404
  (nested form removed).
- **Last verified**: 2026-05-15.

## Readiness probe

- **Scenario**: `GET /readyz` returns 200 when Postgres + Redis both
  respond; 503 otherwise. Gateway-internal key health does NOT block
  readiness (R14).
- **Command**: `curl -i http://localhost:3000/readyz`
- **Expected output**: HTTP 200, body `{"status":"ready","checks":{"db":"ok","redis":"ok"}}`.
- **Actual output** (commit `cfad87757` + uncommitted route rename, 2026-05-15):
  ```
  HTTP 200
  {"status":"ready","checks":{"db":"ok","redis":"ok"}}
  ```
- **Last verified**: 2026-05-15.

## Test suite

- **Scenario**: full unit-test suite for router-touched modules.
- **Command**: `pnpm -F @proj-airi/server exec vitest run`
- **Expected output**: green run; 91+ tests covering envelope-crypto, env,
  config-kv, llm-router/{router,key-rotator,config-loader,error-mapping},
  tts-adapters, routes/openai/v1.
- **Actual output** (commit `3a88f4225`, 2026-05-15): 91 tests across 8 files
  green; `pnpm -F @proj-airi/server typecheck` exits 0.
- **Last verified**: 2026-05-15.

## Known limitations / follow-up

- **U9 admin HTTP endpoint**: partially shipped 2026-05-18 as
  `POST /api/admin/config/router` (see `routes/admin/config/router/index.ts`).
  Covers the write path with audit-log fields on the structured logger,
  envelope encryption in-process, and cross-instance invalidation publish.
  The plan's ETag-based optimistic concurrency control and HMAC-signed
  invalidate payload are still deferred; the `config_write` and
  `config_invalid_hmac` counters described below remain producerless until
  those land.
- ~~**GATEWAY_BASE_URL**: still required in env schema~~. Resolved
  2026-05-15: env entry removed, all routes go through `llmRouter.route` /
  `routeTts` / `listTtsVoices`. The `LLM_ROUTER_MASTER_KEY` env var is
  now required (no graceful skip).
- ~~**Grafana dashboard JSON updates**: the new `airi.gen_ai.gateway.*`
  counters … do not yet have panels for them~~. Partially resolved
  2026-05-16: `otel/grafana/dashboards/build.ts` generates three router
  rows (Health / Trends / Admin Plane) covering the 7 gateway counters
  that have live producers: `fallback_count`, `upstream_errors`,
  `key_exhausted`, `same_status_exhaustion`, `decrypt_failures`,
  `config_reload`, and `subscriber_state` (producer added in the same
  PR — `app.ts` now emits `connected` / `error` / `reconnecting` from the
  `configkv:invalidate` subscriber). The remaining two counters
  (`config_write`, `config_invalid_hmac`) intentionally have no panels
  because their producer is the ETag + HMAC slice of the U9 admin
  endpoint that has not shipped (see the U9 entry above); they will
  rejoin Rows 6.5 / 6.7 when that slice lands.
  Alert rules (key.exhausted > 0, fallback ratio > 30%, single-key
  error ratio > 80%) are still configured through Grafana UI, not
  build.ts — IaC-ifying them is a separate follow-up.
- **knoway compose retention**: keep `/Users/luoling8192/Git/proj-airi/airi-railway/knoway/`
  + the corresponding container entry in `airi-railway/docker-compose.yml`
  for **at least 14 days without a P1+ incident** before removing per plan R18.
