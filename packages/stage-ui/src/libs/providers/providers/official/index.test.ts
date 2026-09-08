import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { AIRI_CHAT_SESSION_ID_HEADER } from '../../../product-signals/headers'
import { OFFICIAL_TRANSCRIPTION_PROVIDER_ID, providerOfficialSpeech, providerOfficialSpeechStreaming, providerOfficialTranscription } from './index'

vi.mock('../../../../libs/auth', () => ({
  getAuthToken: () => null,
}))

interface OfficialSpeechOptions {
  speed?: number
  extraBody?: {
    airi_analytics?: {
      conversation_id?: string
      source: string
      voice_type: string
    }
    voice_pack?: {
      pitch?: number
    }
  }
}

describe('official speech provider', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('uses the conversation snapshot carried by the speech request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const provider = await providerOfficialSpeech.createProvider({}) as SpeechProviderWithExtraOptions<string, OfficialSpeechOptions>
    const request = provider.speech('microsoft/v1', {
      extraBody: {
        airi_analytics: {
          conversation_id: 'conversation-at-intent-open',
          source: 'chat_auto_tts',
          voice_type: 'official_selected',
        },
      },
    })

    await request.fetch?.(new URL('https://example.test/audio/speech'), {})

    const requestInit = fetchMock.mock.calls[0]?.[1]
    expect(new Headers(requestInit?.headers).get(AIRI_CHAT_SESSION_ID_HEADER)).toBe('conversation-at-intent-open')
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
