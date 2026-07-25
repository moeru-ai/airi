import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { ModelInfo, VoiceInfo } from '../providers'

import { describe, expect, it, vi } from 'vitest'

import { buildGoogleGeminiSpeechProvider } from './google-gemini-speech'

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
  return buildGoogleGeminiSpeechProvider(baseUrlValidator)
}

async function getSpeechProvider(config: Record<string, unknown>): Promise<SpeechProviderWithExtraOptions<string, Record<string, unknown>>> {
  const metadata = buildProvider()
  return (await metadata.createProvider(config)) as SpeechProviderWithExtraOptions<string, Record<string, unknown>>
}

describe('googleGeminiSpeech provider metadata', () => {
  const metadata = buildProvider()

  it('has the correct provider ID', () => {
    expect(metadata.id).toBe('google-gemini-audio-speech')
  })

  it('is in the speech category', () => {
    expect(metadata.category).toBe('speech')
  })

  it('has text-to-speech task', () => {
    expect(metadata.tasks).toContain('text-to-speech')
  })

  it('has a name and description', () => {
    expect(metadata.name).toBe('Google Gemini')
    expect(metadata.description).toBe('aistudio.google.com')
  })

  it('has the correct i18n keys', () => {
    expect(metadata.nameKey).toBe('settings.pages.providers.provider.google-gemini-audio-speech.title')
    expect(metadata.descriptionKey).toBe('settings.pages.providers.provider.google-gemini-audio-speech.description')
  })

  it('has default options with baseUrl', () => {
    const defaults = metadata.defaultOptions?.()
    expect(defaults?.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/')
  })
})

describe('googleGeminiSpeech listModels', () => {
  const metadata = buildProvider()

  it('returns three Gemini TTS models', async () => {
    const models = await metadata.capabilities.listModels?.({})
    expect(models).toHaveLength(3)
  })

  it('includes gemini-2.5-flash-preview-tts', async () => {
    const models = await metadata.capabilities.listModels?.({})
    expect(models?.map((m: ModelInfo) => m.id)).toContain('gemini-2.5-flash-preview-tts')
  })

  it('includes gemini-2.5-pro-preview-tts', async () => {
    const models = await metadata.capabilities.listModels?.({})
    expect(models?.map((m: ModelInfo) => m.id)).toContain('gemini-2.5-pro-preview-tts')
  })

  it('includes gemini-3.1-flash-tts-preview', async () => {
    const models = await metadata.capabilities.listModels?.({})
    expect(models?.map((m: ModelInfo) => m.id)).toContain('gemini-3.1-flash-tts-preview')
  })

  it('each model has the correct provider ID', async () => {
    const models = await metadata.capabilities.listModels?.({})
    for (const model of models ?? []) {
      expect(model.provider).toBe('google-gemini-audio-speech')
    }
  })
})

describe('googleGeminiSpeech listVoices', () => {
  const metadata = buildProvider()

  it('returns 30 voices', async () => {
    const voices = await metadata.capabilities.listVoices?.({})
    expect(voices).toHaveLength(30)
  })

  it('includes Kore voice', async () => {
    const voices = await metadata.capabilities.listVoices?.({})
    expect(voices?.map((v: VoiceInfo) => v.id)).toContain('Kore')
  })

  it('each voice has compatibleModels with all three models', async () => {
    const voices = await metadata.capabilities.listVoices?.({})
    for (const voice of voices ?? []) {
      expect(voice.compatibleModels).toEqual([
        'gemini-2.5-flash-preview-tts',
        'gemini-2.5-pro-preview-tts',
        'gemini-3.1-flash-tts-preview',
      ])
    }
  })

  it('each voice has the correct provider ID', async () => {
    const voices = await metadata.capabilities.listVoices?.({})
    for (const voice of voices ?? []) {
      expect(voice.provider).toBe('google-gemini-audio-speech')
    }
  })

  it('each voice has a description', async () => {
    const voices = await metadata.capabilities.listVoices?.({})
    for (const voice of voices ?? []) {
      expect(voice.description).toBeTruthy()
    }
  })
})

describe('googleGeminiSpeech validation', () => {
  const metadata = buildProvider()

  it('fails validation without API key', async () => {
    const result = await metadata.validators.validateProviderConfig({})
    expect(result.valid).toBe(false)
    expect(result.errors.some((e: any) => e.message?.includes('API Key'))).toBe(true)
  })

  it('fails validation with empty API key string', async () => {
    const result = await metadata.validators.validateProviderConfig({ apiKey: '' })
    expect(result.valid).toBe(false)
  })

  it('fails validation with whitespace-only API key', async () => {
    const result = await metadata.validators.validateProviderConfig({ apiKey: '   ' })
    expect(result.valid).toBe(false)
  })

  it('passes validation with a valid API key', async () => {
    const result = await metadata.validators.validateProviderConfig({ apiKey: 'test-api-key' })
    expect(result.valid).toBe(true)
  })

  it('uses baseUrl validator when baseUrl is provided', async () => {
    const result = await metadata.validators.validateProviderConfig({ apiKey: 'k', baseUrl: 'invalid' })
    expect(result.valid).toBe(false)
  })
})

describe('googleGeminiSpeech request construction', () => {
  it('creates a speech provider with correct shape', async () => {
    const provider = await getSpeechProvider({ apiKey: 'test-key', baseUrl: 'https://example.com/v1beta' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts')

    expect(speechResult.model).toBe('gemini-2.5-flash-preview-tts')
    expect(speechResult.baseURL).toBe('https://example.com/v1beta/')
    expect(typeof speechResult.fetch).toBe('function')
  })

  it('uses default model when none specified', async () => {
    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const speechResult = provider.speech('' as any)
    expect(speechResult.model).toBe('gemini-2.5-flash-preview-tts')
  })

  it('uses default base URL when none specified', async () => {
    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts')
    expect(speechResult.baseURL).toBe('https://generativelanguage.googleapis.com/v1beta/')
  })

  it('spreads extra options into speech() return value', async () => {
    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts', { temperature: 0.7 })
    expect(speechResult.temperature).toBe(0.7)
  })

  it('explicit model argument takes precedence over options.model', async () => {
    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts', { model: 'gemini-2.5-pro-preview-tts' })
    expect(speechResult.model).toBe('gemini-2.5-flash-preview-tts')
  })

  it('fetch adapter throws when body is missing', async () => {
    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts')
    const fetchFn = speechResult.fetch!

    await expect(fetchFn(new URL('http://test'), {})).rejects.toThrow('Invalid request body')
  })

  it('fetch adapter throws when input text is missing', async () => {
    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts')
    const fetchFn = speechResult.fetch!

    await expect(fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'test-model' }),
    })).rejects.toThrow('Missing input text')
  })

  it('fetch adapter constructs correct Gemini URL', async () => {
    const mockResponse = new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA' } }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    const provider = await getSpeechProvider({ apiKey: 'test-key', baseUrl: 'https://example.com/v1beta' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts')
    const fetchFn = speechResult.fetch!

    await fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'gemini-2.5-flash-preview-tts', input: 'Hello', voice: 'Kore' }),
    })

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://example.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-goog-api-key': 'test-key',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('fetch adapter sends correct Gemini request body', async () => {
    const mockResponse = new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA' } }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    const provider = await getSpeechProvider({ apiKey: 'test-key', baseUrl: 'https://example.com/v1beta' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts')
    const fetchFn = speechResult.fetch!

    await fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'gemini-2.5-flash-preview-tts', input: 'Hello from AIRI', voice: 'Kore' }),
    })

    const callArg = (globalThis.fetch as any).mock.calls[0][1]
    const requestBody = JSON.parse(callArg.body)

    expect(requestBody.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(requestBody.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore')
    expect(requestBody.contents[0].parts[0].text).toBe('Hello from AIRI')
  })

  it('includes temperature in generationConfig when provided', async () => {
    const mockResponse = new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA' } }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts')
    const fetchFn = speechResult.fetch!

    await fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'gemini-2.5-flash-preview-tts', input: 'Test', voice: 'Kore', temperature: 0.7 }),
    })

    const callArg = (globalThis.fetch as any).mock.calls[0][1]
    const requestBody = JSON.parse(callArg.body)

    expect(requestBody.generationConfig.temperature).toBe(0.7)
  })

  it('omits temperature from generationConfig when not provided', async () => {
    const mockResponse = new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { data: 'AAAA' } }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts')
    const fetchFn = speechResult.fetch!

    await fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'gemini-2.5-flash-preview-tts', input: 'Test', voice: 'Kore' }),
    })

    const callArg = (globalThis.fetch as any).mock.calls[0][1]
    const requestBody = JSON.parse(callArg.body)

    expect(requestBody.generationConfig.temperature).toBeUndefined()
  })
})

