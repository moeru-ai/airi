import { describe, expect, it } from 'vitest'

import { parseBillingEvent, serializeBillingEvent } from '../billing-events'

describe('billingEvents', () => {
  it('serializes and parses a flux debited event', () => {
    const event = {
      eventId: 'evt-1',
      eventType: 'flux.debited' as const,
      aggregateId: 'user-1',
      userId: 'user-1',
      requestId: 'req-1',
      occurredAt: '2026-03-24T00:00:00.000Z',
      schemaVersion: 1,
      payload: {
        amount: 12,
        balanceAfter: 88,
        source: 'llm',
        description: 'gpt-5',
        metadata: { promptTokens: 100, completionTokens: 200 },
      },
    }

    const serialized = serializeBillingEvent(event)
    expect(serialized).toEqual({
      event_id: 'evt-1',
      event_type: 'flux.debited',
      aggregate_id: 'user-1',
      user_id: 'user-1',
      request_id: 'req-1',
      occurred_at: '2026-03-24T00:00:00.000Z',
      schema_version: '1',
      payload: JSON.stringify({
        amount: 12,
        balanceAfter: 88,
        source: 'llm',
        description: 'gpt-5',
        metadata: { promptTokens: 100, completionTokens: 200 },
      }),
    })

    expect(parseBillingEvent(serialized)).toEqual(event)
  })

  it('serializes and parses a flux credited event without request id', () => {
    const event = {
      eventId: 'evt-2',
      eventType: 'flux.credited' as const,
      aggregateId: 'user-2',
      userId: 'user-2',
      occurredAt: '2026-03-24T00:00:00.000Z',
      schemaVersion: 1,
      payload: {
        amount: 20,
        balanceAfter: 120,
        source: 'stripe',
      },
    }

    expect(parseBillingEvent(serializeBillingEvent(event))).toEqual(event)
  })

  it('parses stripe checkout completed payloads', () => {
    const parsed = parseBillingEvent({
      event_id: 'evt-3',
      event_type: 'stripe.checkout.completed',
      aggregate_id: 'checkout-1',
      user_id: 'user-3',
      occurred_at: '2026-03-24T00:00:00.000Z',
      schema_version: '1',
      payload: JSON.stringify({
        stripeEventId: 'stripe-evt-1',
        stripeSessionId: 'cs_test_123',
        amount: 999,
        currency: 'usd',
      }),
    })

    expect(parsed).toEqual({
      eventId: 'evt-3',
      eventType: 'stripe.checkout.completed',
      aggregateId: 'checkout-1',
      userId: 'user-3',
      occurredAt: '2026-03-24T00:00:00.000Z',
      schemaVersion: 1,
      payload: {
        stripeEventId: 'stripe-evt-1',
        stripeSessionId: 'cs_test_123',
        amount: 999,
        currency: 'usd',
      },
    })
  })

  it('parses llm request completed payloads', () => {
    const parsed = parseBillingEvent({
      event_id: 'evt-4',
      event_type: 'llm.request.completed',
      aggregate_id: 'req-4',
      user_id: 'user-4',
      request_id: 'req-4',
      occurred_at: '2026-03-24T00:00:00.000Z',
      schema_version: '1',
      payload: JSON.stringify({
        model: 'gpt-5',
        status: 200,
        fluxConsumed: 3,
        promptTokens: 100,
        completionTokens: 200,
      }),
    })

    expect(parsed).toEqual({
      eventId: 'evt-4',
      eventType: 'llm.request.completed',
      aggregateId: 'req-4',
      userId: 'user-4',
      requestId: 'req-4',
      occurredAt: '2026-03-24T00:00:00.000Z',
      schemaVersion: 1,
      payload: {
        model: 'gpt-5',
        status: 200,
        fluxConsumed: 3,
        promptTokens: 100,
        completionTokens: 200,
      },
    })
  })

  it('throws when payload json is invalid', () => {
    expect(() => parseBillingEvent({
      event_id: 'evt-5',
      event_type: 'flux.debited',
      aggregate_id: 'user-5',
      user_id: 'user-5',
      occurred_at: '2026-03-24T00:00:00.000Z',
      schema_version: '1',
      payload: '{',
    })).toThrow()
  })

  it('throws when payload shape does not match event type', () => {
    expect(() => parseBillingEvent({
      event_id: 'evt-6',
      event_type: 'stripe.checkout.completed',
      aggregate_id: 'checkout-6',
      user_id: 'user-6',
      occurred_at: '2026-03-24T00:00:00.000Z',
      schema_version: '1',
      payload: JSON.stringify({
        amount: 100,
        currency: 'usd',
      }),
    })).toThrow()
  })
})
