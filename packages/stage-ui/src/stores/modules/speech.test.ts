import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, providerOfficialSpeech } from '../../libs/providers/providers/official'
import { useProvidersStore } from '../providers'
import { toSignedPercent, useSpeechStore, voicePackForSpeechProvider } from './speech'

const i18nState = vi.hoisted(() => ({
  locale: { value: 'en-US' },
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: i18nState.locale,
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('speech store helpers', () => {
  beforeEach(() => {
    i18nState.locale.value = 'en-US'
    setActivePinia(createPinia())
  })

  it('formats positive percentages with a plus sign', () => {
    expect(toSignedPercent(25)).toBe('+25%')
  })

  it('formats negative percentages without a double minus', () => {
    expect(toSignedPercent(-20)).toBe('-20%')
    expect(toSignedPercent(-20)).not.toContain('--')
  })

  it('formats zero as 0%', () => {
    expect(toSignedPercent(0)).toBe('0%')
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, providerConfig: { voice: 'plain' } })
   */
  it('leaves speech input unchanged when no Voice Pack is configured', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'plain-voice',
      name: 'Plain Voice',
      provider: 'openai-compatible-audio-speech',
      languages: [{ code: 'en-US', title: 'English' }],
    }

    const request = speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      providerConfig: { voice: 'plain-voice' },
    })

    expect(request.input).toBe('hello')
    expect(request.providerConfig).toEqual({ voice: 'plain-voice' })
  })

  /**
   * @example
   * voicePackForSpeechProvider('openai-compatible-audio-speech', voicePack)
   */
  it('ignores Voice Pack snapshots for non-official speech providers', () => {
    const voicePack = {
      packId: 'vp-1',
      name: 'Frozen',
      provider: 'volcengine',
      model: 'seed-tts-2.0',
      voiceId: 'voice-a',
      ttsModelId: 'volcengine/pool-a',
      params: {},
      costMultiplier: 1,
    }

    expect(voicePackForSpeechProvider('openai-compatible-audio-speech', voicePack)).toBeUndefined()
    expect(voicePackForSpeechProvider(OFFICIAL_SPEECH_PROVIDER_ID, voicePack)).toBe(voicePack)
    expect(voicePackForSpeechProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, voicePack)).toBeUndefined()
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, params: { rate: '+20%' } })
   */
  it('maps Voice Pack rate params to provider speed', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
    }

    const request = speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: { rate: '+20%' },
    })

    expect(request.input).toBe('hello')
    expect(request.providerConfig.speed).toBe(1.2)
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, params: { pitch: '+20%' }, supportsSSML: true })
   */
  it('applies Voice Pack prosody params through SSML when supported', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
      gender: 'neutral',
    }

    const request = speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: {
        pitch: '+20%',
        volume: '-5%',
      },
      supportsSSML: true,
    })

    expect(request.input).toContain('<prosody')
    expect(request.input).toContain('pitch="+20%"')
    expect(request.input).toContain('volume="-5%"')
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, forceSSML: true, supportsSSML: false, supportsAdapterProsody: true })
   */
  it('keeps official adapter-backed speech input as plain text when global SSML is enabled', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
      gender: 'neutral',
    }

    // ROOT CAUSE:
    //
    // Auto TTS can enable global SSML before the server routes the official
    // speech provider to DashScope CosyVoice. DashScope rejects `<speak>...`
    // payloads with `SSML text is not supported at the moment!`, so providers
    // that apply prosody through adapter options must keep the text field plain.
    const request = speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      providerConfig: { pitch: 0 },
      forceSSML: true,
      supportsSSML: false,
      supportsAdapterProsody: true,
    })

    expect(request.input).toBe('hello')
    expect(request.input).not.toContain('<speak')
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, params: { pitch: '+20%' }, supportsAdapterProsody: true })
   */
  it('passes Voice Pack prosody params through adapter options when supported', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
    }

    const request = speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: {
        pitch: '+20%',
        volume: '+5%',
      },
      supportsAdapterProsody: true,
    })

    expect(request.input).toBe('hello')
    expect(request.providerConfig.extraBody).toEqual({
      voice_pack: {
        pitch: 20,
        volume: 5,
      },
    })
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, voicePack: { packId: 'vp-1', costMultiplier: 1.5 } })
   */
  it('passes Voice Pack snapshot billing metadata through adapter options', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
    }

    const request = speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: {},
      voicePack: {
        packId: 'vp-1',
        costMultiplier: 1.5,
      },
      supportsAdapterProsody: true,
    })

    expect(request.providerConfig.extraBody).toEqual({
      voice_pack: {
        pack_id: 'vp-1',
        cost_multiplier: 1.5,
      },
    })
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, params: { pitch: '+20%' }, supportsSSML: false })
   */
  it('fails fast when Voice Pack prosody params cannot be applied', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
    }

    expect(() => speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: { pitch: '+20%' },
      supportsSSML: false,
    })).toThrow('SSML-capable speech provider')
  })

  /**
   * @example
   * speechStore.resolveVoicePackSpeechInput({ text, voice, params: { emotion: 'happy' } })
   */
  it('fails fast on unsupported Voice Pack params', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
    }

    expect(() => speechStore.resolveVoicePackSpeechInput({
      text: 'hello',
      voice,
      params: { emotion: 'happy' },
    })).toThrow('Unsupported Voice Pack parameter "emotion"')
  })

  /**
   * @example
   * await speechStore.loadVoicesForProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, 'volcengine/seed-tts-2.0')
   */
  it('does not load streaming voices before server availability is confirmed', async () => {
    const providersStore = useProvidersStore()
    const speechStore = useSpeechStore()
    const listVoices = vi.fn(async () => [])
    const metadata = providersStore.providerMetadata[OFFICIAL_SPEECH_STREAMING_PROVIDER_ID]
    metadata.capabilities.listVoices = listVoices
    providersStore.providerRuntimeState[OFFICIAL_SPEECH_STREAMING_PROVIDER_ID].isConfigured = false

    const voices = await speechStore.loadVoicesForProvider(
      OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
      'volcengine/seed-tts-2.0',
    )

    expect(voices).toEqual([])
    expect(listVoices).not.toHaveBeenCalled()
  })

  /**
   * @example
   * speechStore.ensureActiveSpeechModel()
   */
  it('resets stale streaming model to the server default when the regular official speech provider is active', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/api/v1/audio/models')) {
        return new Response(JSON.stringify({
          models: [
            { id: 'alibaba/cosyvoice-v2', name: 'alibaba/cosyvoice-v2' },
            { id: 'microsoft/v1', name: 'microsoft/v1' },
          ],
          default: 'microsoft/v1',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ voices: [], recommended: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch)

    const providersStore = useProvidersStore()
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speechStore.activeSpeechModel = 'volcengine/seed-tts-2.0'
    speechStore.activeSpeechVoiceId = 'zh_female_x'
    speechStore.activeSpeechVoice = {
      id: 'zh_female_x',
      name: 'X',
      provider: OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
      languages: [],
    }
    try {
      providersStore.providerRuntimeState[OFFICIAL_SPEECH_PROVIDER_ID].models = await providerOfficialSpeech.extraMethods!.listModels!(
        {},
        providerOfficialSpeech.createProvider({}),
      )

      speechStore.ensureActiveSpeechModel()

      expect(speechStore.activeSpeechModel).toBe('microsoft/v1')
      expect(speechStore.activeSpeechVoiceId).toBe('')
      expect(speechStore.activeSpeechVoice).toBeUndefined()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  /**
   * @example
   * await speechStore.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID, 'microsoft/v1')
   */
  it('uses the server recommended voice when the persisted official voice is stale', async () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/api/v1/audio/models')) {
        return new Response(JSON.stringify({
          models: [{ id: 'microsoft/v1', name: 'microsoft/v1' }],
          default: 'microsoft/v1',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        voices: [
          {
            id: 'en-US-JennyNeural',
            name: 'Jenny',
            languages: [{ code: 'en-US', title: 'English' }],
          },
          {
            id: 'en-US-AvaMultilingualNeural',
            name: 'Ava',
            languages: [{ code: 'en-US', title: 'English' }],
          },
        ],
        recommended: { 'en-US': 'en-US-AvaMultilingualNeural' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch)

    const providersStore = useProvidersStore()
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speechStore.activeSpeechModel = 'old-model'
    speechStore.activeSpeechVoiceId = 'old-model-voice'

    try {
      providersStore.providerRuntimeState[OFFICIAL_SPEECH_PROVIDER_ID].models = await providerOfficialSpeech.extraMethods!.listModels!(
        {},
        providerOfficialSpeech.createProvider({}),
      )

      speechStore.ensureActiveSpeechModel()
      await speechStore.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID, speechStore.activeSpeechModel)

      expect(speechStore.activeSpeechModel).toBe('microsoft/v1')
      expect(speechStore.activeSpeechVoiceId).toBe('en-US-AvaMultilingualNeural')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  /**
   * @example
   * await speechStore.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID, 'microsoft/v1')
   */
  it('uses another server recommended voice when the current locale has no recommendation', async () => {
    i18nState.locale.value = 'ko-KR'
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('/api/v1/audio/models')) {
        return new Response(JSON.stringify({
          models: [{ id: 'microsoft/v1', name: 'microsoft/v1' }],
          default: 'microsoft/v1',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        voices: [
          {
            id: 'ko-KR-SunHiNeural',
            name: 'SunHi',
            languages: [{ code: 'ko-KR', title: 'Korean' }],
          },
          {
            id: 'zh-CN-XiaochenNeural',
            name: 'Xiaochen',
            languages: [{ code: 'zh-CN', title: 'Chinese' }],
          },
        ],
        recommended: { 'zh-CN': 'zh-CN-XiaochenNeural' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch)

    const providersStore = useProvidersStore()
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID

    try {
      providersStore.providerRuntimeState[OFFICIAL_SPEECH_PROVIDER_ID].models = await providerOfficialSpeech.extraMethods!.listModels!(
        {},
        providerOfficialSpeech.createProvider({}),
      )

      speechStore.ensureActiveSpeechModel()
      await speechStore.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID, speechStore.activeSpeechModel)

      expect(speechStore.activeSpeechModel).toBe('microsoft/v1')
      expect(speechStore.activeSpeechVoiceId).toBe('zh-CN-XiaochenNeural')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
