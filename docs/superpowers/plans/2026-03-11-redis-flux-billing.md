# Redis-Cached Flux Billing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-request DB writes in the billing system with Redis-cached balances and post-billing via usage logs.

**Architecture:** Redis stores real-time user balances (read/write on hot path). Request logs capture actual usage with a `settled` flag. A periodic write-back aggregates unsettled logs into `user_flux` in DB. Stripe webhooks write to both DB and Redis.

**Tech Stack:** ioredis, Drizzle ORM (PostgreSQL), Vitest, PGlite (test DB)

**Spec:** `docs/superpowers/specs/2026-03-11-redis-flux-billing-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/server/src/schemas/llm-request-log.ts` | Modify | Add `promptTokens`, `completionTokens`, `settled` columns |
| `apps/server/src/services/request-log.ts` | Modify | Accept new fields in `RequestLogEntry` |
| `apps/server/src/services/flux.ts` | Rewrite | Redis-first getFlux/consumeFlux/addFlux |
| `apps/server/src/services/flux-write-back.ts` | Create | Periodic aggregation of unsettled logs → user_flux |
| `apps/server/src/services/config-kv.ts` | Modify | Add `FLUX_PER_1K_TOKENS` config key |
| `apps/server/src/services/__test__/flux.test.ts` | Rewrite | Test Redis-backed flux service with mock Redis |
| `apps/server/src/services/__test__/flux-write-back.test.ts` | Create | Test write-back aggregation logic |
| `apps/server/src/routes/v1completions.ts` | Modify | Post-billing flow, parse usage, remove refund logic |
| `apps/server/src/app.ts` | Modify | Inject Redis into FluxService, start write-back, register onStop |
| DB migration | Generate | New columns + partial index via `drizzle-kit generate` |

**Notes:**
- The existing `audioDurationMs` TODO comment in `llm-request-log.ts` is intentionally removed. Audio duration billing is out of scope; TTS/ASR use flat rates.
- Task 1 (schema) is a hard prerequisite for Task 2 (request-log service). Do not reorder.
- `FLUX_PER_1K_TOKENS` is a new optional ConfigKV key (defaults to 1 if unset). Add it to `ConfigDefinitions` in `config-kv.ts`.

---

## Chunk 1: Schema + Request Log Service

### Task 1: Add new columns to llm_request_log schema

**Files:**
- Modify: `apps/server/src/schemas/llm-request-log.ts`

- [ ] **Step 1: Add promptTokens, completionTokens, settled columns**

```typescript
// In apps/server/src/schemas/llm-request-log.ts
// Add after the existing `fluxConsumed` column, replacing the TODO comments:

import { boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'
import { user } from './accounts'

export const llmRequestLog = pgTable('llm_request_log', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  model: text('model').notNull(),
  status: integer('status').notNull(),
  durationMs: integer('duration_ms').notNull(),
  fluxConsumed: integer('flux_consumed').notNull(),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  settled: boolean('settled').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 2: Generate DB migration**

Run: `cd apps/server && pnpm drizzle-kit generate`
Expected: New migration file created in `apps/server/drizzle/`

Note: The partial index (`WHERE settled = false`) cannot be expressed in Drizzle schema. Add it manually to the generated migration SQL:

```sql
CREATE INDEX idx_unsettled ON llm_request_log (settled, created_at) WHERE settled = false;
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/schemas/llm-request-log.ts apps/server/drizzle/
git commit -m "feat(schema): add token usage and settled fields to llm_request_log"
```

### Task 2: Update RequestLogService to accept new fields

**Files:**
- Modify: `apps/server/src/services/request-log.ts`

- [ ] **Step 1: Add new fields to RequestLogEntry interface**

```typescript
export interface RequestLogEntry {
  userId: string
  model: string
  status: number
  durationMs: number
  fluxConsumed: number
  promptTokens?: number
  completionTokens?: number
}
```

The `settled` field is not in the interface — it defaults to `false` via the schema and is only set to `true` by the write-back task.

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/services/request-log.ts
git commit -m "feat(request-log): accept token usage fields in logRequest"
```

---

## Chunk 2: FluxService Rewrite (Redis-backed)

### Task 3: Rewrite FluxService with Redis

