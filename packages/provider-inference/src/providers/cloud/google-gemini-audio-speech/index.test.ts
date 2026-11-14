import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerGoogleGeminiAudioSpeech } from './index'

describe('providerGoogleGeminiAudioSpeech', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends Gemini TTS requests using gemini-3.8-flash-tts and omits temperature', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ inlineData: { data: 'AAABAA==', mimeType: 'audio/pcm;rate=24000' } }],
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = await providerGoogleGeminiAudioSpeech.createProvider({
      apiKey: 'test-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    }) as SpeechProviderWithExtraOptions<string, { model?: string }>
    const options = provider.speech('gemini-3.8-flash-tts')
    const response = await options.fetch!(new URL('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent'), {
      method: 'POST',
      body: JSON.stringify({
        input: 'Hello there',
        model: options.model,
        temperature: 0.4,
        voice: 'Kore',
      }),
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent')
    expect(response.headers.get('Content-Type')).toBe('audio/wav')

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>
      generationConfig: {
        responseModalities: string[]
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } }
        temperature?: number
      }
    }

    expect(requestBody.contents[0]?.parts[0]?.text).toBe('Hello there')
    expect(requestBody.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(requestBody.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore')
    // Gemini 3.8 models reject temperature, so it must not be present in generationConfig
    expect(requestBody.generationConfig.temperature).toBeUndefined()
  })

  it('does not double-wrap with PCM encoder when response already has WAV RIFF header', async () => {
    // 'RIFF' in base64: 'UklGRg==' (0x52, 0x49, 0x46, 0x46)
    const riffBase64 = 'UklGRgAAAA=='
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ inlineData: { data: riffBase64, mimeType: 'audio/wav' } }],
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = await providerGoogleGeminiAudioSpeech.createProvider({
      apiKey: 'test-key',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    }) as SpeechProviderWithExtraOptions<string, { model?: string }>
    const options = provider.speech('gemini-3.8-flash-tts')
    const response = await options.fetch!(new URL('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent'), {
      method: 'POST',
      body: JSON.stringify({
        input: 'Test RIFF WAV',
        model: options.model,
      }),
    })

    expect(response.headers.get('Content-Type')).toBe('audio/wav')
    const buffer = await response.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    // Starts with RIFF
    expect(bytes[0]).toBe(0x52)
    expect(bytes[1]).toBe(0x49)
    expect(bytes[2]).toBe(0x46)
    expect(bytes[3]).toBe(0x46)
  })

  it('lists the updated Gemini 3.8 TTS models', async () => {
    const listModels = providerGoogleGeminiAudioSpeech.extraMethods?.listModels
    expect(listModels).toBeDefined()
    const config = { apiKey: 'test', baseUrl: 'https://test' }
    const provider = await providerGoogleGeminiAudioSpeech.createProvider(config)
    const models = await listModels!(config, provider)
    expect(models.map(m => m.id)).toEqual([
      'gemini-3.8-flash-tts',
      'gemini-3.8-flash-lite-tts',
    ])
  })
})
