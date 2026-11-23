import { describe, expect, it, vi } from 'vitest'

import { assertRetainedContextFits, ContextAdmissionError, createContextTokenCountCache, estimateContextTokenUsage, measureRequestTokenUsage } from './context-token-usage'

const identity = {
  model: 'fixture-model',
  providerId: 'fixture-provider',
  contextWindowTokens: 1_000,
  outputReserveTokens: 100,
}

describe('estimateContextTokenUsage', () => {
  it('counts CJK more densely than Latin text and keeps the source estimated', () => {
    const chinese = estimateContextTokenUsage('你好世界', identity)
    const latin = estimateContextTokenUsage('abcd', identity)

    expect(chinese.inputTokens).toBe(4)
    expect(latin.inputTokens).toBe(1)
    expect(chinese.source).toBe('estimated')
    expect(chinese.model).toBe('fixture-model')
    expect(chinese.providerId).toBe('fixture-provider')
  })

  it('includes tool schema text and does not scale inline images with their byte size', () => {
    const messages = { messages: [{ role: 'user', content: 'hello' }] }
    const withTools = {
      messages: [{ role: 'user', content: 'hello' }],
      tools: [{ type: 'function', function: { name: 'observe', description: 'Read the desktop', parameters: { type: 'object', properties: { id: { type: 'string' } } } } }],
    }
    const shortImage = estimateContextTokenUsage({
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }],
    }, identity)
    const longImage = estimateContextTokenUsage({
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(4000)}` } }] }],
    }, identity)

    expect(estimateContextTokenUsage(withTools, identity).inputTokens).toBeGreaterThan(estimateContextTokenUsage(messages, identity).inputTokens)
    expect(shortImage.inputTokens).toBe(longImage.inputTokens)
    expect(shortImage.source).toBe('estimated')
  })
})

describe('measureRequestTokenUsage', () => {
  it('does not call the provider counter while the estimate is below the threshold', async () => {
    const countInputTokens = vi.fn(async () => 20)
    const usage = await measureRequestTokenUsage({
      payload: 'hello',
      identity,
      budget: { inputBudgetTokens: 800 },
      counter: { capability: 'openai-responses-input-tokens', countInputTokens },
    })

    expect(countInputTokens).not.toHaveBeenCalled()
    expect(usage.source).toBe('estimated')
  })

  it('uses a provider count near the threshold and does not reuse it for another model', async () => {
    const countInputTokens = vi.fn(async () => 90)
    const cache = createContextTokenCountCache()
    const payload = { input: [{ type: 'message', role: 'user', content: 'x'.repeat(400) }] }
    const first = await measureRequestTokenUsage({
      payload,
      identity,
      budget: { inputBudgetTokens: 100 },
      counter: { capability: 'openai-responses-input-tokens', countInputTokens },
      cache,
    })
    const second = await measureRequestTokenUsage({
      payload,
      identity,
      budget: { inputBudgetTokens: 100 },
      counter: { capability: 'openai-responses-input-tokens', countInputTokens },
      cache,
    })
    const otherModel = await measureRequestTokenUsage({
      payload,
      identity: { ...identity, model: 'other-model' },
      budget: { inputBudgetTokens: 100 },
      counter: { capability: 'openai-responses-input-tokens', countInputTokens },
      cache,
    })

    expect(first).toMatchObject({ inputTokens: 90, source: 'provider-counted', model: 'fixture-model' })
    expect(second.source).toBe('provider-counted')
    expect(otherModel).toMatchObject({ inputTokens: 90, source: 'provider-counted', model: 'other-model' })
    expect(countInputTokens).toHaveBeenCalledTimes(2)
  })

  it('stops when the caller aborts the provider count', async () => {
    const signal = AbortSignal.abort()
    await expect(measureRequestTokenUsage({
      payload: 'x'.repeat(400),
      identity,
      budget: { inputBudgetTokens: 10 },
      signal,
      counter: {
        capability: 'openai-responses-input-tokens',
        countInputTokens: async () => {
          throw new Error('aborted')
        },
      },
    })).rejects.toThrow('aborted')
  })

  it('keeps the estimate when the provider counter fails', async () => {
    const usage = await measureRequestTokenUsage({
      payload: 'x'.repeat(400),
      identity,
      budget: { inputBudgetTokens: 10 },
      counter: { capability: 'anthropic-messages-count-tokens', countInputTokens: async () => {
        throw new Error('count failed')
      } },
    })

    expect(usage.source).toBe('estimated')
    expect(usage.inputTokens).toBeGreaterThan(0)
  })

  it('uses a local tokenizer when the request is below the provider threshold', async () => {
    const usage = await measureRequestTokenUsage({
      payload: 'hello',
      identity,
      budget: { inputBudgetTokens: 800 },
      localTokenizer: { countTokens: () => 7 },
    })

    expect(usage).toMatchObject({ inputTokens: 7, source: 'local-tokenizer' })
  })
})

describe('assertRetainedContextFits', () => {
  it('refuses an estimate that exceeds the full window and names the source', () => {
    expect(() => assertRetainedContextFits({
      inputTokens: 1_001,
      outputReserveTokens: 100,
      contextWindowTokens: 1_000,
      source: 'estimated',
      model: 'fixture-model',
      providerId: 'fixture-provider',
    })).toThrow(ContextAdmissionError)
    expect(() => assertRetainedContextFits({
      inputTokens: 1_001,
      outputReserveTokens: 100,
      contextWindowTokens: 1_000,
      source: 'estimated',
      model: 'fixture-model',
      providerId: 'fixture-provider',
    })).toThrow(/Execution receipts were not removed/)
  })

  it('refuses a provider count that exceeds the window minus the output reserve', () => {
    expect(() => assertRetainedContextFits({
      inputTokens: 950,
      outputReserveTokens: 100,
      contextWindowTokens: 1_000,
      source: 'provider-counted',
      model: 'fixture-model',
      providerId: 'fixture-provider',
    })).toThrow(ContextAdmissionError)
  })

  it('does not refuse an unavailable count or an estimate inside the window', () => {
    expect(() => assertRetainedContextFits({
      inputTokens: 0,
      outputReserveTokens: 0,
      contextWindowTokens: 0,
      source: 'unavailable',
      model: 'fixture-model',
      providerId: 'fixture-provider',
    })).not.toThrow()
    expect(() => assertRetainedContextFits({
      inputTokens: 900,
      outputReserveTokens: 100,
      contextWindowTokens: 1_000,
      source: 'estimated',
      model: 'fixture-model',
      providerId: 'fixture-provider',
    })).not.toThrow()
  })
})
