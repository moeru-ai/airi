import { describe, expect, it } from 'vitest'

import { extractUsageFromBody } from './generation-usage'

describe('extractUsageFromBody', () => {
  it('keeps valid accounting when optional provider metadata is malformed', () => {
    const body = { id: 'gen-1', provider: 42, usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.002, prompt_tokens_details: 'invalid' } }
    const usage = extractUsageFromBody(body)
    expect(usage).toMatchObject({ generationId: 'gen-1', promptTokens: 100, completionTokens: 20, providerUsage: body.usage })
  })

  it('projects accounting metadata without storing completion content or request headers', () => {
    const usage = extractUsageFromBody({
      id: 'gen-1',
      provider: 'Inference Provider',
      model: 'actual-model',
      service_tier: 'priority',
      upstream_id: 'upstream-1',
      request_id: 'gateway-1',
      headers: { authorization: 'secret' },
      choices: [{ finish_reason: 'stop', native_finish_reason: 'end_turn', message: { content: 'private output' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 80, cache_write_tokens: 10 }, completion_tokens_details: { reasoning_tokens: 5 }, extra_meter: { units: 4 } },
    })
    expect(usage).toMatchObject({
      upstreamProvider: 'Inference Provider',
      responseModel: 'actual-model',
      cachedTokens: 80,
      cacheWriteTokens: 10,
      reasoningTokens: 5,
      finishReason: 'stop',
      nativeFinishReason: 'end_turn',
      providerMetadata: { service_tier: 'priority', upstream_id: 'upstream-1', request_id: 'gateway-1' },
      providerUsage: { extra_meter: { units: 4 } },
    })
    expect(JSON.stringify(usage)).not.toContain('private output')
    expect(JSON.stringify(usage)).not.toContain('secret')
  })

  it('returns promptTokens and completionTokens from a normal body', () => {
    const body = { usage: { prompt_tokens: 100, completion_tokens: 200 } }
    expect(extractUsageFromBody(body)).toEqual({ promptTokens: 100, completionTokens: 200, providerUsage: body.usage })
  })

  it('retains the returned model even when usage is missing', () => {
    expect(extractUsageFromBody({ model: 'gpt-4' })).toEqual({ responseModel: 'gpt-4' })
  })

  it('returns empty object for null body', () => {
    expect(extractUsageFromBody(null)).toEqual({})
  })

  it('returns empty object for undefined body', () => {
    expect(extractUsageFromBody(undefined)).toEqual({})
  })

  it('retains a null receipt without inventing token usage', () => {
    expect(extractUsageFromBody({ usage: null })).toEqual({ providerUsage: null })
  })

  it('retains invalid usage for reconciliation without inventing token usage', () => {
    expect(extractUsageFromBody({ usage: 0 })).toEqual({ providerUsage: 0 })
  })

  it('returns only promptTokens when completion_tokens is missing', () => {
    const body = { usage: { prompt_tokens: 50 } }
    const result = extractUsageFromBody(body)
    expect(result.promptTokens).toBe(50)
    expect(result.completionTokens).toBeUndefined()
  })

  it('returns only completionTokens when prompt_tokens is missing', () => {
    const body = { usage: { completion_tokens: 75 } }
    const result = extractUsageFromBody(body)
    expect(result.promptTokens).toBeUndefined()
    expect(result.completionTokens).toBe(75)
  })

  it('treats explicit null fields in usage as undefined', () => {
    const body = { usage: { prompt_tokens: null, completion_tokens: null } }
    const result = extractUsageFromBody(body)
    expect(result.promptTokens).toBeUndefined()
    expect(result.completionTokens).toBeUndefined()
  })

  it('handles zero token values correctly', () => {
    const body = { usage: { prompt_tokens: 0, completion_tokens: 0 } }
    const result = extractUsageFromBody(body)
    expect(result.promptTokens).toBe(0)
    expect(result.completionTokens).toBe(0)
  })
})
