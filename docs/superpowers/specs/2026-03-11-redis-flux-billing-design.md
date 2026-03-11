# Redis-Cached Flux Billing with Usage Log Aggregation

**Date:** 2026-03-11
**Status:** Approved
**Scope:** `apps/server` — FluxService, request billing, usage logging

## Problem

Every API request triggers 3-5 database queries against the `user_flux` table:

1. `getFlux()` — SELECT to check balance
2. `consumeFlux()` — SELECT (inside getFlux) + UPDATE to deduct
3. On failure: `addFlux()` — SELECT + UPDATE to refund

All UPDATE operations hit the same row per user (hot row contention). At high QPS this serializes on row locks and overwhelms the database.

## Solution

Combine two industry patterns:

- **Redis cache (Pattern B):** Move balance reads/writes to Redis. Zero DB queries on the hot path.
- **Post-billing with usage logs (Pattern C):** Charge after the request completes based on actual token usage. Persist via append-only log INSERTs (no hot row UPDATEs). Periodically aggregate logs to sync `user_flux` in DB.

## Architecture

### Data Flow

```
HOT PATH (per request, warm cache):
  Request arrives
    → Redis GET flux:{userId} (check balance)
       ├─ cache miss → DB SELECT → Redis SET (lazy load)
       ├─ balance ≤ 0 → 402 reject
       └─ balance > 0 → forward to gateway
  Response returns (non-streaming)
    → Parse usage (promptTokens, completionTokens) from response body
    → Calculate actual fluxConsumed (ceil to integer)
    → Redis DECRBY flux:{userId} (update cached balance)
    → INSERT llm_request_log (async, fire-and-forget)

  Response returns (streaming)
    → Start streaming response to client immediately
    → Tee stream: capture final SSE chunk containing usage
    → After stream ends: extract usage, calculate fluxConsumed
    → Redis DECRBY flux:{userId}
    → INSERT llm_request_log (async)

  DB operations per request (warm cache): 0 SELECT, 0 UPDATE, 1 INSERT

COLD PATH (periodic):
  Write-back timer (every 60s):
    snapshot_time = NOW()
    SELECT userId, SUM(flux_consumed) FROM llm_request_log
      WHERE settled = false AND created_at < snapshot_time
      GROUP BY userId
    → Batch UPDATE user_flux SET flux = flux - total
    → UPDATE llm_request_log SET settled = true
        WHERE settled = false AND created_at < snapshot_time

  Stripe recharge (webhook):
    → DB UPDATE user_flux (must persist for payment integrity)
    → Redis INCRBY flux:{userId} (sync cache)

  Process shutdown (onStop hook):
    → Trigger one final write-back
```

### Redis Key Design

| Key | Type | TTL | Description |
|-----|------|-----|-------------|
| `flux:{userId}` | string (integer) | none | Cached user balance |

No TTL. Key count = active user count. Acceptable for single-instance deployment (even 100k users = ~few MB).

### Schema Changes

Add fields to `llm_request_log`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `promptTokens` | integer, nullable | null | Input token count from response |
| `completionTokens` | integer, nullable | null | Output token count from response |
| `settled` | boolean | false | Whether this log has been aggregated into user_flux |

Add partial index: `CREATE INDEX idx_unsettled ON llm_request_log (settled, created_at) WHERE settled = false`

## Design Decisions

### Flux values are always integers

All flux amounts are integers. When computing `fluxConsumed = tokenCount × rate`, use `Math.ceil()` to round up (provider always charges at least 1 flux). This ensures Redis DECRBY/INCRBY (integer-only commands) work correctly.

### Balance check is an early-reject optimization, not a guarantee

The initial `Redis GET` balance check (step 1) is a fast-path rejection for users with zero balance. The actual guard is the `DECRBY + check negative` pattern inside `consumeFlux`, which is atomic in Redis.

### Streaming vs. non-streaming billing

- **Non-streaming:** Parse response body for `usage` field, bill before returning response.
- **Streaming:** Stream response to client immediately, bill asynchronously after stream ends. This means there is a brief window where the user has consumed resources but not yet been charged. The initial balance check provides a weak guard; for streaming, we accept this trade-off to avoid buffering the entire response.

### TTS and ASR endpoints

TTS and ASR responses do not include token-based usage. These endpoints continue to use flat-rate billing from ConfigKV (`FLUX_PER_REQUEST_TTS`, `FLUX_PER_REQUEST_ASR`), but the deduction moves from DB to Redis (same `consumeFlux` path). The flat rate is applied after a successful response (post-billing, no pre-deduct/refund).

## Component Design

### FluxService

Dependencies change from `(Database, ConfigKV)` to `(Database, Redis, ConfigKV)`.

