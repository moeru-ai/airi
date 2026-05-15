# LLM/TTS router replacing knoway — verification

Verification artifacts for the in-process router shipped across U1-U9 of
`docs/plans/2026-05-15-001-feat-llm-tts-router-replacing-knoway-plan.md`.

## E2E: chat completion through router service

- **Scenario**: operator seeds `LLM_ROUTER_CONFIG` with one OpenRouter LLM
  upstream, then invokes the router directly to call OpenRouter for a chat
  completion. Validates envelope decrypt → configKV load → key rotation →
  upstream fetch → response parse on the real wire path.
- **Command**:
  ```bash
  cd apps/server
  pnpm exec dotenvx run --env-file=.env.local -- \
    tsx scripts/seed-router-config.ts \
      --openrouter-key '<OPENROUTER_KEY>' \
      --openrouter-model openai/gpt-4o-mini \
      --default-chat-model chat-default
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

- **U9 admin HTTP endpoint**: bootstrap currently goes through the
  `scripts/seed-router-config.ts` CLI. The plan's full HTTP admin endpoint
  with ETag + audit log + HMAC publish is deferred; tracked in plan U9.
- **GATEWAY_BASE_URL**: still required in env schema. The chat completions
  route reads it for the legacy knoway fall-through path when `llmRouter`
  is `null`. Remove once all deployments have rotated in
  `LLM_ROUTER_MASTER_KEY` and `LLM_ROUTER_CONFIG`.
- **Grafana dashboard JSON updates**: the new `airi.gen_ai.gateway.*`
  counters are emitted from `apps/server/src/otel/index.ts` but the
  Grafana dashboard JSON in `otel/grafana/dashboards/` does not yet have
  panels for them. Plan U8 panel + alert work is deferred to a follow-up.
- **knoway compose retention**: keep `/Users/luoling8192/Git/proj-airi/airi-railway/knoway/`
  + the corresponding container entry in `airi-railway/docker-compose.yml`
  for **at least 14 days without a P1+ incident** before removing per plan R18.