**Files:**
- Rewrite: `apps/server/src/services/flux.ts`
- Rewrite: `apps/server/src/services/__test__/flux.test.ts`

- [ ] **Step 1: Write failing tests for Redis-backed FluxService**

The test needs a mock Redis. Use a simple in-memory Map to simulate Redis string commands.

```typescript
import type Redis from 'ioredis'

// apps/server/src/services/__test__/flux.test.ts
import type { createConfigKVService } from '../config-kv'

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createFluxService } from '../flux'

import * as schema from '../../schemas'

function createMockConfigKV(overrides: Record<string, number> = {}): ReturnType<typeof createConfigKVService> {
  const defaults: Record<string, number> = { INITIAL_USER_FLUX: 100, FLUX_PER_CENT: 1, FLUX_PER_REQUEST: 1, ...overrides }
  return {
    get: vi.fn(async (key: string) => defaults[key]),
    getOrThrow: vi.fn(async (key: string) => defaults[key]),
    getOptional: vi.fn(async (key: string) => defaults[key] ?? null),
    set: vi.fn(),
  } as any
}

function createMockRedis(): Redis {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); return 'OK' }),
    decrby: vi.fn(async (key: string, amount: number) => {
      const current = Number.parseInt(store.get(key) ?? '0', 10)
      const next = current - amount
      store.set(key, String(next))
      return next
    }),
    incrby: vi.fn(async (key: string, amount: number) => {
      const current = Number.parseInt(store.get(key) ?? '0', 10)
      const next = current + amount
      store.set(key, String(next))
      return next
    }),
  } as unknown as Redis
}

describe('fluxService (Redis-backed)', () => {
  let db: any
  let redis: Redis
  let service: ReturnType<typeof createFluxService>
  let testUser: any

  beforeAll(async () => {
    db = await mockDB(schema)

    // Create a test user for foreign key constraints
    const [user] = await db.insert(schema.user).values({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    }).returning()
    testUser = user
  })

  beforeEach(() => {
    redis = createMockRedis()
    service = createFluxService(db, redis, createMockConfigKV())
  })

  // --- getFlux ---

  it('getFlux should load from DB on cache miss and populate Redis', async () => {
    const record = await service.getFlux(testUser.id)

    expect(record.flux).toBe(100)
    expect(redis.set).toHaveBeenCalledWith(`flux:${testUser.id}`, '100')
  })

  it('getFlux should return cached value on subsequent calls', async () => {
    await service.getFlux(testUser.id)
    await service.getFlux(testUser.id)

    // DB should only be queried once (first call), Redis GET on second
    expect(redis.get).toHaveBeenCalledTimes(2)
  })

  // --- consumeFlux ---

  it('consumeFlux should deduct via Redis DECRBY', async () => {
    await service.getFlux(testUser.id) // load cache
    const result = await service.consumeFlux(testUser.id, 10)

    expect(result.flux).toBe(90)
    expect(redis.decrby).toHaveBeenCalledWith(`flux:${testUser.id}`, 10)
  })

  it('consumeFlux should throw and rollback when insufficient', async () => {
    await service.getFlux(testUser.id) // load cache (100)

    await expect(service.consumeFlux(testUser.id, 101))
      .rejects
      .toThrow('Insufficient flux')

    // Should have rolled back with INCRBY
    expect(redis.incrby).toHaveBeenCalledWith(`flux:${testUser.id}`, 101)
  })

  // --- addFlux ---

  it('addFlux should update both DB and Redis', async () => {
    await service.getFlux(testUser.id) // load cache
    const result = await service.addFlux(testUser.id, 50)

    expect(result.flux).toBe(150)
    expect(redis.incrby).toHaveBeenCalledWith(`flux:${testUser.id}`, 50)
  })

  // --- consumeFlux without prior getFlux ---

  it('consumeFlux should lazy-load cache if not preloaded', async () => {
    // Create a fresh user with no prior getFlux call
    const [user2] = await db.insert(schema.user).values({
      id: 'user-lazy',
      name: 'Lazy User',
      email: 'lazy@example.com',
    }).returning()

    // consumeFlux should internally call getFlux to load cache
    const result = await service.consumeFlux(user2.id, 10)
    expect(result.flux).toBe(90) // 100 initial - 10
  })

  // --- getFlux after consumeFlux ---

  it('getFlux should return updated value after consumeFlux', async () => {
    await service.getFlux(testUser.id) // cache = 100
    await service.consumeFlux(testUser.id, 25)

    const record = await service.getFlux(testUser.id)
    expect(record.flux).toBe(75) // reads from Redis cache, not stale DB
  })

  // --- updateStripeCustomerId ---

  it('updateStripeCustomerId should update DB only', async () => {
    await service.getFlux(testUser.id)
    const result = await service.updateStripeCustomerId(testUser.id, 'cus_abc123')

    expect(result.stripeCustomerId).toBe('cus_abc123')
  })

  // --- Concurrency ---

  it('concurrent consumeFlux should not over-deduct flux', async () => {
    const [user3] = await db.insert(schema.user).values({
      id: 'user-concurrent-consume',
      name: 'Concurrent Consumer',
      email: 'concurrent-consume@example.com',
    }).returning()

    await service.getFlux(user3.id) // cache = 100

    // Fire 10 concurrent consume calls of 10 each
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.consumeFlux(user3.id, 10)),
    )

    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')

    // Final balance must never go negative
    const final = await service.getFlux(user3.id)
    expect(final.flux).toBeGreaterThanOrEqual(0)

    // Total consumed must equal (fulfilled count * 10)
    expect(final.flux).toBe(100 - fulfilled.length * 10)

    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason.message).toBe('Insufficient flux')
    }
  })

  it('concurrent addFlux should accumulate correctly', async () => {
    const [user4] = await db.insert(schema.user).values({
      id: 'user-concurrent-add',
      name: 'Concurrent Adder',
      email: 'concurrent-add@example.com',
    }).returning()

    await service.getFlux(user4.id) // cache = 100

    await Promise.all(
      Array.from({ length: 10 }, () => service.addFlux(user4.id, 5)),
    )

    const final = await service.getFlux(user4.id)
    expect(final.flux).toBe(150) // 100 + 10 * 5
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && pnpm vitest run src/services/__test__/flux.test.ts`
Expected: FAIL — `createFluxService` does not accept Redis parameter yet.

