# Remove Outbox Pattern & Simplify MQ Architecture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the DB outbox pattern, consolidate 3 server processes into 2 (`api` + `billing-consumer`), and make the MQ actually useful by handling async writes (ledger, audit log, request log) via direct `XADD` from the API.

**Architecture:** API writes balance to DB synchronously (source of truth), then fires `XADD` to Redis Stream for async side effects. A single `billing-consumer` process reads the stream and batch-writes ledger entries, audit logs, and LLM request logs to DB. The outbox table, outbox-dispatcher process, and cache-sync-consumer are removed entirely.

**Tech Stack:** Hono, Drizzle ORM, Redis Streams (ioredis), Valibot, Vitest, injeca

---

## File Structure

### Files to DELETE
- `src/services/outbox-service.ts` — DB outbox enqueue/claim/publish logic
- `src/services/outbox-dispatcher.ts` — DB→Stream polling bridge
- `src/services/__test__/outbox-service.test.ts` — outbox service tests
- `src/services/__test__/outbox-dispatcher.test.ts` — outbox dispatcher tests
- `src/bin/run-outbox-dispatcher.ts` — outbox-dispatcher CLI entrypoint
- `src/bin/run-billing-events-consumer.ts` — cache-sync consumer CLI entrypoint
- `src/schemas/outbox-events.ts` — Drizzle schema for outbox_events table

### Files to MODIFY
- `src/services/billing-service.ts` — Remove outboxService dep, remove ledger/audit from transaction, add XADD after commit
- `src/services/billing-mq.ts` — Keep as-is (already has publish/consume/ack)
- `src/services/billing-mq-worker.ts` — Keep as-is (generic consumer loop)
- `src/services/billing-events.ts` — Add `llm.request.log` event type for request logging
- `src/app.ts` — Remove outboxService from DI, inject billingMqService into billing-service and v1completions
- `src/routes/v1completions.ts` — Replace fire-and-forget `requestLogService.logRequest()` with XADD
- `src/bin/run.ts` — Replace 3 commands with 2: `api` + `billing-consumer`
- `src/schemas/index.ts` — Remove outbox-events re-export
- `src/libs/env.ts` — Remove OUTBOX_DISPATCHER_* env vars
- `src/services/__test__/billing-service.test.ts` — Remove outbox assertions, add XADD mock assertions

### Files to CREATE
- `src/bin/run-billing-consumer.ts` — New consumer entrypoint that handles all stream events
- `src/services/billing-consumer-handler.ts` — Message handler: routes events to ledger/audit/request-log DB writes
- `src/services/__test__/billing-consumer-handler.test.ts` — Tests for the new handler

---

## Task 1: Remove outbox schema from exports and create DB migration

**Files:**
- Modify: `src/schemas/index.ts:8`
- Create: new drizzle migration to drop `outbox_events` table

- [ ] **Step 1: Remove outbox-events from schema index**

In `src/schemas/index.ts`, remove line 8:
```ts
export * from './outbox-events'
```

- [ ] **Step 2: Generate drizzle migration to drop the outbox_events table**

Run:
```bash
cd apps/server && pnpm drizzle-kit generate
```

Expected: A new migration file in `drizzle/` that drops the `outbox_events` table and its indexes.

- [ ] **Step 3: Verify migration looks correct**

Read the generated migration file and confirm it contains `DROP TABLE "outbox_events"` and drops the associated indexes.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/schemas/index.ts apps/server/drizzle/
git commit -m "chore(server): drop outbox_events table from schema"
```

---

## Task 2: Delete outbox service, dispatcher, and their tests

**Files:**
- Delete: `src/services/outbox-service.ts`
- Delete: `src/services/outbox-dispatcher.ts`
- Delete: `src/services/__test__/outbox-service.test.ts`
- Delete: `src/services/__test__/outbox-dispatcher.test.ts`
- Delete: `src/schemas/outbox-events.ts`

- [ ] **Step 1: Delete the files**

```bash
cd apps/server
rm src/services/outbox-service.ts
rm src/services/outbox-dispatcher.ts
rm src/services/__test__/outbox-service.test.ts
rm src/services/__test__/outbox-dispatcher.test.ts
rm src/schemas/outbox-events.ts
```

- [ ] **Step 2: Verify no remaining imports of deleted files**

Search for any remaining imports:
```bash
grep -r "outbox-service\|outbox-dispatcher\|outbox-events" apps/server/src/ --include="*.ts"
```

Expected: Hits in `billing-service.ts`, `app.ts`, `run.ts`, `billing-service.test.ts` — these will be fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add -A apps/server/src/services/outbox-service.ts apps/server/src/services/outbox-dispatcher.ts apps/server/src/services/__test__/outbox-service.test.ts apps/server/src/services/__test__/outbox-dispatcher.test.ts apps/server/src/schemas/outbox-events.ts
git commit -m "refactor(server): delete outbox service, dispatcher, and schema"
```

---

## Task 3: Add `llm.request.log` event type to billing-events

**Files:**
- Modify: `src/services/billing-events.ts`
- Modify: `src/services/__test__/billing-events.test.ts`

- [ ] **Step 1: Add the new event type and payload schema**

In `src/services/billing-events.ts`:

Add `literal('llm.request.log')` to `BillingEventTypeSchema`:
```ts
const BillingEventTypeSchema = union([
  literal('flux.debited'),
  literal('flux.credited'),
  literal('stripe.checkout.completed'),
  literal('llm.request.completed'),
  literal('llm.request.log'),
])
```

Add the payload schema after `LlmRequestCompletedPayloadSchema`:
```ts
const LlmRequestLogPayloadSchema = object({
  model: pipe(string(), nonEmpty()),
  status: number(),
  durationMs: number(),
  fluxConsumed: number(),
  promptTokens: optional(number()),
  completionTokens: optional(number()),
})
```

