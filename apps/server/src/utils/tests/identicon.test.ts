import { describe, expect, it } from 'vitest'

import { generateIdenticon } from '../identicon'

const PNG_MAGIC_BYTES = [137, 80, 78, 71, 13, 10, 26, 10]

describe('generateIdenticon', () => {
  it('returns the same buffer for the same userId (deterministic)', async () => {
    const result1 = await generateIdenticon('user-123')
    const result2 = await generateIdenticon('user-123')
    expect(Buffer.from(result1).equals(Buffer.from(result2))).toBe(true)
  })

  it('returns different buffers for different userIds (unique)', async () => {
    const resultA = await generateIdenticon('user-a')
    const resultB = await generateIdenticon('user-b')
    expect(Buffer.from(resultA).equals(Buffer.from(resultB))).toBe(false)
  })

  it('returns a non-empty Buffer', async () => {
    const result = await generateIdenticon('user-123')
    expect(result).toBeInstanceOf(Buffer)
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a valid PNG buffer (correct magic bytes header)', async () => {
    const result = await generateIdenticon('user-123')
    const header = Array.from(result.slice(0, 8))
    expect(header).toEqual(PNG_MAGIC_BYTES)
  })
})