- [ ] **Step 3: Implement Redis-backed FluxService**

```typescript
// apps/server/src/services/flux.ts
import type Redis from 'ioredis'

import type { Database } from '../libs/db'
import type { ConfigKVService } from './config-kv'

import { eq, sql } from 'drizzle-orm'

import { createPaymentRequiredError } from '../utils/error'

import * as schema from '../schemas/flux'

function redisKey(userId: string): string {
  return `flux:${userId}`
}

export function createFluxService(db: Database, redis: Redis, configKV: ConfigKVService) {
  return {
    async getFlux(userId: string) {
      // 1. Try Redis cache
      const cached = await redis.get(redisKey(userId))
      if (cached !== null) {
        return { userId, flux: Number.parseInt(cached, 10) }
      }

      // 2. Cache miss — load from DB
      let record = await db.query.userFlux.findFirst({
        where: eq(schema.userFlux.userId, userId),
      })

      if (!record) {
        const initialFlux = await configKV.getOrThrow('INITIAL_USER_FLUX')
        ;[record] = await db.insert(schema.userFlux).values({
          userId,
          flux: initialFlux,
        }).returning()
      }

      // 3. Populate Redis cache
      await redis.set(redisKey(userId), String(record.flux))

      return record
    },

    async consumeFlux(userId: string, amount: number) {
      // Ensure Redis key exists before DECRBY
      // (DECRBY on a nonexistent key creates it at 0, giving wrong balance)
      await this.getFlux(userId)

      // Atomic decrement — check result.
      // Note: there is a small race window between DECRBY returning negative
      // and INCRBY rolling back, during which another concurrent request could
      // see the negative balance and also attempt rollback. We accept this
      // trade-off — the initial balance check is the real guard, and this
      // DECRBY+rollback is a safety net, not a guarantee.
      const newBalance = await redis.decrby(redisKey(userId), amount)
      if (newBalance < 0) {
        await redis.incrby(redisKey(userId), amount)
        throw createPaymentRequiredError('Insufficient flux')
      }

      return { userId, flux: newBalance }
    },

    async addFlux(userId: string, amount: number) {
      // Ensure user record exists in DB
      await this.getFlux(userId)

      // DB update (persistence for Stripe payments)
      await db.update(schema.userFlux)
        .set({
          flux: sql`${schema.userFlux.flux} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.userFlux.userId, userId))

      // Sync Redis cache
      const newBalance = await redis.incrby(redisKey(userId), amount)

      return { userId, flux: newBalance }
    },

    async updateStripeCustomerId(userId: string, stripeCustomerId: string) {
      const [updated] = await db.update(schema.userFlux)
        .set({
          stripeCustomerId,
          updatedAt: new Date(),
        })
        .where(eq(schema.userFlux.userId, userId))
        .returning()

      return updated
    },
  }
}