Add the event type:
```ts
export type LlmRequestLogEvent = BillingEventEnvelope & {
  eventType: 'llm.request.log'
  payload: LlmRequestLogPayload
}

type LlmRequestLogPayload = InferOutput<typeof LlmRequestLogPayloadSchema>
```

Add to the `BillingEvent` union:
```ts
export type BillingEvent
  = | FluxDebitedEvent
    | FluxCreditedEvent
    | StripeCheckoutCompletedEvent
    | LlmRequestCompletedEvent
    | LlmRequestLogEvent
```

Add the case to `parseBillingEvent`:
```ts
case 'llm.request.log':
  return {
    ...parsedEnvelope,
    eventType: 'llm.request.log',
    payload: parse(LlmRequestLogPayloadSchema, parsedEnvelope.payload),
  }
```

- [ ] **Step 2: Run existing billing-events tests**

```bash
pnpm exec vitest run apps/server/src/services/__test__/billing-events.test.ts
```

Expected: PASS (new type doesn't break existing serialization/parsing)

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/services/billing-events.ts
git commit -m "feat(server): add llm.request.log event type to billing events"
```

---

## Task 4: Rewrite billing-service to remove outbox and add XADD

**Files:**
- Modify: `src/services/billing-service.ts`

- [ ] **Step 1: Write the failing test for the new billing-service signature**

In `src/services/__test__/billing-service.test.ts`, replace the entire file. The key changes:
- Remove `outboxService` dependency
- Add `billingMqService` mock (with `publish` method)
- Remove all `outboxEvents` assertions
- Assert `billingMqService.publish` is called with correct event data
- Keep ledger and audit writes IN the transaction (they're still valuable for consistency, and we'll extract them to MQ in a follow-up if needed)

Actually, per the plan discussion: ledger and audit should be REMOVED from the transaction and moved to the consumer. The transaction should ONLY update `user_flux`. The XADD after commit carries the data for the consumer to write ledger + audit.

Update `billing-service.test.ts`:

```ts
import type Redis from 'ioredis'

import type { Database } from '../../libs/db'
import type { BillingMqService } from '../billing-mq'
import type { createConfigKVService } from '../config-kv'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createBillingService } from '../billing-service'

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
  } as unknown as Redis
}

function createMockBillingMq(): BillingMqService {
  return {
    stream: 'billing-events',
    publish: vi.fn(async () => '1-0'),
    ensureConsumerGroup: vi.fn(async () => true),
    consume: vi.fn(async () => []),
    claimIdleMessages: vi.fn(async () => []),
    ack: vi.fn(async () => 1),
  }
}

