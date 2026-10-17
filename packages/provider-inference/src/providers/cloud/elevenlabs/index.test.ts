import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { ElevenLabsSpeechOptions } from './index'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { providerElevenLabs } from './index'

const listVoices = providerElevenLabs.extraMethods!.listVoices!

const config = {
  apiKey: ' sk-test ',
  baseUrl: 'https://api.elevenlabs.io/v1/',
  voiceSettings: { similarityBoost: 0.6, stability: 0.4 },
}

function voicesResponse(voices: unknown[]) {
  return new Response(JSON.stringify({ voices }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Drives the adapter the way xsai's `generateSpeech` does: it reads the
 * returned options and calls their `fetch` with the OpenAI speech body.
 */
async function synthesize(options?: ElevenLabsSpeechOptions, signal?: AbortSignal) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([0x49, 0x44, 0x33]), {
    status: 200,
    headers: { 'Content-Type': 'audio/mpeg' },
  }))
  vi.stubGlobal('fetch', fetchMock)

  const provider = await providerElevenLabs.createProvider(config) as SpeechProviderWithExtraOptions<string, ElevenLabsSpeechOptions>
  const speechOptions = provider.speech('eleven_multilingual_v2', options)

  const response = await speechOptions.fetch!(new URL('https://api.elevenlabs.io/v1/audio/speech'), {
    method: 'POST',
    body: JSON.stringify({ input: 'Hello from AIRI.', voice: 'voice id/1', model: speechOptions.model }),
    signal,
  })

  const [url, init] = fetchMock.mock.calls[0]!

  return {
    speechOptions,
    url,
    init: init!,
    sent: JSON.parse(String(init!.body)) as Record<string, any>,
    audioBytes: (await response.arrayBuffer()).byteLength,
  }
}

describe('providerElevenLabs speech', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to the native ElevenLabs API instead of the unspeech proxy', async () => {
    const schema = await providerElevenLabs.createProviderConfig({ t: (key: string) => key })

    expect(z.parse(schema, { apiKey: 'sk-test' }).baseUrl).toBe('https://api.elevenlabs.io/v1/')
  })

  it('rewrites the OpenAI speech request to the native text-to-speech endpoint', async () => {
    const { speechOptions, url, init, sent, audioBytes } = await synthesize()

    expect(speechOptions.model).toBe('eleven_multilingual_v2')
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice%20id%2F1')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'xi-api-key': 'sk-test', 'accept': 'audio/mpeg' })
    expect(sent).toEqual({
      text: 'Hello from AIRI.',
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.4, similarity_boost: 0.6 },
    })
    expect(audioBytes).toBe(3)
  })

  it('prefers per-request voice settings over the provider config', async () => {
    const { sent } = await synthesize({
      voiceSettings: { similarityBoost: 0.9, stability: 0.1, style: 0.3, useSpeakerBoost: true },
    })

    expect(sent.voice_settings).toEqual({
      stability: 0.1,
      similarity_boost: 0.9,
      style: 0.3,
      use_speaker_boost: true,
    })
  })

  it('passes the abort signal to the native request', async () => {
    const controller = new AbortController()
    const { init } = await synthesize(undefined, controller.signal)

    expect(init.signal).toBe(controller.signal)
  })
})

describe('providerElevenLabs voice catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the account voices from the native voices endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => voicesResponse([
      {
        voice_id: 'CwhRBWXzGAHq8TQ4Fs17',
        name: 'Roger - Laid-Back, Casual, Resonant',
        preview_url: 'https://example.com/roger.mp3',
        labels: { gender: 'male' },
        verified_languages: [{ language: 'en', locale: 'en-US' }, { language: 'en', locale: 'en-US' }, { language: 'fr' }],
      },
      { voice_id: 'cloned', name: 'My Clone', fine_tuning: { language: 'ja' } },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const provider = await providerElevenLabs.createProvider(config)
    const voices = await listVoices(config, provider)

    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.elevenlabs.io/v1/voices')
    expect(fetchMock.mock.calls[0]![1]?.headers).toEqual({ 'xi-api-key': 'sk-test' })
    expect(voices[0]).toMatchObject({
      id: 'CwhRBWXzGAHq8TQ4Fs17',
      provider: 'elevenlabs',
      gender: 'male',
      previewURL: 'https://example.com/roger.mp3',
    })
    expect(voices[0]!.languages.map(language => language.code)).toEqual(['en-US', 'fr'])
    expect(voices[1]!.languages.map(language => language.code)).toEqual(['ja'])
  })

  it('keeps the list unchanged when Aria and Bill are absent', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => voicesResponse([
      { voice_id: 'a', name: 'A' },
      { voice_id: 'b', name: 'B' },
      { voice_id: 'c', name: 'C' },
    ])))

    const provider = await providerElevenLabs.createProvider(config)
    const voices = await listVoices(config, provider)

    expect(voices.map(voice => voice.id)).toEqual(['a', 'b', 'c'])
  })

  it('surfaces the ElevenLabs refusal instead of an empty catalog', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response('{"detail":{"status":"detected_unusual_activity"}}', {
      status: 401,
      statusText: 'Unauthorized',
    })))

    const provider = await providerElevenLabs.createProvider(config)

    await expect(listVoices(config, provider)).rejects.toThrow(/401.*detected_unusual_activity/)
  })
})