export type FluxService = ReturnType<typeof createFluxService>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && pnpm vitest run src/services/__test__/flux.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/flux.ts apps/server/src/services/__test__/flux.test.ts
git commit -m "feat(flux): rewrite FluxService with Redis-cached balances"
```

---

## Chunk 3: Write-Back Service

### Task 4: Create flux write-back service

**Files:**
- Create: `apps/server/src/services/flux-write-back.ts`
- Create: `apps/server/src/services/__test__/flux-write-back.test.ts`

- [ ] **Step 1: Write failing tests for write-back**

```typescript
import { eq } from 'drizzle-orm'
// apps/server/src/services/__test__/flux-write-back.test.ts
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createFluxWriteBack } from '../flux-write-back'

import * as schema from '../../schemas'

describe('fluxWriteBack', () => {
  let db: any
  let testUser: any
  let writeBack: ReturnType<typeof createFluxWriteBack>

  beforeAll(async () => {
    db = await mockDB(schema)

    const [user] = await db.insert(schema.user).values({
      id: 'user-wb-1',
      name: 'Write-back User',
      email: 'wb@example.com',
    }).returning()
    testUser = user

    // Initialize user flux with 1000
    await db.insert(schema.userFlux).values({
      userId: testUser.id,
      flux: 1000,
    })

    writeBack = createFluxWriteBack(db)
  })

  it('should aggregate unsettled logs and deduct from user_flux', async () => {
    // Insert 3 unsettled logs
    await db.insert(schema.llmRequestLog).values([
      { userId: testUser.id, model: 'gpt-4', status: 200, durationMs: 100, fluxConsumed: 10, settled: false },
      { userId: testUser.id, model: 'gpt-4', status: 200, durationMs: 200, fluxConsumed: 20, settled: false },
      { userId: testUser.id, model: 'gpt-4', status: 200, durationMs: 150, fluxConsumed: 30, settled: false },
    ])

    await writeBack.flush()

    // user_flux should be 1000 - 60 = 940
    const record = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, testUser.id),
    })
    expect(record.flux).toBe(940)

    // All logs should be settled
    const unsettled = await db.query.llmRequestLog.findMany({
      where: eq(schema.llmRequestLog.settled, false),
    })
    expect(unsettled).toHaveLength(0)
  })

  it('should not re-settle already settled logs', async () => {
    // Insert a new unsettled log
    await db.insert(schema.llmRequestLog).values({
      userId: testUser.id,
      model: 'gpt-4',
      status: 200,
      durationMs: 100,
      fluxConsumed: 5,
      settled: false,
    })

    await writeBack.flush()

    // 940 - 5 = 935
    const record = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, testUser.id),
    })
    expect(record.flux).toBe(935)
  })

  it('should be a no-op when there are no unsettled logs', async () => {
    await writeBack.flush()

    const record = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, testUser.id),
    })
    expect(record.flux).toBe(935) // unchanged
  })

  it('should aggregate across multiple users correctly', async () => {
    const [user2] = await db.insert(schema.user).values({
      id: 'user-wb-2',
      name: 'Write-back User 2',
      email: 'wb2@example.com',
    }).returning()
    await db.insert(schema.userFlux).values({ userId: user2.id, flux: 500 })

    // Logs for two different users
    await db.insert(schema.llmRequestLog).values([
      { userId: testUser.id, model: 'gpt-4', status: 200, durationMs: 100, fluxConsumed: 15, settled: false },
      { userId: user2.id, model: 'gpt-4', status: 200, durationMs: 100, fluxConsumed: 25, settled: false },
      { userId: user2.id, model: 'gpt-4', status: 200, durationMs: 100, fluxConsumed: 35, settled: false },
    ])

    await writeBack.flush()

    const record1 = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, testUser.id),
    })
    expect(record1.flux).toBe(920) // 935 - 15

    const record2 = await db.query.userFlux.findFirst({
      where: eq(schema.userFlux.userId, user2.id),
    })
    expect(record2.flux).toBe(440) // 500 - 60
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/server && pnpm vitest run src/services/__test__/flux-write-back.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement write-back service**

