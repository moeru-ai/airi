import { describe, expect, it } from 'vitest'

import { parseTurnId } from '../turn-id'

describe('parseTurnId', () => {
  // https://github.com/moeru-ai/airi/pull/2491#discussion_r3960258109
  // ROOT CAUSE:
  //
  // Correlation values crossed HTTP and WebSocket boundaries
  // without one schema. Manual checks could accept different shapes at each path.
  //
  // One Valibot schema validates the existing turn ID at every boundary.
  it('normalizes a turnId without a conversation identifier', () => {
    expect(parseTurnId(' turn-1 ')).toBe('turn-1')
  })

  it('rejects missing, blank, non-string, and oversized turn IDs', () => {
    expect(parseTurnId(undefined)).toBeUndefined()
    expect(parseTurnId('\t')).toBeUndefined()
    expect(parseTurnId(123)).toBeUndefined()
    expect(parseTurnId('x'.repeat(129))).toBeUndefined()
    expect(parseTurnId('😀'.repeat(65))).toBeUndefined()
  })
})
