import { describe, expect, it } from 'vitest'

import { resolveProviderSourceMetadata } from './source-metadata'

describe('provider source metadata', () => {
  it('does not infer pricing or deployment from provider categories', () => {
    expect(resolveProviderSourceMetadata()).toEqual({})
    expect(resolveProviderSourceMetadata({ id: 'unknown' })).toEqual({})
  })

  it('keeps disabled source metadata untagged', () => {
    expect(resolveProviderSourceMetadata({
      id: 'openai-compatible',
    })).toEqual({})
  })

  it('resolves local provider ids from the catalogue table', () => {
    expect(resolveProviderSourceMetadata({ id: 'ollama' })).toMatchObject({
      pricing: 'free',
      deployment: 'local',
    })
    expect(resolveProviderSourceMetadata({ id: 'lm-studio' })).toMatchObject({
      pricing: 'free',
      deployment: 'local',
    })
  })

  it('resolves legacy cloud speech provider ids from the catalogue table', () => {
    for (const id of [
      'elevenlabs',
      'deepgram-tts',
      'microsoft-speech',
      'alibaba-cloud-model-studio',
      'volcengine',
      'minimax-speech',
    ]) {
      expect(resolveProviderSourceMetadata({ id })).toMatchObject({
        pricing: 'paid',
        deployment: 'cloud',
      })
    }
  })
})