```
getFlux(userId):
  value = Redis GET flux:{userId}
  if value exists → return { userId, flux: parseInt(value) }
  record = DB SELECT from user_flux WHERE userId
  if not found → DB INSERT with INITIAL_USER_FLUX → record
  Redis SET flux:{userId} record.flux
  return record

consumeFlux(userId, amount):
  // Ensure key exists in Redis before DECRBY
  // (DECRBY on nonexistent key creates it at 0, causing incorrect balance)
  await getFlux(userId)  // guarantees Redis key exists

  newBalance = Redis DECRBY flux:{userId} amount
  if newBalance < 0:
    Redis INCRBY flux:{userId} amount  // rollback
    throw 402 Insufficient flux

addFlux(userId, amount):  // Called by Stripe webhooks (checkout + invoice)
  DB UPDATE user_flux SET flux = flux + amount
  Redis INCRBY flux:{userId} amount

updateStripeCustomerId(userId, stripeCustomerId):
  // Unchanged — DB-only operation, no Redis involvement
  DB UPDATE user_flux SET stripe_customer_id = stripeCustomerId
```

### Request Handler (v1completions.ts)

```
handleCompletion:
  1. flux = getFlux(userId) → Redis read
  2. if flux ≤ 0 → 402 reject
  3. forward request to gateway
  4. if response not ok → return error (no charge, no log)
  5. parse usage from response body (non-streaming)
     OR tee stream and extract usage after stream ends (streaming)
  6. calculate fluxConsumed = ceil(tokenCount × rate)
     (fallback to FLUX_PER_REQUEST if usage unavailable)
  7. consumeFlux(userId, fluxConsumed) → Redis DECRBY
  8. logRequest({ ..., promptTokens, completionTokens, settled: false })
  9. return response

handleTTS / handleTranscription:
  1. flux = getFlux(userId) → Redis read
  2. if flux ≤ 0 → 402 reject
  3. forward request to gateway
  4. if response not ok → return error (no charge, no log)
  5. fluxConsumed = FLUX_PER_REQUEST_TTS / FLUX_PER_REQUEST_ASR (flat rate)
  6. consumeFlux(userId, fluxConsumed) → Redis DECRBY
  7. logRequest({ ..., settled: false })
  8. return response
```

Key change: billing moves from pre-deduct to post-billing. No more refund logic needed.

### Write-Back Timer

```
startFluxWriteBack(db, interval = 60_000):
  timer = setInterval(async () => {
    try {
      snapshotTime = new Date()

      // 1. Aggregate unsettled logs inserted BEFORE this tick
      totals = SELECT user_id, SUM(flux_consumed) as total
               FROM llm_request_log
               WHERE settled = false AND created_at < snapshotTime
               GROUP BY user_id

      if totals is empty → return

      // 2. Batch update in transaction
      transaction:
        for each { userId, total } in totals:
          UPDATE user_flux SET flux = flux - total WHERE user_id = userId
        UPDATE llm_request_log SET settled = true
          WHERE settled = false AND created_at < snapshotTime

    } catch (err) {
      // Log error; leave logs unsettled for next tick to retry
      logger.error('Write-back failed', err)
    }
  }, interval)

  return { stop: () => clearInterval(timer), flush: () => <run above once> }
```

Register `flush()` on `lifecycle.appHooks.onStop()` for clean shutdown.

## Affected Files

| File | Change |
|------|--------|
| `schemas/llm-request-log.ts` | Add `promptTokens`, `completionTokens`, `settled` columns |
| `services/flux.ts` | Rewrite: Redis-first reads/writes, remove direct DB deductions |
| `services/request-log.ts` | Accept new token fields in `logRequest()` |
| `services/flux-write-back.ts` | **New file:** periodic aggregation + flush logic |
| `app.ts` | Inject Redis into FluxService, start write-back timer, register onStop |
| `routes/v1completions.ts` | Post-billing flow, parse usage, remove refund logic for all 3 endpoints |
| `routes/stripe.ts` | No change (addFlux internally syncs Redis) |
| `routes/flux.ts` | No change (getFlux internally reads Redis) |
| New DB migration | Add columns + partial index |

## Failure Modes

| Scenario | Impact | Mitigation |
|----------|--------|------------|
| Normal shutdown | No data loss | onStop hook triggers final flush |
| Process crash | Redis has accurate balance. Unsettled logs remain in DB. | On restart: balance loads from DB (higher than reality by up to 60s of unsettled usage). Next write-back tick corrects it. Acceptable: user gets a brief temporary surplus, not a deficit. |
| Redis crash | Cache lost | Next request: cache miss → lazy load from DB. Balance may be slightly higher than reality until next write-back. |
| Gateway returns no usage | Cannot bill by tokens | Fall back to flat rate from ConfigKV (`FLUX_PER_REQUEST`) |
| Log INSERT fails | Redis charged but no log to settle against DB | DB balance remains slightly higher than Redis. Acceptable: user is not under-charged in Redis (real-time), and DB discrepancy is minor. |
| Write-back transaction fails | Logs remain unsettled | Logged as error; next tick retries automatically since logs stay `settled = false` |

## Performance

| Metric | Before | After |
|--------|--------|-------|
| DB queries per request (warm) | 3-5 (SELECT + UPDATE) | 1 (INSERT only) |
| Hot row UPDATE frequency | O(QPS) | O(active_users / 60s) |
| Redis operations per request | 0 | 2 (GET + DECRBY) |
| Latency overhead | ~5-15ms (DB round trips) | ~0.5-1ms (Redis round trips) |