describe('googleGeminiSpeech audio conversion', () => {
  it('returns WAV audio from Gemini response', async () => {
    const pcmBase64 = btoa('\x00\x00\x00\x00')
    const mockResponse = new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { data: pcmBase64 } }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts')
    const fetchFn = speechResult.fetch!

    const response = await fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'gemini-2.5-flash-preview-tts', input: 'Test', voice: 'Kore' }),
    })

    expect(response.headers.get('Content-Type')).toBe('audio/wav')

    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // RIFF header
    expect(String.fromCharCode(bytes[0])).toBe('R')
    expect(String.fromCharCode(bytes[1])).toBe('I')
    expect(String.fromCharCode(bytes[2])).toBe('F')
    expect(String.fromCharCode(bytes[3])).toBe('F')

    // WAVE format
    expect(String.fromCharCode(bytes[8])).toBe('W')
    expect(String.fromCharCode(bytes[9])).toBe('A')
    expect(String.fromCharCode(bytes[10])).toBe('V')
    expect(String.fromCharCode(bytes[11])).toBe('E')
  })

  it('throws when Gemini response has no audio data', async () => {
    const mockResponse = new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'no audio here' }] } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts')
    const fetchFn = speechResult.fetch!

    await expect(fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'gemini-2.5-flash-preview-tts', input: 'Test', voice: 'Kore' }),
    })).rejects.toThrow('Gemini TTS response missing audio data')
  })

  it('throws when Gemini API returns non-OK status', async () => {
    const mockResponse = new Response('Unauthorized', { status: 401 })
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse)

    const provider = await getSpeechProvider({ apiKey: 'bad-key' })
    const speechResult = provider.speech('gemini-2.5-flash-preview-tts')
    const fetchFn = speechResult.fetch!

    await expect(fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'gemini-2.5-flash-preview-tts', input: 'Test', voice: 'Kore' }),
    })).rejects.toThrow('Gemini TTS request failed: 401')
  })
})
