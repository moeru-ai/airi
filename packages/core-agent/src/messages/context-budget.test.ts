import { describe, expect, it } from 'vitest'

import { DEFAULT_CONTEXT_HARD_LIMIT_BYTES, DEFAULT_CONTEXT_SOFT_LIMIT_BYTES, measureContextBudget, resolveContextBudgetLimits } from './context-budget'

describe('measureContextBudget', () => {
  it('reports text and inline image bytes separately without token conversion', () => {
    const value = {
      messages: [{ role: 'user', content: [
        { type: 'text', text: '看图' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(32)}` } },
      ] }],
      tools: [{ type: 'function', function: { name: 'observe', parameters: { type: 'object' } } }],
    }

    const budget = measureContextBudget(value)

    expect(budget.imageBytes).toBeGreaterThan(32)
    expect(budget.textBytes).toBeGreaterThan(0)
    expect(budget.totalBytes).toBe(budget.textBytes + budget.imageBytes)
  })

  it('keeps non-image data in the text and tool budget', () => {
    const value = { messages: [{ role: 'user', content: [{ type: 'text', text: 'data:image/png;base64,not-an-image-field' }] }] }

    const budget = measureContextBudget(value)

    expect(budget.imageBytes).toBe(0)
    expect(budget.textBytes).toBe(budget.totalBytes)
  })

  it('does not classify Responses file_data as an image payload', () => {
    const value = { input: [{ type: 'input_file', filename: 'brief.pdf', file_data: 'data:application/pdf;base64,JVBERi0x' }] }

    const budget = measureContextBudget(value)

    expect(budget.imageBytes).toBe(0)
    expect(budget.textBytes).toBe(budget.totalBytes)
  })

  it('uses model context, output reserve and safety margin when metadata is available', () => {
    const limits = resolveContextBudgetLimits({ contextWindowTokens: 100_000, requestedOutputTokens: 8_000, modelMaxOutputTokens: 16_000 })

    expect(limits).toMatchObject({
      contextWindowTokens: 100_000,
      outputReserveTokens: 8_000,
      safetyMarginTokens: 5_000,
      softLimitBytes: 65_250,
      hardLimitBytes: 87_000,
      source: 'provider-model-metadata',
    })
  })

  it('uses explicit bounded byte limits when the model context is unknown', () => {
    expect(resolveContextBudgetLimits({})).toMatchObject({
      softLimitBytes: DEFAULT_CONTEXT_SOFT_LIMIT_BYTES,
      hardLimitBytes: DEFAULT_CONTEXT_HARD_LIMIT_BYTES,
      source: 'bounded-byte-fallback',
    })
  })

  it('does not shrink the actual output reservation to invent remaining input capacity', () => {
    const limits = resolveContextBudgetLimits({ contextWindowTokens: 4096, requestedOutputTokens: 4096 })

    expect(limits.outputReserveTokens).toBe(4096)
    expect(limits.hardLimitBytes).toBe(0)
    expect(limits.softLimitBytes).toBe(0)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])('uses bounded fallback for invalid window metadata %s', (contextWindowTokens) => {
    expect(resolveContextBudgetLimits({ contextWindowTokens }).source).toBe('bounded-byte-fallback')
  })
})