describe('billingService', () => {
  let db: Database
  let redis: Redis
  let billingMq: BillingMqService
  let billingService: ReturnType<typeof createBillingService>

  beforeAll(async () => {
    db = await mockDB(schema)

    await db.insert(schema.user).values({
      id: 'user-billing-1',
      name: 'Billing User',
      email: 'billing@example.com',
    })
  })

  beforeEach(async () => {
    redis = createMockRedis()
    billingMq = createMockBillingMq()
    billingService = createBillingService(db, redis, billingMq, createMockConfigKV())

    await db.delete(schema.fluxAuditLog)
    await db.delete(schema.fluxLedger)
    await db.delete(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
    await db.delete(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'sess-billing-1'))

    await db.insert(schema.stripeCheckoutSession).values({
      userId: 'user-billing-1',
      stripeSessionId: 'sess-billing-1',
      mode: 'payment',
      status: 'complete',
      paymentStatus: 'paid',
      amountTotal: 500,
      currency: 'usd',
      fluxCredited: false,
    })
  })

  describe('creditFluxFromStripeCheckout', () => {
    it('credits flux, records ledger + audit, and publishes events to stream', async () => {
      const result = await billingService.creditFluxFromStripeCheckout({
        stripeEventId: 'stripe-evt-1',
        userId: 'user-billing-1',
        stripeSessionId: 'sess-billing-1',
        amountTotal: 500,
        currency: 'usd',
        fluxAmount: 50,
      })

      expect(result).toEqual({ applied: true, balanceAfter: 50 })

      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(50)

      // Verify ledger entry (still written in credit transactions for immediate consistency)
      const ledgerRecords = await db.select().from(schema.fluxLedger).where(eq(schema.fluxLedger.userId, 'user-billing-1'))
      expect(ledgerRecords).toHaveLength(1)
      expect(ledgerRecords[0]?.type).toBe('credit')

      // Verify audit log (still written in credit transactions)
      const auditRecords = await db.select().from(schema.fluxAuditLog).where(eq(schema.fluxAuditLog.userId, 'user-billing-1'))
      expect(auditRecords).toHaveLength(1)

      // Verify stripe session marked as credited
      const [sessionRecord] = await db.select().from(schema.stripeCheckoutSession).where(eq(schema.stripeCheckoutSession.stripeSessionId, 'sess-billing-1'))
      expect(sessionRecord?.fluxCredited).toBe(true)

      // Verify events published to stream (not outbox)
      expect(billingMq.publish).toHaveBeenCalledTimes(2)
      const calls = (billingMq.publish as any).mock.calls
      expect(calls[0][0].eventType).toBe('flux.credited')
      expect(calls[1][0].eventType).toBe('stripe.checkout.completed')

      // Verify Redis cache updated
      expect(redis.set).toHaveBeenCalledWith('flux:user-billing-1', '50')
    })

    it('is idempotent when the checkout session was already credited', async () => {
      await billingService.creditFluxFromStripeCheckout({
        stripeEventId: 'stripe-evt-1',
        userId: 'user-billing-1',
        stripeSessionId: 'sess-billing-1',
        amountTotal: 500,
        currency: 'usd',
        fluxAmount: 50,
      })

      const second = await billingService.creditFluxFromStripeCheckout({
        stripeEventId: 'stripe-evt-1',
        userId: 'user-billing-1',
        stripeSessionId: 'sess-billing-1',
        amountTotal: 500,
        currency: 'usd',
        fluxAmount: 50,
      })

      expect(second).toEqual({ applied: false })
    })
  })

  describe('debitFlux', () => {
    it('deducts balance via DB, publishes event to stream for async ledger/audit', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 100 })

      const result = await billingService.debitFlux({
        userId: 'user-billing-1',
        amount: 30,
        requestId: 'req-1',
        description: 'gpt-4',
      })

      expect(result).toEqual({ userId: 'user-billing-1', flux: 70 })

      // Verify DB balance updated
      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(70)

      // Verify NO ledger/audit written synchronously (moved to consumer)
      const ledgerRecords = await db.select().from(schema.fluxLedger).where(eq(schema.fluxLedger.userId, 'user-billing-1'))
      expect(ledgerRecords).toHaveLength(0)

      const auditRecords = await db.select().from(schema.fluxAuditLog).where(eq(schema.fluxAuditLog.userId, 'user-billing-1'))
      expect(auditRecords).toHaveLength(0)

      // Verify event published to stream
      expect(billingMq.publish).toHaveBeenCalledTimes(1)
      const publishedEvent = (billingMq.publish as any).mock.calls[0][0]
      expect(publishedEvent.eventType).toBe('flux.debited')
      expect(publishedEvent.payload.amount).toBe(30)
      expect(publishedEvent.payload.balanceAfter).toBe(70)

      // Verify Redis cache updated
      expect(redis.set).toHaveBeenCalledWith('flux:user-billing-1', '70')
    })

    it('throws 402 when balance is insufficient', async () => {
      await db.insert(schema.userFlux).values({ userId: 'user-billing-1', flux: 5 })

      await expect(billingService.debitFlux({
        userId: 'user-billing-1',
        amount: 10,
      })).rejects.toThrow('Insufficient flux')

      // Verify no side effects
      const [fluxRecord] = await db.select().from(schema.userFlux).where(eq(schema.userFlux.userId, 'user-billing-1'))
      expect(fluxRecord?.flux).toBe(5)

      expect(billingMq.publish).not.toHaveBeenCalled()
    })
  })

  describe('creditFlux', () => {
    it('credits balance with ledger + audit + stream event', async () => {
      const result = await billingService.creditFlux({
        userId: 'user-billing-1',
        amount: 50,
        description: 'Admin grant',
        source: 'admin',
      })

      expect(result.balanceAfter).toBe(50)
      expect(result.balanceBefore).toBe(0)

      // Verify stream event published
      expect(billingMq.publish).toHaveBeenCalledTimes(1)
      const publishedEvent = (billingMq.publish as any).mock.calls[0][0]
      expect(publishedEvent.eventType).toBe('flux.credited')
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm exec vitest run apps/server/src/services/__test__/billing-service.test.ts
```

Expected: FAIL — `createBillingService` still expects `outboxService` parameter.

- [ ] **Step 3: Rewrite billing-service.ts**

Replace `src/services/billing-service.ts` with:

```ts
import type Redis from 'ioredis'

import type { Database } from '../libs/db'
import type { RevenueMetrics } from '../libs/otel'
import type { BillingEvent } from './billing-events'
import type { BillingMqService } from './billing-mq'
import type { ConfigKVService } from './config-kv'

import { useLogger } from '@guiiai/logg'
import { eq } from 'drizzle-orm'

import { createPaymentRequiredError } from '../utils/error'
import { nanoid } from '../utils/id'
import { fluxRedisKey } from './flux'

import * as fluxSchema from '../schemas/flux'
import * as fluxAuditSchema from '../schemas/flux-audit-log'
import * as fluxLedgerSchema from '../schemas/flux-ledger'
import * as stripeSchema from '../schemas/stripe'

const logger = useLogger('billing-service')

export function createBillingService(
  db: Database,
  redis: Redis,
  billingMq: BillingMqService,
  _configKV: ConfigKVService,
  metrics?: RevenueMetrics | null,
) {
  /**
   * Update Redis cache after a successful DB transaction.
   * Best-effort: cache loss is harmless since DB is the source of truth.
   */
  async function updateRedisCache(userId: string, balance: number): Promise<void> {
    try {
      await redis.set(fluxRedisKey(userId), String(balance))
    }
    catch {
      logger.withFields({ userId }).warn('Failed to update Redis cache after balance change')
    }
  }

  /**
   * Publish a billing event to Redis Stream.
   * Best-effort: the event carries data for async side effects (ledger, audit).
   * If publish fails, the side effects are lost but the balance change is already committed.
   */
  async function publishEvent(event: BillingEvent): Promise<void> {
    try {
      await billingMq.publish(event)
    }
    catch (error) {
      logger.withError(error).withFields({
        eventId: event.eventId,
        eventType: event.eventType,
        userId: event.userId,
      }).error('Failed to publish billing event to stream')
    }
  }

  return {
    /**
     * Debit flux from a user's balance.
     * Only UPDATE user_flux in transaction (minimal lock).
     * Ledger + audit are written async by the billing consumer via stream event.
     */
    async debitFlux(input: {
      userId: string
      amount: number
      requestId?: string
      description?: string
    }): Promise<{ userId: string, flux: number }> {
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ flux: fluxSchema.userFlux.flux })
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

        if (!row) {
          throw new Error(`No flux record for user ${input.userId}`)
        }

        const balanceBefore = row.flux
        if (balanceBefore < input.amount) {
          metrics?.fluxInsufficientBalance.add(1)
          throw createPaymentRequiredError('Insufficient flux')
        }

        const balanceAfter = balanceBefore - input.amount

        await tx.update(fluxSchema.userFlux)
          .set({ flux: balanceAfter, updatedAt: new Date() })
          .where(eq(fluxSchema.userFlux.userId, input.userId))

        return { userId: input.userId, flux: balanceAfter, balanceBefore }
      })

      await updateRedisCache(input.userId, result.flux)

      // Publish event for async ledger + audit writes
      await publishEvent({
        eventId: nanoid(),
        eventType: 'flux.debited',
        aggregateId: input.userId,
        userId: input.userId,
        requestId: input.requestId,
        occurredAt: new Date().toISOString(),
        schemaVersion: 1,
        payload: {
          amount: input.amount,
          balanceAfter: result.flux,
          source: input.description ?? 'LLM request',
        },
      })

      logger.withFields({ userId: input.userId, amount: input.amount, balance: result.flux }).log('Debited flux')
      return { userId: result.userId, flux: result.flux }
    },

    /**
     * Credit flux to a user's balance.
     * Credits keep ledger + audit in the transaction for immediate consistency
     * (low frequency, user expects to see the record right away).
     */
    async creditFlux(input: {
      userId: string
      amount: number
      requestId?: string
      description: string
      source: string
      auditMetadata?: Record<string, unknown>
    }): Promise<{ balanceBefore: number, balanceAfter: number }> {
      const result = await db.transaction(async (tx) => {
        await tx.insert(fluxSchema.userFlux)
          .values({ userId: input.userId, flux: 0 })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        const [row] = await tx
          .select({ flux: fluxSchema.userFlux.flux })
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

        const balanceBefore = row!.flux
        const balanceAfter = balanceBefore + input.amount

        await tx.update(fluxSchema.userFlux)
          .set({ flux: balanceAfter, updatedAt: new Date() })
          .where(eq(fluxSchema.userFlux.userId, input.userId))

        await tx.insert(fluxLedgerSchema.fluxLedger).values({
          userId: input.userId,
          type: 'credit',
          amount: input.amount,
          balanceBefore,
          balanceAfter,
          requestId: input.requestId,
          description: input.description,
        })

        await tx.insert(fluxAuditSchema.fluxAuditLog).values({
          userId: input.userId,
          type: 'addition',
          amount: input.amount,
          description: input.description,
          metadata: input.auditMetadata,
        })

        return { balanceBefore, balanceAfter }
      })

      await updateRedisCache(input.userId, result.balanceAfter)

      await publishEvent({
        eventId: nanoid(),
        eventType: 'flux.credited',
        aggregateId: input.userId,
        userId: input.userId,
        requestId: input.requestId,
        occurredAt: new Date().toISOString(),
        schemaVersion: 1,
        payload: {
          amount: input.amount,
          balanceAfter: result.balanceAfter,
          source: input.source,
        },
      })

      logger.withFields({ userId: input.userId, amount: input.amount, balance: result.balanceAfter }).log('Credited flux')
      return result
    },

    /**
     * Credit flux from a Stripe checkout session (one-time payment).
     * Idempotent: checks fluxCredited flag before applying.
     */
    async creditFluxFromStripeCheckout(input: {
      stripeEventId: string
      userId: string
      stripeSessionId: string
      amountTotal: number
      currency: string | null
      fluxAmount: number
    }): Promise<{ applied: boolean, balanceAfter?: number }> {
      const txResult = await db.transaction(async (tx) => {
        const record = await tx.query.stripeCheckoutSession.findFirst({
          where: (table, { eq }) => eq(table.stripeSessionId, input.stripeSessionId),
        })

        if (!record || record.fluxCredited) {
          return { applied: false }
        }

        await tx.insert(fluxSchema.userFlux)
          .values({ userId: input.userId, flux: 0 })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        const [currentFlux] = await tx
          .select({ flux: fluxSchema.userFlux.flux })
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

        const balanceBefore = currentFlux!.flux
        const balanceAfter = balanceBefore + input.fluxAmount

        await tx.update(fluxSchema.userFlux)
          .set({ flux: balanceAfter, updatedAt: new Date() })
          .where(eq(fluxSchema.userFlux.userId, input.userId))

        await tx.update(stripeSchema.stripeCheckoutSession)
          .set({ fluxCredited: true, updatedAt: new Date() })
          .where(eq(stripeSchema.stripeCheckoutSession.stripeSessionId, input.stripeSessionId))

        const description = `Stripe payment ${input.currency?.toUpperCase() ?? 'UNKNOWN'} ${(input.amountTotal / 100).toFixed(2)}`

        await tx.insert(fluxLedgerSchema.fluxLedger).values({
          userId: input.userId,
          type: 'credit',
          amount: input.fluxAmount,
          balanceBefore,
          balanceAfter,
          requestId: input.stripeEventId,
          description,
        })

        await tx.insert(fluxAuditSchema.fluxAuditLog).values({
          userId: input.userId,
          type: 'addition',
          amount: input.fluxAmount,
          description,
          metadata: {
            stripeEventId: input.stripeEventId,
            stripeSessionId: input.stripeSessionId,
            source: 'stripe.checkout.completed',
          },
        })

        return { applied: true, balanceAfter, balanceBefore }
      })

      if (txResult.applied && txResult.balanceAfter != null) {
        await updateRedisCache(input.userId, txResult.balanceAfter)

        const occurredAt = new Date().toISOString()
        await publishEvent({
          eventId: nanoid(),
          eventType: 'flux.credited',
          aggregateId: input.userId,
          userId: input.userId,
          requestId: input.stripeEventId,
          occurredAt,
          schemaVersion: 1,
          payload: {
            amount: input.fluxAmount,
            balanceAfter: txResult.balanceAfter,
            source: 'stripe.checkout.completed',
          },
        })

        await publishEvent({
          eventId: nanoid(),
          eventType: 'stripe.checkout.completed',
          aggregateId: input.stripeSessionId,
          userId: input.userId,
          requestId: input.stripeEventId,
          occurredAt,
          schemaVersion: 1,
          payload: {
            stripeEventId: input.stripeEventId,
            stripeSessionId: input.stripeSessionId,
            amount: input.amountTotal,
            currency: input.currency ?? 'unknown',
          },
        })
      }

      return { applied: txResult.applied, balanceAfter: txResult.balanceAfter }
    },

    /**
     * Credit flux from a Stripe invoice payment (subscription).
     * Idempotent: checks fluxCredited flag on the invoice record.
     */
    async creditFluxFromInvoice(input: {
      stripeEventId: string
      userId: string
      stripeInvoiceId: string
      amountPaid: number
      currency: string
      fluxAmount: number
    }): Promise<{ applied: boolean, balanceAfter?: number }> {
      const txResult = await db.transaction(async (tx) => {
        const record = await tx.query.stripeInvoice.findFirst({
          where: (table, { eq }) => eq(table.stripeInvoiceId, input.stripeInvoiceId),
        })

        if (!record || record.fluxCredited) {
          return { applied: false }
        }

        await tx.insert(fluxSchema.userFlux)
          .values({ userId: input.userId, flux: 0 })
          .onConflictDoNothing({ target: fluxSchema.userFlux.userId })

        const [currentFlux] = await tx
          .select({ flux: fluxSchema.userFlux.flux })
          .from(fluxSchema.userFlux)
          .where(eq(fluxSchema.userFlux.userId, input.userId))
          .for('update')

        const balanceBefore = currentFlux!.flux
        const balanceAfter = balanceBefore + input.fluxAmount

        await tx.update(fluxSchema.userFlux)
          .set({ flux: balanceAfter, updatedAt: new Date() })
          .where(eq(fluxSchema.userFlux.userId, input.userId))

        await tx.update(stripeSchema.stripeInvoice)
          .set({ fluxCredited: true, updatedAt: new Date() })
          .where(eq(stripeSchema.stripeInvoice.stripeInvoiceId, input.stripeInvoiceId))

        const description = `Subscription invoice ${input.currency.toUpperCase()} ${(input.amountPaid / 100).toFixed(2)}`

        await tx.insert(fluxLedgerSchema.fluxLedger).values({
          userId: input.userId,
          type: 'credit',
          amount: input.fluxAmount,
          balanceBefore,
          balanceAfter,
          requestId: input.stripeEventId,
          description,
        })

        await tx.insert(fluxAuditSchema.fluxAuditLog).values({
          userId: input.userId,
          type: 'addition',
          amount: input.fluxAmount,
          description,
          metadata: {
            stripeEventId: input.stripeEventId,
            stripeInvoiceId: input.stripeInvoiceId,
            source: 'invoice.paid',
          },
        })

        return { applied: true, balanceAfter }
      })

      if (txResult.applied && txResult.balanceAfter != null) {
        await updateRedisCache(input.userId, txResult.balanceAfter)

        await publishEvent({
          eventId: nanoid(),
          eventType: 'flux.credited',
          aggregateId: input.userId,
          userId: input.userId,
          requestId: input.stripeEventId,
          occurredAt: new Date().toISOString(),
          schemaVersion: 1,
          payload: {
            amount: input.fluxAmount,
            balanceAfter: txResult.balanceAfter,
            source: 'invoice.paid',
          },
        })
      }

      return txResult
    },
  }
}

