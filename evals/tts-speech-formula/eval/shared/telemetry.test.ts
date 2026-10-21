import { describe, expect, it } from 'vitest'

import { usageRecord } from './telemetry'

describe('usageRecord', () => {
  it('uses the Chat Completions names that the vieval viewer reads', () => {
    expect(usageRecord({ inputTokens: 120, outputTokens: 30, totalTokens: 150 })).toEqual({ completion_tokens: 30, prompt_tokens: 120, total_tokens: 150 })
  })
})
