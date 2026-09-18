import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { isGenerationProvider } from '@proj-airi/provider-inference'
import { describe, expect, it } from 'vitest'
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
  it('defaults new and existing empty configurations to Chat Completions', async () => {
    const schema = await providerOfficialChat.createProviderConfig({ t: key => key })
    expect(z.parse(schema, {})).toEqual({ api: 'chat-completions' })

    const provider = await providerOfficialChat.createProvider({})
    if (!isGenerationProvider(provider))
      throw new Error('Expected generation')

    expect(provider.generation('auto')).toMatchObject({
      protocol: 'chat-completions',
      config: { model: 'auto' },
    })
  })

  it('uses Responses when the user selects it', async () => {
    const provider = await providerOfficialChat.createProvider({ api: 'responses' })
    if (!isGenerationProvider(provider))
      throw new Error('Expected generation')

    expect(provider.generation('auto')).toMatchObject({
      protocol: 'responses',
      webSearch: false,
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
        { label: 'Chat Completions', value: 'chat-completions' },
        { label: 'Responses API', value: 'responses' },
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
