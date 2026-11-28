import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { isGenerationProvider } from '@proj-airi/provider-inference'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { OFFICIAL_TRANSCRIPTION_PROVIDER_ID, providerOfficialChat, providerOfficialSpeech, providerOfficialSpeechStreaming, providerOfficialTranscription } from './index'

interface OfficialSpeechOptions {
  speed?: number
  extraBody?: {
    airi_analytics?: {
      source: string
      voice_type: string
    }
    voice_pack?: {
      pitch?: number
    }
  }
}

describe('official chat provider', () => {
  it('defaults a new configuration to Responses with native Web Search', async () => {
    const schema = await providerOfficialChat.createProviderConfig({ t: key => key })
    expect(z.parse(schema, {})).toEqual({ api: 'responses' })

    const provider = await providerOfficialChat.createProvider({})
    if (!isGenerationProvider(provider))
      throw new Error('Expected generation')

    expect(provider.generation('auto')).toMatchObject({
      protocol: 'responses',
      webSearch: true,
      config: { model: 'auto' },
    })
  })

  // A device that used the provider before keeps the protocol in its saved configuration, so the new default does not change it.
  it('keeps Chat Completions for a configuration that saved it', async () => {
    const provider = await providerOfficialChat.createProvider({ api: 'chat-completions' })
    if (!isGenerationProvider(provider))
      throw new Error('Expected generation')

    expect(provider.generation('auto')).toMatchObject({
      protocol: 'chat-completions',
      config: { model: 'auto' },
    })
  })

  it('describes the protocol selector in its configuration schema', async () => {
    const schema = await providerOfficialChat.createProviderConfig({ t: key => key })
    if (!(schema instanceof z.ZodObject))
      throw new Error('Expected an object configuration schema')

    expect(schema.shape.api.meta()).toMatchObject({
      type: 'select',
      options: [
        { label: 'Responses API', value: 'responses' },
        { label: 'Chat Completions', value: 'chat-completions' },
      ],
    })
  })
})

describe('official speech provider', () => {
  /**
   * @example
   * provider.speech('microsoft/v1', { speed: 1.2 })
   */
  it('keeps speech extra options on the generated request config', async () => {
    const provider = await providerOfficialSpeech.createProvider({}) as SpeechProviderWithExtraOptions<string, OfficialSpeechOptions>

    const request = provider.speech('microsoft/v1', {
      speed: 1.2,
      extraBody: {
        voice_pack: {
          pitch: 20,
        },
      },
    })

    expect(request.model).toBe('microsoft/v1')
    expect(request.speed).toBe(1.2)
    expect(request.extraBody).toEqual({
      voice_pack: {
        pitch: 20,
      },
    })
    expect(request.fetch).toBeTypeOf('function')
  })

  /**
   * @example
   * provider.speech('volcengine/seed-tts-2.0', { extraBody: { airi_analytics: { source: 'manual_preview', voice_type: 'official_selected' } } })
   */
  it('keeps streaming speech preview analytics on the generated request config', async () => {
    const provider = await providerOfficialSpeechStreaming.createProvider({}) as SpeechProviderWithExtraOptions<string, OfficialSpeechOptions>

    const request = provider.speech('volcengine/seed-tts-2.0', {
      extraBody: {
        airi_analytics: {
          source: 'manual_preview',
          voice_type: 'official_selected',
        },
      },
    })

    expect(request.model).toBe('volcengine/seed-tts-2.0')
    expect(request.extraBody).toEqual({
      airi_analytics: {
        source: 'manual_preview',
        voice_type: 'official_selected',
      },
    })
    expect(request.fetch).toBeTypeOf('function')
  })
})

describe('official transcription provider', () => {
  /**
   * @example
   * provider.transcription('auto')
   */
  it('builds an authenticated streaming transcription request for the server audio surface', async () => {
    const provider = await providerOfficialTranscription.createProvider({}) as {
      transcription: (model: string) => {
        baseURL: URL
        fetch?: typeof fetch
        model: string
      }
    }

    const request = provider.transcription('auto')

    expect(OFFICIAL_TRANSCRIPTION_PROVIDER_ID).toBe('official-provider-transcription')
    expect(request.model).toBe('auto')
    expect(request.baseURL.pathname).toBe('/api/v1/audio/transcriptions/stream')
    expect(request.fetch).toBeTypeOf('function')
  })

  /**
   * @example
   * providerOfficialTranscription.extraMethods.listModels()
   */
  it('lists the auto realtime model without calling a provider credential flow', async () => {
    const provider = await providerOfficialTranscription.createProvider({})
    const models = await providerOfficialTranscription.extraMethods?.listModels?.({}, provider)

    expect(models).toEqual([
      {
        id: 'auto',
        name: 'Auto',
        provider: OFFICIAL_TRANSCRIPTION_PROVIDER_ID,
        description: 'Realtime transcription routed by AIRI',
      },
    ])
  })
})

describe('official speech catalog', () => {
  // The provider reads the auth token from the auth store.
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /**
   * @example
   * GET /api/v1/audio/models -> { models: [{ id: 'fish', costMultiplier: 5 }] }
   */
  it('keeps the price multiplier as data, so the interface localizes the label', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url.includes('/audio/models')
      ? { models: [{ id: 'fish', name: 'Fish', description: 'Faster first audio', costMultiplier: 5 }], default: null }
      : { voices: [{ id: 'fast-girl', name: 'Fast girl', cost_multiplier: 5, languages: [] }], recommended: {} })))
    const provider = await providerOfficialSpeech.createProvider({})

    const catalog = await providerOfficialSpeech.extraMethods?.listModelCatalog?.({}, provider)
    const voices = await providerOfficialSpeech.extraMethods?.listVoices?.({}, provider, 'voice-pack')

    expect(catalog?.models).toEqual([expect.objectContaining({ id: 'fish', description: 'Faster first audio', costMultiplier: 5 })])
    expect(voices).toEqual([expect.objectContaining({ id: 'fast-girl', costMultiplier: 5 })])
    expect(voices?.[0]?.description).toBeUndefined()
  })
})
