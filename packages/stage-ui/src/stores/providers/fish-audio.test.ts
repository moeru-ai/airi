import type { ModelInfo } from '../providers'

import { describe, expect, it, vi } from 'vitest'

import { buildFishAudioProvider, createUnFishAudio } from './fish-audio'

function createBaseUrlValidator() {
  return (baseUrl: unknown) => {
    if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.length === 0) {
      return { errors: [new Error('Base URL is required.')], reason: 'Base URL is required.', valid: false }
    }
    // Simulate the real isUrl check: a bare word without scheme is invalid
    if (typeof baseUrl === 'string' && !baseUrl.startsWith('http')) {
      return { errors: [new Error('Base URL is not absolute.')], reason: 'Base URL is not absolute.', valid: false }
    }
    return null
  }
}

const baseUrlValidator = createBaseUrlValidator()

function buildProvider() {
  return buildFishAudioProvider(baseUrlValidator)
}

describe('fishAudio provider metadata', () => {
  const metadata = buildProvider()

  it('has the correct provider ID', () => {
    expect(metadata.id).toBe('fish-audio')
  })

  it('is in the speech category', () => {
    expect(metadata.category).toBe('speech')
  })

  it('has text-to-speech task', () => {
    expect(metadata.tasks).toContain('text-to-speech')
  })

  it('has a name and description', () => {
    expect(metadata.name).toBe('Fish Audio')
    expect(metadata.description).toBe('fish.audio')
  })

  it('has the correct i18n keys', () => {
    expect(metadata.nameKey).toBe('settings.pages.providers.provider.fish-audio.title')
    expect(metadata.descriptionKey).toBe('settings.pages.providers.provider.fish-audio.description')
  })

  it('defaults baseUrl to the hosted unSpeech proxy', () => {
    const defaults = metadata.defaultOptions?.()
    expect(defaults?.baseUrl).toBe('https://unspeech.hyp3r.link/v1/')
  })
})

describe('fishAudio listModels', () => {
  const metadata = buildProvider()

  it('returns the four Fish Audio TTS models', async () => {
    const models = await metadata.capabilities.listModels?.({})
    expect(models).toHaveLength(4)
    expect(models?.map((m: ModelInfo) => m.id)).toEqual(['s1', 's2-pro', 's2.1-pro', 's2.1-pro-free'])
  })

  it('each model has the correct provider ID', async () => {
    const models = await metadata.capabilities.listModels?.({})
    for (const model of models ?? []) {
      expect(model.provider).toBe('fish-audio')
    }
  })
})

describe('fishAudio validation', () => {
  const metadata = buildProvider()

  it('fails validation without API key', async () => {
    const result = await metadata.validators.validateProviderConfig({ baseUrl: 'https://unspeech.hyp3r.link/v1/' })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e: any) => e.message?.includes('API key'))).toBe(true)
  })

  it('fails validation with whitespace-only API key', async () => {
    const result = await metadata.validators.validateProviderConfig({ apiKey: '   ', baseUrl: 'https://unspeech.hyp3r.link/v1/' })
    expect(result.valid).toBe(false)
  })

  it('fails validation without base URL', async () => {
    const result = await metadata.validators.validateProviderConfig({ apiKey: 'test-key' })
    expect(result.valid).toBe(false)
  })

  it('fails validation with a non-absolute base URL', async () => {
    const result = await metadata.validators.validateProviderConfig({ apiKey: 'test-key', baseUrl: 'invalid' })
    expect(result.valid).toBe(false)
  })

  it('passes validation with API key and base URL', async () => {
    const result = await metadata.validators.validateProviderConfig({ apiKey: 'test-key', baseUrl: 'https://unspeech.hyp3r.link/v1/' })
    expect(result.valid).toBe(true)
  })
})

describe('fishAudio speech request construction', () => {
  it('prefixes the model with the fishaudio backend for unSpeech routing', () => {
    const provider = createUnFishAudio('test-key', 'https://unspeech.example.com/v1/')
    const speechResult = provider.speech('s1')

    expect(speechResult.model).toBe('fishaudio/s1')
    expect(speechResult.apiKey).toBe('test-key')
    expect(speechResult.baseURL).toBe('https://unspeech.example.com/v1/')
  })

  it('falls back to s1 when no model is given', () => {
    const provider = createUnFishAudio('test-key')
    const speechResult = provider.speech('')
    expect(speechResult.model).toBe('fishaudio/s1')
  })

  it('maps known options into snake_case extra_body', () => {
    const provider = createUnFishAudio('test-key')
    const speechResult = provider.speech('s1', {
      chunkLength: 150,
      latency: 'balanced',
      normalize: false,
      prosody: { speed: 1.2, volume: 0 },
      temperature: 0.8,
      topP: 0.9,
    })

    expect(speechResult.extraBody).toEqual({
      chunk_length: 150,
      latency: 'balanced',
      normalize: false,
      prosody: { speed: 1.2, volume: 0 },
      temperature: 0.8,
      top_p: 0.9,
    })
  })

  it('does not leak unrelated config keys into extra_body', () => {
    const provider = createUnFishAudio('test-key')
    const speechResult = provider.speech('s1', {
      apiKey: 'leak',
      baseUrl: 'leak',
      voice: 'leak',
      temperature: 0.5,
    } as any)

    expect(speechResult.extraBody).toEqual({ temperature: 0.5 })
  })
})

describe('fishAudio voice listing', () => {
  it('queries unSpeech /voices with provider=fishaudio and maps the response', async () => {
    const mockResponse = new Response(JSON.stringify({
      voices: [
        {
          id: '802e3bc2b27e49c2995d23ef70e6ac89',
          name: 'Example Voice',
          description: 'A community voice model',
          labels: {},
          tags: [],
          languages: [{ code: 'en', title: 'English' }],
          formats: [],
          compatible_models: ['s1'],
          preview_audio_url: 'https://example.com/sample.mp3',
        },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    try {
      const metadata = buildProvider()
      const voices = await metadata.capabilities.listVoices?.({
        apiKey: 'test-key',
        baseUrl: 'https://unspeech.example.com/v1/',
      })

      const requestedUrl = String(fetchSpy.mock.calls[0][0])
      expect(requestedUrl).toBe('https://unspeech.example.com/api/voices?provider=fishaudio')

      expect(voices).toHaveLength(1)
      expect(voices?.[0].id).toBe('802e3bc2b27e49c2995d23ef70e6ac89')
      expect(voices?.[0].name).toBe('Example Voice')
      expect(voices?.[0].provider).toBe('fish-audio')
      expect(voices?.[0].previewURL).toBe('https://example.com/sample.mp3')
      expect(voices?.[0].languages).toEqual([{ code: 'en', title: 'English' }])
      expect(voices?.[0].compatibleModels).toEqual(['s1'])
    }
    finally {
      fetchSpy.mockRestore()
    }
  })
})
