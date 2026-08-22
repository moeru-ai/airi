import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { FUNASR_TRANSCRIPTION_MODELS, providerFunASRAudioTranscription } from './index'

const t = (key: string) => key

function expectTranscriptionProvider(
  provider: unknown,
): asserts provider is TranscriptionProviderWithExtraOptions<string, { language?: string, prompt?: string }> {
  if (typeof provider !== 'object' || provider === null || !('transcription' in provider) || typeof provider.transcription !== 'function')
    throw new TypeError('Expected a transcription provider')
}

describe('providerFunASRAudioTranscription', () => {
  it('registers credential-optional local defaults and the fixed model catalog', async () => {
    const schema = providerFunASRAudioTranscription.createProviderConfig({ t })
    const config = z.parse(schema, {})
    const provider = providerFunASRAudioTranscription.createProvider(config)

    expect(providerFunASRAudioTranscription).toMatchObject({
      id: 'funasr-audio-transcription',
      requiresCredentials: false,
      tasks: expect.arrayContaining(['speech-to-text', 'asr', 'stt']),
    })
    expect(config).toMatchObject({
      apiKey: 'not-needed',
      baseUrl: 'http://localhost:8000/v1/',
      model: 'sensevoice',
    })
    expect(FUNASR_TRANSCRIPTION_MODELS.map(model => model.id)).toEqual([
      'sensevoice',
      'fun-asr-nano',
      'paraformer',
    ])
    await expect(providerFunASRAudioTranscription.extraMethods?.listModels?.(config, provider)).resolves.toEqual(FUNASR_TRANSCRIPTION_MODELS)
  })

  it('accepts local HTTP endpoints without credentials and rejects invalid settings', async () => {
    const createValidator = providerFunASRAudioTranscription.validators?.validateConfig?.[0]
    const validator = createValidator?.({ t })
    expect(validator).toBeDefined()

    await expect(validator?.validator({
      apiKey: '',
      baseUrl: 'http://127.0.0.1:8000/v1/',
      model: 'sensevoice',
    }, { t })).resolves.toMatchObject({ valid: true })
    await expect(validator?.validator({
      apiKey: '',
      baseUrl: 'localhost:8000/v1/',
      model: '',
    }, { t })).resolves.toMatchObject({ valid: false })
  })

  it('runs configuration validation for explicitly cleared settings', () => {
    expect(providerFunASRAudioTranscription.validationRequiredWhen?.({
      apiKey: '',
      baseUrl: '',
      model: 'sensevoice',
    })).toBe(true)
  })

  it('normalizes the base URL and preserves transcription options', () => {
    const provider = providerFunASRAudioTranscription.createProvider({
      apiKey: 'gateway-secret',
      baseUrl: 'http://localhost:8000/v1',
      model: 'sensevoice',
    })

    expectTranscriptionProvider(provider)
    expect(provider.transcription('sensevoice', { language: 'zh', prompt: 'AIRI' })).toMatchObject({
      apiKey: 'gateway-secret',
      baseURL: 'http://localhost:8000/v1/',
      language: 'zh',
      model: 'sensevoice',
      prompt: 'AIRI',
    })
  })

  // https://github.com/moeru-ai/airi/pull/2122#discussion_r3756986599
  it('rejects an explicitly cleared base URL (GitHub #2122)', () => {
    expect(() => providerFunASRAudioTranscription.createProvider({
      apiKey: 'not-needed',
      baseUrl: '',
      model: 'sensevoice',
    })).toThrow('FunASR Base URL is required')
  })
})
