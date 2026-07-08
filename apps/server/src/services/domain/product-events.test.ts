import type { Database } from '../../libs/db'
import type { ProductMetrics } from '../../otel'

import { sql } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createProductEventService } from './product-events'

import * as schema from '../../schemas'

describe('productEventService', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  beforeEach(async () => {
    await db.delete(schema.productEvents)
  })

  it('writes first-party events and increments only low-cardinality metric labels', async () => {
    const events = { add: vi.fn() }
    const service = createProductEventService(db, { events } as unknown as ProductMetrics)

    await service.track({
      userId: 'user-1',
      feature: 'gen_ai_chat',
      action: 'completion_succeeded',
      status: 'succeeded',
      source: 'openai.chat.completions',
      model: 'openrouter/anthropic/claude-sonnet-4',
      provider: 'openrouter',
      metadata: {
        stream: false,
        flux_consumed: 3,
      },
    })

    const rows = await db.select().from(schema.productEvents)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      userId: 'user-1',
      feature: 'gen_ai_chat',
      action: 'completion_succeeded',
      status: 'succeeded',
      source: 'openai.chat.completions',
      model: 'openrouter/anthropic/claude-sonnet-4',
      provider: 'openrouter',
    })

    expect(events.add).toHaveBeenCalledWith(1, {
      feature: 'gen_ai_chat',
      action: 'completion_succeeded',
      status: 'succeeded',
      source: 'openai.chat.completions',
    })
  })

  it('aggregates event volume and distinct users by feature/action/status', async () => {
    const service = createProductEventService(db)
    const createdAt = new Date('2026-06-03T00:00:00.000Z')

    await service.track({
      userId: 'user-1',
      feature: 'tts',
      action: 'speech_succeeded',
      status: 'succeeded',
      source: 'audio.speech',
      createdAt,
    })
    await service.track({
      userId: 'user-1',
      feature: 'tts',
      action: 'speech_succeeded',
      status: 'succeeded',
      source: 'audio.speech.ws',
      createdAt,
    })
    await service.track({
      userId: 'user-2',
      feature: 'tts',
      action: 'speech_succeeded',
      status: 'succeeded',
      source: 'audio.speech',
      createdAt,
    })

    const rows = await service.countDistinctUsersByFeature({
      from: new Date('2026-06-02T00:00:00.000Z'),
      to: new Date('2026-06-04T00:00:00.000Z'),
    })

    expect(rows).toEqual([{
      feature: 'tts',
      action: 'speech_succeeded',
      status: 'succeeded',
      eventCount: 3,
      distinctUsers: 2,
    }])
  })

  it('writes blocked TTS events for server-side preflight decisions', async () => {
    const events = { add: vi.fn() }
    const service = createProductEventService(db, { events } as unknown as ProductMetrics)

    await service.track({
      userId: 'user-1',
      feature: 'tts',
      action: 'speech_blocked',
      status: 'blocked',
      source: 'chat_auto_tts',
      reason: 'insufficient_balance',
      metadata: {
        trigger: 'auto',
        balance_state: 'insufficient',
        flux_balance_bucket: 'zero',
      },
    })

    const rows = await db.select().from(schema.productEvents)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      feature: 'tts',
      action: 'speech_blocked',
      status: 'blocked',
      source: 'chat_auto_tts',
      reason: 'insufficient_balance',
    })
    expect(events.add).toHaveBeenCalledWith(1, {
      feature: 'tts',
      action: 'speech_blocked',
      status: 'blocked',
      source: 'chat_auto_tts',
      reason: 'insufficient_balance',
      flux_balance_bucket: 'zero',
    })
  })

  it('forwards allowlisted business facts to PostHog keyed by user id, mapping user_signed_up to signup_completed', async () => {
    const capture = vi.fn(async () => {})
    const sink = { capture, shutdown: vi.fn(async () => {}) }
    const service = createProductEventService(db, null, sink)

    await service.track({
      userId: 'user-1',
      feature: 'billing',
      action: 'payment_completed',
      status: 'succeeded',
      source: 'stripe.webhook',
      metadata: { amount_minor_unit: 990, currency: 'usd' },
    })
    await service.track({
      userId: 'user-2',
      feature: 'auth',
      action: 'user_signed_up',
      status: 'succeeded',
    })

    expect(capture).toHaveBeenNthCalledWith(1, {
      distinctId: 'user-1',
      event: 'payment_completed',
      properties: {
        surface: 'server',
        feature: 'billing',
        status: 'succeeded',
        source: 'stripe.webhook',
        amount_minor_unit: 990,
        currency: 'usd',
      },
    })
    expect(capture).toHaveBeenNthCalledWith(2, {
      distinctId: 'user-2',
      event: 'signup_completed',
      properties: {
        surface: 'server',
        feature: 'auth',
        status: 'succeeded',
      },
    })

    const rows = await db.select().from(schema.productEvents)
    expect(rows).toHaveLength(2)
  })

  it('does not forward high-volume per-request actions to PostHog', async () => {
    const capture = vi.fn(async () => {})
    const sink = { capture, shutdown: vi.fn(async () => {}) }
    const service = createProductEventService(db, null, sink)

    await service.track({
      userId: 'user-1',
      feature: 'gen_ai_chat',
      action: 'completion_succeeded',
      status: 'succeeded',
    })
    await service.track({
      userId: 'user-1',
      feature: 'billing',
      action: 'checkout_started',
      status: 'started',
    })

    expect(capture).not.toHaveBeenCalled()
    const rows = await db.select().from(schema.productEvents)
    expect(rows).toHaveLength(2)
  })

  it('does not forward to PostHog when the DB write fails', async () => {
    // ROOT CAUSE:
    //
    // track() swallows DB insert errors to protect the caller, but the
    // PostHog forwarding block ran unconditionally afterwards — a Postgres
    // outage during a Stripe webhook would mint `payment_completed` in
    // PostHog with no `product_events` row backing it, breaking the
    // "Postgres is the fact of record" invariant and later reconciliation.
    // Found by PR #2038 review.
    //
    // Fixed by gating forwarding on a `persisted` flag set only after the
    // insert resolves.
    const capture = vi.fn(async () => {})
    const sink = { capture, shutdown: vi.fn(async () => {}) }
    const service = createProductEventService(db, null, sink)

    // Simulate a DB outage by renaming the table out from under the insert.
    await db.execute(sql`ALTER TABLE product_events RENAME TO product_events_outage`)
    try {
      await expect(service.track({
        userId: 'user-1',
        feature: 'billing',
        action: 'payment_completed',
        status: 'succeeded',
      })).resolves.toBeUndefined()
    }
    finally {
      await db.execute(sql`ALTER TABLE product_events_outage RENAME TO product_events`)
    }

    expect(capture).not.toHaveBeenCalled()
    const rows = await db.select().from(schema.productEvents)
    expect(rows).toHaveLength(0)
  })

  it('persists the product event even when a misbehaving sink throws', async () => {
    // ROOT CAUSE:
    //
    // The PosthogSink contract says implementations swallow transport
    // errors, but the forwarding call sits on the Stripe webhook path —
    // if a sink ever throws, an unguarded `await` would fail the webhook
    // after the fact was already persisted, causing Stripe to retry and
    // (before the idempotency guard) double-process the payment.
    //
    // track() therefore wraps forwarding in its own try/catch: the DB row
    // must survive and track() must resolve regardless of sink behavior.
    const capture = vi.fn(async () => {
      throw new Error('posthog exploded')
    })
    const sink = { capture, shutdown: vi.fn(async () => {}) }
    const service = createProductEventService(db, null, sink)

    await expect(service.track({
      userId: 'user-1',
      feature: 'billing',
      action: 'payment_completed',
      status: 'succeeded',
    })).resolves.toBeUndefined()

    const rows = await db.select().from(schema.productEvents)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ action: 'payment_completed', status: 'succeeded' })
  })
})
