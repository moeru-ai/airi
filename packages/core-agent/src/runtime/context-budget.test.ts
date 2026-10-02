import { describe, expect, it } from 'vitest'

import { createContextText, limitContextText, loadContextTokenCounter } from '../context'

describe('producer observation budget', () => {
  it('keeps exactly 80 tokens with a cloned origin handle', async () => {
    const text = `hello${' hello'.repeat(79)}`
    const sourceRef = { refType: 'test', targetId: 'status' }
    const countContextTokens = await loadContextTokenCounter()
    const observation = await createContextText(text, sourceRef)

    expect(countContextTokens(text)).toBe(80)
    expect(observation.text).toBe(text)
    expect(observation.sourceRef).toEqual(sourceRef)
    expect(observation.sourceRef).not.toBe(sourceRef)
  })

  it('replaces 81 tokens with a reference without truncating source details', async () => {
    const text = `hello${' hello'.repeat(80)}`
    const sourceRef = { refType: 'test', targetId: 'status' }
    const countContextTokens = await loadContextTokenCounter()
    const observation = await createContextText(text, sourceRef)

    expect(countContextTokens(text)).toBe(81)
    expect(observation.text).toBe('Source details: test/status')
    expect(observation.sourceRef).toEqual(sourceRef)
    expect(countContextTokens(observation.text)).toBeLessThanOrEqual(80)
  })

  it('counts untrusted control markers as text', async () => {
    expect((await createContextText('<|endoftext|>', { refType: 'test', targetId: 'status' })).text).toBe('<|endoftext|>')
  })

  it('rejects an origin handle that cannot fit the budget', async () => {
    await expect(createContextText(' hello'.repeat(81), { refType: 'test', targetId: ' hello'.repeat(81) })).rejects.toThrow(RangeError)
  })

  it('shares one loaded counter between callers', async () => {
    expect(await loadContextTokenCounter()).toBe(await loadContextTokenCounter())
  })
})

describe('source detail limit', () => {
  it('returns text within the limit unchanged', async () => {
    const countTokens = await loadContextTokenCounter()
    expect(limitContextText('short details', countTokens, 10)).toEqual({ text: 'short details', truncated: false })
  })

  it('cuts oversized details to the longest prefix within the limit without splitting a code point', async () => {
    const countTokens = await loadContextTokenCounter()
    const text = '😀 玩家 hello '.repeat(200)
    const limited = limitContextText(text, countTokens, 50)

    expect(limited.truncated).toBe(true)
    expect(countTokens(limited.text)).toBeLessThanOrEqual(50)
    expect(text.startsWith(limited.text)).toBe(true)
    expect(countTokens(Array.from(text).slice(0, Array.from(limited.text).length + 1).join(''))).toBeGreaterThan(50)
    expect(limited.text).not.toMatch(/[\uD800-\uDBFF]$/)
  })
})
