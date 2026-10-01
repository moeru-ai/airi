import { describe, expect, it } from 'vitest'

import { createContextText, loadContextTokenCounter } from '../context'

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