```typescript
// apps/server/src/services/flux-write-back.ts
import type { Database } from '../libs/db'

import { useLogger } from '@guiiai/logg'
import { eq, sql } from 'drizzle-orm'

import * as fluxSchema from '../schemas/flux'
import * as logSchema from '../schemas/llm-request-log'

export function createFluxWriteBack(db: Database) {
  const logger = useLogger('flux-write-back').useGlobalConfig()
  let timer: ReturnType<typeof setInterval> | null = null

  async function flush() {
    const snapshotTime = new Date()

    // 1. Aggregate unsettled logs inserted before this tick
    const totals = await db
      .select({
        userId: logSchema.llmRequestLog.userId,
        total: sql<number>`SUM(${logSchema.llmRequestLog.fluxConsumed})`.as('total'),
      })
      .from(logSchema.llmRequestLog)
      .where(sql`${logSchema.llmRequestLog.settled} = false AND ${logSchema.llmRequestLog.createdAt} < ${snapshotTime}`)
      .groupBy(logSchema.llmRequestLog.userId)

    if (totals.length === 0)
      return

    // 2. Batch update in transaction
    await db.transaction(async (tx) => {
      for (const { userId, total } of totals) {
        await tx.update(fluxSchema.userFlux)
          .set({
            flux: sql`${fluxSchema.userFlux.flux} - ${total}`,
            updatedAt: new Date(),
          })
          .where(eq(fluxSchema.userFlux.userId, userId))
      }

      await tx.update(logSchema.llmRequestLog)
        .set({ settled: true })
        .where(sql`${logSchema.llmRequestLog.settled} = false AND ${logSchema.llmRequestLog.createdAt} < ${snapshotTime}`)
    })

    logger.withFields({ userCount: totals.length }).log('Write-back completed')
  }

  return {
    flush,

    start(intervalMs = 60_000) {
      timer = setInterval(() => {
        flush().catch((err) => {
          logger.withError(err).error('Write-back failed')
        })
      }, intervalMs)
    },

    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
  }
}

export type FluxWriteBack = ReturnType<typeof createFluxWriteBack>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/server && pnpm vitest run src/services/__test__/flux-write-back.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/flux-write-back.ts apps/server/src/services/__test__/flux-write-back.test.ts
git commit -m "feat(flux): add write-back service for periodic log aggregation"
```

---

## Chunk 4: Request Handlers + App Wiring

### Task 5: Update v1completions routes to post-billing

**Files:**
- Modify: `apps/server/src/routes/v1completions.ts`

- [ ] **Step 1: Rewrite handleCompletion to post-billing**

Key changes:
- Remove pre-deduct `consumeFlux` call before forwarding
- Remove refund `addFlux` on failure
- Parse `usage` from response body (non-streaming)
- Call `consumeFlux` after successful response
- Pass `promptTokens`, `completionTokens` to `logRequest`
- For streaming, defer billing to after stream completes (see Step 2)

