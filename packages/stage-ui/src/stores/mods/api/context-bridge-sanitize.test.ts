import { describe, expect, it } from 'vitest'

import { sanitizeCloneable } from './context-bridge-sanitize'

describe('sanitizeCloneable', () => {
  it('preserves cloneable bigint values', () => {
    const input = {
      metadata: {
        count: 3n,
        nested: [1n, { latest: 5n }],
      },
    }

    const sanitized = sanitizeCloneable(input)
    const cloned = structuredClone(sanitized)

    expect(cloned).toEqual({
      metadata: {
        count: 3n,
        nested: [1n, { latest: 5n }],
      },
    })
  })

  it('removes nested non-cloneable values and stays structuredClone-safe', () => {
    const input = {
      text: 'vision update',
      metadata: {
        safe: 'ok',
        nested: {
          window: globalThis,
          fn: () => 'bad',
          arr: [1, { keep: true, drop: globalThis }],
        },
      },
    }

    const sanitized = sanitizeCloneable(input)
    const cloned = structuredClone(sanitized)

    expect(cloned).toEqual({
      text: 'vision update',
      metadata: {
        safe: 'ok',
        nested: {
          arr: [1, { keep: true }],
        },
      },
    })
  })
})
