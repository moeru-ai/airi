import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { describe, expect, it } from 'vitest'

import { buildFunASRProvider, FUNASR_TRANSCRIPTION_MODELS } from './funasr'

function expectTranscriptionProvider(
  provider: unknown,
): asserts provider is TranscriptionProviderWithExtraOptions<string, { language?: string, prompt?: string }> {
  if (typeof provider !== 'object' || provider === null || !('transcription' in provider) || typeof provider.transcription !== 'function')
    throw new TypeError('Expected a transcription provider')
}

describe('buildFunASRProvider', () => {
  it('provides local defaults and the supported FunASR model catalog', async () => {
    const metadata = buildFunASRProvider()

    expect(metadata).toMatchObject({
      category: 'transcription',
      id: 'funasr-audio-transcription',
      requiresCredentials: false,
    })
    expect(metadata.defaultOptions?.()).toEqual({
      apiKey: 'not-needed',
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    })
    expect(FUNASR_TRANSCRIPTION_MODELS.map(model => model.id)).toEqual([
      'sensevoice',
      'fun-asr-nano',
      'paraformer',
    ])
    await expect(metadata.capabilities.listModels?.({})).resolves.toEqual(FUNASR_TRANSCRIPTION_MODELS)
  })

  it('accepts local HTTP endpoints without credentials and rejects invalid settings', async () => {
    const metadata = buildFunASRProvider()

    await expect(metadata.validators.validateProviderConfig({
      apiKey: '',
      baseUrl: 'http://127.0.0.1:8000/v1/',
      model: 'sensevoice',
    })).resolves.toMatchObject({ valid: true })
    await expect(metadata.validators.validateProviderConfig({
      apiKey: '',
      baseUrl: 'localhost:8000/v1/',
      model: '',
    })).resolves.toMatchObject({ valid: false })
  })

  it('normalizes the base URL and preserves transcription options', async () => {
    const metadata = buildFunASRProvider((apiKey, baseUrl) => ({
      transcription: (model: string) => ({ apiKey, baseURL: baseUrl, model }),
    }))
    const provider = await metadata.createProvider({
      apiKey: 'gateway-secret',
      baseUrl: 'http://localhost:8000/v1',
      model: 'sensevoice',
    })

    expectTranscriptionProvider(provider)
    expect(provider.transcription('sensevoice', { language: 'zh', prompt: 'AIRI' })).toEqual({
      apiKey: 'gateway-secret',
      baseURL: 'http://localhost:8000/v1/',
      language: 'zh',
      model: 'sensevoice',
      prompt: 'AIRI',
    })
  })
})