export type BillingService = ReturnType<typeof createBillingService>
```

Key changes:
- Parameter 3 changed from `outboxService: OutboxService` to `billingMq: BillingMqService`
- `debitFlux` transaction only does `SELECT FOR UPDATE` + `UPDATE user_flux` (no more ledger/audit/outbox INSERTs)
- After commit, publishes `flux.debited` event to stream via `XADD`
- Credit methods keep ledger+audit in transaction (low frequency, user expects immediate visibility)
- Credits publish events to stream after commit instead of outbox

- [ ] **Step 4: Run the test**

```bash
pnpm exec vitest run apps/server/src/services/__test__/billing-service.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/billing-service.ts apps/server/src/services/__test__/billing-service.test.ts
git commit -m "refactor(server): replace outbox with direct XADD in billing-service"
```

---

## Task 5: Create billing-consumer-handler

**Files:**
- Create: `src/services/billing-consumer-handler.ts`
- Create: `src/services/__test__/billing-consumer-handler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/__test__/billing-consumer-handler.test.ts`:

```ts
import type { Database } from '../../libs/db'
import type { BillingStreamMessage } from '../billing-mq'

import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createBillingConsumerHandler } from '../billing-consumer-handler'

import * as schema from '../../schemas'

describe('billingConsumerHandler', () => {
  let db: Database
  let handler: ReturnType<typeof createBillingConsumerHandler>

  beforeAll(async () => {
    db = await mockDB(schema)
    handler = createBillingConsumerHandler(db)

    await db.insert(schema.user).values({
      id: 'user-consumer-1',
      name: 'Consumer User',
      email: 'consumer@example.com',
    })
    await db.insert(schema.userFlux).values({ userId: 'user-consumer-1', flux: 70 })
  })

  beforeEach(async () => {
    await db.delete(schema.fluxLedger)
    await db.delete(schema.fluxAuditLog)
    await db.delete(schema.llmRequestLog)
  })

  it('writes ledger + audit for flux.debited events', async () => {
    const message: BillingStreamMessage = {
      streamMessageId: '1-0',
      event: {
        eventId: 'evt-1',
        eventType: 'flux.debited',
        aggregateId: 'user-consumer-1',
        userId: 'user-consumer-1',
        requestId: 'req-1',
        occurredAt: new Date().toISOString(),
        schemaVersion: 1,
        payload: { amount: 30, balanceAfter: 70, source: 'gpt-4' },
      },
    }

    await handler.handleMessage(message)

    const ledger = await db.select().from(schema.fluxLedger).where(eq(schema.fluxLedger.userId, 'user-consumer-1'))
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({
      type: 'debit',
      amount: 30,
      balanceAfter: 70,
    })

    const audit = await db.select().from(schema.fluxAuditLog).where(eq(schema.fluxAuditLog.userId, 'user-consumer-1'))
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      type: 'consumption',
      amount: -30,
    })
  })

  it('writes request log for llm.request.log events', async () => {
    const message: BillingStreamMessage = {
      streamMessageId: '2-0',
      event: {
        eventId: 'evt-2',
        eventType: 'llm.request.log',
        aggregateId: 'user-consumer-1',
        userId: 'user-consumer-1',
        occurredAt: new Date().toISOString(),
        schemaVersion: 1,
        payload: { model: 'gpt-4', status: 200, durationMs: 1500, fluxConsumed: 30, promptTokens: 100, completionTokens: 50 },
      },
    }

    await handler.handleMessage(message)

    const logs = await db.select().from(schema.llmRequestLog)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      userId: 'user-consumer-1',
      model: 'gpt-4',
      status: 200,
      durationMs: 1500,
      fluxConsumed: 30,
    })
  })

  it('ignores flux.credited events (already handled synchronously)', async () => {
    const message: BillingStreamMessage = {
      streamMessageId: '3-0',
      event: {
        eventId: 'evt-3',
        eventType: 'flux.credited',
        aggregateId: 'user-consumer-1',
        userId: 'user-consumer-1',
        occurredAt: new Date().toISOString(),
        schemaVersion: 1,
        payload: { amount: 50, balanceAfter: 120, source: 'admin' },
      },
    }

    await handler.handleMessage(message)

    // No additional ledger/audit writes (credit already wrote them synchronously)
    const ledger = await db.select().from(schema.fluxLedger)
    expect(ledger).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm exec vitest run apps/server/src/services/__test__/billing-consumer-handler.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement billing-consumer-handler.ts**

Create `src/services/billing-consumer-handler.ts`:

```ts
import type { Database } from '../libs/db'
import type { BillingStreamMessage } from './billing-mq'

import { useLogger } from '@guiiai/logg'

import * as fluxAuditSchema from '../schemas/flux-audit-log'
import * as fluxLedgerSchema from '../schemas/flux-ledger'
import * as llmRequestLogSchema from '../schemas/llm-request-log'

const logger = useLogger('billing-consumer-handler').useGlobalConfig()

export function createBillingConsumerHandler(db: Database) {
  return {
    async handleMessage(message: BillingStreamMessage): Promise<void> {
      const { event } = message

      switch (event.eventType) {
        case 'flux.debited': {
          const balanceBefore = event.payload.balanceAfter != null
            ? event.payload.balanceAfter + event.payload.amount
            : 0

          await db.insert(fluxLedgerSchema.fluxLedger).values({
            userId: event.userId,
            type: 'debit',
            amount: event.payload.amount,
            balanceBefore,
            balanceAfter: event.payload.balanceAfter ?? balanceBefore - event.payload.amount,
            requestId: event.requestId,
            description: event.payload.source ?? 'LLM request',
          })

          await db.insert(fluxAuditSchema.fluxAuditLog).values({
            userId: event.userId,
            type: 'consumption',
            amount: -event.payload.amount,
            description: event.payload.source ?? 'LLM request',
          })

          logger.withFields({
            eventId: event.eventId,
            userId: event.userId,
            amount: event.payload.amount,
          }).log('Wrote debit ledger + audit')
          break
        }

        case 'llm.request.log': {
          await db.insert(llmRequestLogSchema.llmRequestLog).values({
            userId: event.userId,
            model: event.payload.model,
            status: event.payload.status,
            durationMs: event.payload.durationMs,
            fluxConsumed: event.payload.fluxConsumed,
            promptTokens: event.payload.promptTokens,
            completionTokens: event.payload.completionTokens,
          })

          logger.withFields({
            eventId: event.eventId,
            userId: event.userId,
            model: event.payload.model,
          }).log('Wrote LLM request log')
          break
        }

        case 'flux.credited':
        case 'stripe.checkout.completed':
        case 'llm.request.completed': {
          // These events are handled synchronously or not yet consumed.
          // Log for observability but no async DB writes needed.
          logger.withFields({
            eventId: event.eventId,
            eventType: event.eventType,
          }).log('Acknowledged event (no async action)')
          break
        }
      }
    },
  }
}

export type BillingConsumerHandler = ReturnType<typeof createBillingConsumerHandler>
```

- [ ] **Step 4: Run test**

```bash
pnpm exec vitest run apps/server/src/services/__test__/billing-consumer-handler.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/billing-consumer-handler.ts apps/server/src/services/__test__/billing-consumer-handler.test.ts
git commit -m "feat(server): add billing consumer handler for async ledger/audit/log writes"
```

---

## Task 6: Replace request log fire-and-forget with XADD in v1completions

**Files:**
- Modify: `src/routes/v1completions.ts`

- [ ] **Step 1: Update v1completions to accept billingMqService and publish llm.request.log events**

In `src/routes/v1completions.ts`:

1. Add `BillingMqService` to imports and function signature:
```ts
import type { BillingMqService } from '../services/billing-mq'
```

Change the function signature to:
```ts
export function createV1CompletionsRoutes(
  fluxService: FluxService,
  billingService: BillingService,
  configKV: ConfigKVService,
  requestLogService: RequestLogService,
  billingMq: BillingMqService,
  llm: LlmMetrics | null,
)
```

2. Replace every `requestLogService.logRequest({...}).catch(...)` call (lines 177-185, 218-226, 281-287, 346-352) with a `publishRequestLog` helper:

Add helper at the top of the function body:
```ts
function publishRequestLog(entry: { userId: string, model: string, status: number, durationMs: number, fluxConsumed: number, promptTokens?: number, completionTokens?: number }) {
  billingMq.publish({
    eventId: nanoid(),
    eventType: 'llm.request.log' as const,
    aggregateId: entry.userId,
    userId: entry.userId,
    occurredAt: new Date().toISOString(),
    schemaVersion: 1,
    payload: {
      model: entry.model,
      status: entry.status,
      durationMs: entry.durationMs,
      fluxConsumed: entry.fluxConsumed,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
    },
  }).catch(err => logger.withError(err).warn('Failed to publish request log event'))
}
```

Replace each fire-and-forget call. For example, line 177-185 becomes:
```ts
publishRequestLog({
  userId: user.id,
  model: requestModel,
  status: response.status,
  durationMs,
  fluxConsumed: actualCharged,
  promptTokens: usage.promptTokens,
  completionTokens: usage.completionTokens,
})
```

Do the same for all four locations (streaming chat, non-streaming chat, TTS, ASR).

- [ ] **Step 2: Update app.ts to pass billingMq to v1completions**

In `src/app.ts`, the `billingMq` service needs to be created and passed. Add to the injeca DI setup:

```ts
const billingMqService = injeca.provide('services:billingMq', {
  dependsOn: { redis, env: parsedEnv },
  build: ({ dependsOn }) => createBillingMqService(dependsOn.redis, {
    stream: dependsOn.env.BILLING_EVENTS_STREAM,
  }),
})
```

Add `createBillingMqService` import:
```ts
import { createBillingMqService } from './services/billing-mq'
```

Update the `billingService` provider to use `billingMqService` instead of `outboxService`:
```ts
const billingService = injeca.provide('services:billing', {
  dependsOn: { db, redis, billingMqService, configKV, otel },
  build: ({ dependsOn }) => createBillingService(dependsOn.db, dependsOn.redis, dependsOn.billingMqService, dependsOn.configKV, dependsOn.otel?.revenue),
})
```

Remove the `outboxService` provider entirely.

Remove the import:
```ts
// DELETE: import { createOutboxService } from './services/outbox-service'
```

Add `billingMqService` to the resolve and pass to `buildApp`:
- Add to `AppDeps` interface and `buildApp` params
- Pass to `createV1CompletionsRoutes`:
```ts
.route('/api/v1', createV1CompletionsRoutes(fluxService, billingService, configKV, requestLogService, billingMqService, otel?.llm ?? null))
```

- [ ] **Step 3: Verify typecheck passes**

```bash
cd apps/server && pnpm typecheck
```

Expected: PASS (no type errors)

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/v1completions.ts apps/server/src/app.ts
git commit -m "refactor(server): replace fire-and-forget request logging with XADD"
```

---

## Task 7: Rewrite bin/ entrypoints — consolidate to api + billing-consumer

**Files:**
- Create: `src/bin/run-billing-consumer.ts`
- Modify: `src/bin/run.ts`
- Delete: `src/bin/run-billing-events-consumer.ts`
- Delete: `src/bin/run-outbox-dispatcher.ts`

- [ ] **Step 1: Create run-billing-consumer.ts**

```ts
import process, { pid } from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'

import { createDrizzle, migrateDatabase } from '../libs/db'
import { parseEnv } from '../libs/env'
import { initializeExternalDependency } from '../libs/external-dependency'
import { createRedis } from '../libs/redis'
import { createBillingConsumerHandler } from '../services/billing-consumer-handler'
import { createBillingMqService } from '../services/billing-mq'
import { createBillingMqWorker } from '../services/billing-mq-worker'

function parsePositiveInteger(rawValue: string, envKey: string): number {
  const parsed = Number(rawValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envKey} must be a positive integer`)
  }

  return parsed
}

export async function runBillingConsumer(): Promise<void> {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)

  const env = parseEnv(process.env)
  const logger = useLogger('billing-consumer').useGlobalConfig()
  const { db, pool } = await initializeExternalDependency(
    'Database',
    logger,
    async (attempt) => {
      const connection = createDrizzle(env.DATABASE_URL)

      try {
        await connection.db.execute('SELECT 1')
        logger.log(`Connected to database on attempt ${attempt}`)
        await migrateDatabase(connection.db)
        logger.log(`Applied schema on attempt ${attempt}`)
        return connection
      }
      catch (error) {
        await connection.pool.end()
        throw error
      }
    },
  )
  const redis = await initializeExternalDependency(
    'Redis',
    logger,
    async (attempt) => {
      const instance = createRedis(env.REDIS_URL)

      try {
        await instance.connect()
        logger.log(`Connected to Redis on attempt ${attempt}`)
        return instance
      }
      catch (error) {
        instance.disconnect()
        throw error
      }
    },
  )

  const abortController = new AbortController()
  const consumer = env.BILLING_EVENTS_CONSUMER_NAME ?? `billing-consumer-${pid}`

  const shutdown = (signalName: string) => {
    if (abortController.signal.aborted) {
      return
    }

    logger.withFields({ signalName }).log('Stopping billing consumer')
    abortController.abort()
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))

  try {
    const mq = createBillingMqService(redis, {
      stream: env.BILLING_EVENTS_STREAM,
    })

    const handler = createBillingConsumerHandler(db)
    const worker = createBillingMqWorker(mq)

    await worker.run({
      group: 'billing-consumer',
      consumer,
      signal: abortController.signal,
      batchSize: parsePositiveInteger(env.BILLING_EVENTS_BATCH_SIZE, 'BILLING_EVENTS_BATCH_SIZE'),
      blockMs: parsePositiveInteger(env.BILLING_EVENTS_BLOCK_MS, 'BILLING_EVENTS_BLOCK_MS'),
      minIdleTimeMs: parsePositiveInteger(env.BILLING_EVENTS_MIN_IDLE_MS, 'BILLING_EVENTS_MIN_IDLE_MS'),
      onMessage: message => handler.handleMessage(message),
    })
  }
  finally {
    await redis.quit()
    await pool.end()
  }
}
```

- [ ] **Step 2: Rewrite run.ts with 2 commands**

```ts
#!/usr/bin/env node

import process from 'node:process'

import { pathToFileURL } from 'node:url'

import { errorMessageFrom } from '@moeru/std'
import { cac } from 'cac'

import { runApiServer } from '../app'
import { runBillingConsumer } from './run-billing-consumer'

const serverRoles = ['api', 'billing-consumer'] as const

type ServerRole = typeof serverRoles[number]

async function runServerRole(role: ServerRole): Promise<void> {
  switch (role) {
    case 'api':
      await runApiServer()
      return
    case 'billing-consumer':
      await runBillingConsumer()
  }
}

export function createServerCli() {
  const cli = cac('server')

  cli
    .usage('<role>')
    .command('api', 'Start the HTTP/WebSocket API process')
    .action(() => runServerRole('api'))

  cli
    .command('billing-consumer', 'Start the billing events consumer (ledger, audit, request logs)')
    .action(() => runServerRole('billing-consumer'))

  cli.help()

  return cli
}

export function parseServerRole(args: string[]): ServerRole | null {
  const cli = createServerCli()
  cli.parse(['node', 'server', ...args], { run: false })

  const role = cli.matchedCommandName
  if (!role) {
    return null
  }

  return serverRoles.includes(role as ServerRole) ? role as ServerRole : null
}

async function main(): Promise<void> {
  const cli = createServerCli()
  cli.parse(process.argv, { run: false })

  if (!cli.matchedCommand) {
    cli.outputHelp()
    process.exitCode = 1
    return
  }

  await cli.runMatchedCommand()
}

function isExecutedAsMainModule(): boolean {
  const entryFile = process.argv[1]
  if (!entryFile) {
    return false
  }

  return import.meta.url === pathToFileURL(entryFile).href
}

if (isExecutedAsMainModule()) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${errorMessageFrom(error) ?? 'Unknown error'}\n`)
    process.exit(1)
  })
}
```

- [ ] **Step 3: Delete old entrypoints**

```bash
cd apps/server
rm src/bin/run-billing-events-consumer.ts
rm src/bin/run-outbox-dispatcher.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/bin/
git commit -m "refactor(server): consolidate 3 processes into api + billing-consumer"
```

---

## Task 8: Clean up env vars and remove OUTBOX_DISPATCHER config

**Files:**
- Modify: `src/libs/env.ts`

- [ ] **Step 1: Remove outbox dispatcher env vars from env.ts**

Remove these lines from the env schema:
```ts
OUTBOX_DISPATCHER_BATCH_SIZE: optional(string(), '10'),
OUTBOX_DISPATCHER_CLAIM_TTL_MS: optional(string(), '30000'),
OUTBOX_DISPATCHER_POLL_MS: optional(string(), '1000'),
OUTBOX_DISPATCHER_NAME: optional(string()),
```

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/server && pnpm typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/libs/env.ts
git commit -m "chore(server): remove outbox dispatcher env vars"
```

