import { describe, expect, it } from 'vitest'

import { supportsResponsesAudioInputEndpoint } from './generation'

describe('responses audio input endpoints', () => {
  it('accepts the OpenRouter Responses endpoint', () => {
    expect(supportsResponsesAudioInputEndpoint('https://openrouter.ai/api/v1')).toBe(true)
    expect(supportsResponsesAudioInputEndpoint('https://openrouter.ai/api/v1/')).toBe(true)
  })

  // The OpenAI Responses API rejects `input_audio`, so its voice messages go as transcripts.
  it('rejects other endpoints and incomplete drafts', () => {
    expect(supportsResponsesAudioInputEndpoint('https://api.openai.com/v1')).toBe(false)
    expect(supportsResponsesAudioInputEndpoint('https://example.com/api/v1')).toBe(false)
    expect(supportsResponsesAudioInputEndpoint('https://openrouter.ai/other')).toBe(false)
    expect(supportsResponsesAudioInputEndpoint('openrouter.ai/api/v1')).toBe(false)
  })
})