```typescript
// apps/server/src/routes/v1completions.ts
import type { Context } from 'hono'

import type { ConfigKVService } from '../services/config-kv'
import type { FluxService } from '../services/flux'
import type { RequestLogService } from '../services/request-log'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { authGuard } from '../middlewares/auth'
import { configGuard } from '../middlewares/config-guard'
import { createPaymentRequiredError } from '../utils/error'

const SAFE_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'transfer-encoding',
  'cache-control',
])

function buildSafeResponseHeaders(response: Response): Headers {
  const headers = new Headers()
  for (const [key, value] of response.headers) {
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase()))
      headers.set(key, value)
  }
  return headers
}

function normalizeBaseUrl(gatewayBaseUrl: string): string {
  return gatewayBaseUrl.endsWith('/') ? gatewayBaseUrl : `${gatewayBaseUrl}/`
}

interface UsageInfo {
  promptTokens?: number
  completionTokens?: number
}

function extractUsageFromBody(body: any): UsageInfo {
  const usage = body?.usage
  if (!usage)
    return {}
  return {
    promptTokens: usage.prompt_tokens ?? undefined,
    completionTokens: usage.completion_tokens ?? undefined,
  }
}

function calculateFluxFromUsage(usage: UsageInfo, fluxPer1kTokens: number, fallbackRate: number): number {
  const { promptTokens, completionTokens } = usage
  if (promptTokens != null && completionTokens != null) {
    const totalTokens = promptTokens + completionTokens
    return Math.max(1, Math.ceil(totalTokens / 1000 * fluxPer1kTokens))
  }
  return fallbackRate
}

export function createV1CompletionsRoutes(fluxService: FluxService, configKV: ConfigKVService, requestLogService: RequestLogService) {
  async function handleCompletion(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()
    const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
    const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
    let requestModel = body.model || 'auto'

    if (requestModel === 'auto') {
      requestModel = await configKV.getOrThrow('DEFAULT_CHAT_MODEL')
    }

    const startedAt = Date.now()

    const response = await fetch(`${baseUrl}chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, model: requestModel }),
    })

    const durationMs = Date.now() - startedAt

    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    // Post-billing: parse usage and charge after successful response
    const fallbackRate = await configKV.getOrThrow('FLUX_PER_REQUEST')
    const fluxPer1kTokens = (await configKV.getOptional('FLUX_PER_1K_TOKENS')) ?? 1

    if (body.stream) {
      // Streaming: return response immediately, bill after stream ends
      const { readable, writable } = new TransformStream()
      const reader = response.body!.getReader()
      const writer = writable.getWriter()
      // Buffer last 2KB to handle chunk boundary splits for usage extraction
      let tailBuffer = ''

      // Process stream in background
      ;(async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done)
              break
            await writer.write(value)
            const text = new TextDecoder().decode(value)
            tailBuffer = (tailBuffer + text).slice(-2048)
          }
        }
        finally {
          await writer.close()

          // Extract usage from final SSE data lines
          let usage: UsageInfo = {}
          try {
            const lines = tailBuffer.split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'))
            const lastDataLine = lines[lines.length - 1]
            if (lastDataLine) {
              const json = JSON.parse(lastDataLine.slice(6))
              usage = extractUsageFromBody(json)
            }
          }
          catch { /* fallback to flat rate */ }

          const fluxConsumed = calculateFluxFromUsage(usage, fluxPer1kTokens, fallbackRate)

          // Best-effort billing — don't throw on insufficient flux during streaming
          try {
            await fluxService.consumeFlux(user.id, fluxConsumed)
          }
          catch { /* already streaming, can't reject now */ }

          requestLogService.logRequest({
            userId: user.id,
            model: requestModel,
            status: response.status,
            durationMs,
            fluxConsumed,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
          }).catch(() => {})
        }
      })()

      return new Response(readable, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    // Non-streaming: parse response, bill, then return
    const responseBody = await response.json()
    const usage = extractUsageFromBody(responseBody)
    const fluxConsumed = calculateFluxFromUsage(usage, fluxPer1kTokens, fallbackRate)

    // Best-effort billing — gateway already processed the request,
    // don't return 402 after work is done
    try {
      await fluxService.consumeFlux(user.id, fluxConsumed)
    }
    catch { /* log will still capture the charge for write-back */ }

    requestLogService.logRequest({
      userId: user.id,
      model: requestModel,
      status: response.status,
      durationMs,
      fluxConsumed,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    }).catch(() => {})

    return c.json(responseBody)
  }

  async function handleTTS(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()
    const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
    const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
    const requestModel = body.model || 'auto'
    const startedAt = Date.now()

    const response = await fetch(`${baseUrl}audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const durationMs = Date.now() - startedAt

    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    const fluxPerRequest = await configKV.getOrThrow('FLUX_PER_REQUEST_TTS')
    await fluxService.consumeFlux(user.id, fluxPerRequest)

    requestLogService.logRequest({
      userId: user.id,
      model: requestModel,
      status: response.status,
      durationMs,
      fluxConsumed: fluxPerRequest,
    }).catch(() => {})

    return new Response(response.body, {
      status: response.status,
      headers: buildSafeResponseHeaders(response),
    })
  }

  async function handleTranscription(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
    const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
    const startedAt = Date.now()

    const rawBody = await c.req.arrayBuffer()
    const contentType = c.req.header('content-type') || 'multipart/form-data'

    const response = await fetch(`${baseUrl}audio/transcriptions`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: rawBody,
    })

    const durationMs = Date.now() - startedAt

    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    const fluxPerRequest = await configKV.getOrThrow('FLUX_PER_REQUEST_ASR')
    await fluxService.consumeFlux(user.id, fluxPerRequest)

    requestLogService.logRequest({
      userId: user.id,
      model: 'auto',
      status: response.status,
      durationMs,
      fluxConsumed: fluxPerRequest,
    }).catch(() => {})

    return new Response(response.body, {
      status: response.status,
      headers: buildSafeResponseHeaders(response),
    })
  }

  const chatGuard = configGuard(configKV, ['FLUX_PER_REQUEST', 'GATEWAY_BASE_URL', 'DEFAULT_CHAT_MODEL'], 'Service is not available yet')
  const ttsGuard = configGuard(configKV, ['FLUX_PER_REQUEST_TTS', 'GATEWAY_BASE_URL'], 'TTS service is not available yet')
  const asrGuard = configGuard(configKV, ['FLUX_PER_REQUEST_ASR', 'GATEWAY_BASE_URL'], 'ASR service is not available yet')

  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/chat/completions', chatGuard, handleCompletion)
    .post('/chat/completion', chatGuard, handleCompletion)
    .post('/audio/speech', ttsGuard, handleTTS)
    .post('/audio/transcriptions', bodyLimit({ maxSize: 25 * 1024 * 1024 }), asrGuard, handleTranscription)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/routes/v1completions.ts
git commit -m "feat(billing): switch to post-billing with usage-based charging"
```

### Task 6: Wire up Redis and write-back in app.ts

**Files:**
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: Update FluxService DI to include Redis**

In `apps/server/src/app.ts`, change the `fluxService` provider (around line 226-229):

```typescript
// Before:
const fluxService = injeca.provide('services:flux', {
  dependsOn: { db, configKV },
  build: ({ dependsOn }) => createFluxService(dependsOn.db, dependsOn.configKV),
})

// After:
const fluxService = injeca.provide('services:flux', {
  dependsOn: { db, redis, configKV },
  build: ({ dependsOn }) => createFluxService(dependsOn.db, dependsOn.redis, dependsOn.configKV),
})
```

- [ ] **Step 2: Add write-back service with lifecycle hooks**

Add import at top of `app.ts`:
```typescript
import { createFluxWriteBack } from './services/flux-write-back'
```

Add after the `requestLogService` provider (around line 234):

```typescript
const fluxWriteBack = injeca.provide('services:fluxWriteBack', {
  dependsOn: { db, lifecycle },
  build: ({ dependsOn }) => {
    const wb = createFluxWriteBack(dependsOn.db)
    wb.start()
    dependsOn.lifecycle.appHooks.onStop(async () => {
      wb.stop()
      await wb.flush()
    })
    return wb
  },
})
```

Add `fluxWriteBack` to the `injeca.resolve()` call so it gets instantiated:

```typescript
const resolved = await injeca.resolve({
  auth,
  characterService,
  chatService,
  providerService,
  fluxService,
  requestLogService,
  stripeService,
  configKV,
  env: parsedEnv,
  otel,
  fluxWriteBack, // add this
})
```

- [ ] **Step 3: Run type check**

Run: `cd apps/server && pnpm tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/app.ts
git commit -m "feat(app): wire Redis into FluxService and start write-back timer"
```

---

## Chunk 5: Verify Everything Works

### Task 7: Run full test suite and type check

- [ ] **Step 1: Run all tests**

Run: `cd apps/server && pnpm vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run type check**

Run: `cd apps/server && pnpm tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Final review commit**

Review all changes for consistency with the spec, then commit any remaining adjustments.
