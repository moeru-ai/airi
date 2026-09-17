import { describe, expect, it } from 'vitest'

import { resolveTtsBillingCorrelation } from '../tts-correlation'

describe('ttsBillingCorrelation', () => {
  // https://github.com/moeru-ai/airi/pull/2491#discussion_r3960258109
  // ROOT CAUSE:
  //
  // Correlation values crossed HTTP and WebSocket boundaries
  // without one schema. Manual checks could accept different shapes at each path.
  //
  // One Valibot schema validates the existing turn ID at every boundary.
  it('normalizes a turnId without a conversation identifier', () => {
    expect(resolveTtsBillingCorrelation({
      turnId: ' turn-1 ',
    })).toEqual({
      turnId: 'turn-1',
    })
  })

  it('rejects missing, blank, non-string, and oversized turn IDs', () => {
    expect(resolveTtsBillingCorrelation({})).toBeUndefined()
    expect(resolveTtsBillingCorrelation({ turnId: '\t' })).toBeUndefined()
    expect(resolveTtsBillingCorrelation({ turnId: 123 })).toBeUndefined()
    expect(resolveTtsBillingCorrelation({ turnId: 'x'.repeat(129) })).toBeUndefined()
    expect(resolveTtsBillingCorrelation({ turnId: '😀'.repeat(65) })).toBeUndefined()
  })
})
