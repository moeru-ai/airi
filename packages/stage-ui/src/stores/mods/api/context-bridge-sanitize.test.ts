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

  it('preserves structured-cloneable built-ins', async () => {
    const payload = new Uint8Array([1, 2, 3])
    const buffer = payload.buffer.slice(0)
    const blob = new Blob(['hello'])
    const input = {
      metadata: {
        mapping: new Map([['key', 7n]]),
        seen: new Set(['a', 'b']),
        payload,
        buffer,
        blob,
      },
    }

    const sanitized = sanitizeCloneable(input)
    const cloned = structuredClone(sanitized)

    expect(cloned).toEqual({
      metadata: {
        mapping: new Map([['key', 7n]]),
        seen: new Set(['a', 'b']),
        payload,
        buffer,
        blob,
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
