import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerGoogleGeminiAudioSpeech } from './index'

describe('providerGoogleGeminiAudioSpeech', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends Gemini TTS requests through the SDK without duplicating the API version path', async () => {
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
    const options = provider.speech('gemini-2.5-flash-preview-tts')
    const response = await options.fetch!(new URL('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent'), {
      method: 'POST',
      body: JSON.stringify({
        input: 'Hello there',
        model: options.model,
        temperature: 0.4,
        voice: 'Kore',
      }),
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent')
    expect(response.headers.get('Content-Type')).toBe('audio/wav')

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>
      generationConfig: {
        responseModalities: string[]
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } }
        temperature: number
      }
    }

    expect(requestBody.contents[0]?.parts[0]?.text).toBe('Hello there')
    expect(requestBody.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(requestBody.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore')
    expect(requestBody.generationConfig.temperature).toBe(0.4)
  })
})
