import { describe, expect, it } from 'vitest'

import { createTtsBillingHistoryGroupKey, resolveTtsBillingCorrelation, resolveTtsBillingCorrelationToken, serializeTtsBillingCorrelation } from '../tts-correlation'

describe('ttsBillingCorrelation', () => {
  // https://github.com/moeru-ai/airi/pull/2491#discussion_r3960258109
  // ROOT CAUSE:
  //
  // Correlation values crossed HTTP, WebSocket, Redis, and database boundaries
  // without one schema. Manual checks could accept different shapes at each path.
  //
  // One Valibot schema now validates the complete pair at every boundary.
  it('normalizes a complete conversation and round pair', () => {
    expect(resolveTtsBillingCorrelation({
      conversationId: ' conversation-1 ',
      roundId: ' round-1 ',
    })).toEqual({
      conversationId: 'conversation-1',
      roundId: 'round-1',
    })
  })

  it('rejects incomplete and oversized pairs', () => {
    expect(resolveTtsBillingCorrelation({ roundId: 'round-1' })).toBeUndefined()
    expect(resolveTtsBillingCorrelation({
      conversationId: 'conversation-1',
      roundId: 'x'.repeat(129),
    })).toBeUndefined()
  })

  it('round-trips a validated Redis owner token', () => {
    const correlation = { conversationId: 'conversation-1', roundId: 'round-1' }
    expect(resolveTtsBillingCorrelationToken(serializeTtsBillingCorrelation(correlation))).toEqual(correlation)
    expect(resolveTtsBillingCorrelationToken('__mixed__')).toBeUndefined()
  })

  it('builds a stable persisted history group key', () => {
    expect(createTtsBillingHistoryGroupKey({
      conversationId: 'conversation-1',
      roundId: 'round-1',
    })).toBe('["tts_round","conversation-1","round-1"]')
  })
})