---

## Task 9: Run full test suite and fix any remaining issues

- [ ] **Step 1: Run all server tests**

```bash
pnpm exec vitest run apps/server/
```

Expected: All tests PASS.

- [ ] **Step 2: Run typecheck**

```bash
cd apps/server && pnpm typecheck
```

Expected: PASS

- [ ] **Step 3: Run lint**

```bash
pnpm lint:fix
```

Expected: PASS with auto-fixes applied.

- [ ] **Step 4: Final commit if lint made changes**

```bash
git add -A apps/server/
git commit -m "chore(server): fix lint after outbox removal refactor"
```

---

## Task 10: Update Dockerfile and documentation

**Files:**
- Modify: `apps/server/Dockerfile`
- Modify: `apps/server/production/railway/Dockerfile`
- Modify: `apps/server/README.md` (if exists)

- [ ] **Step 1: Update Dockerfiles**

Check if Dockerfiles reference `outbox-dispatcher` or `cache-sync-consumer` commands and update them to only use `api` or `billing-consumer`.

- [ ] **Step 2: Update any documentation referencing the 3-process architecture**

Search the repo for references to `outbox-dispatcher`, `cache-sync-consumer`, `outbox` in docs/README files and update them to reflect the new 2-process architecture.

- [ ] **Step 3: Commit**

```bash
git add apps/server/Dockerfile apps/server/production/railway/Dockerfile
git commit -m "docs(server): update Dockerfiles and docs for 2-process architecture"
```
