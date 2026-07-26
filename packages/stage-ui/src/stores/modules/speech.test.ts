import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, providerOfficialSpeech } from '../../libs/providers/providers/official'
import { useProvidersStore } from '../providers'
import { toSignedPercent, useSpeechStore } from './speech'

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
   * speechStore.resolveSpeechInput({ text, voice, providerConfig: { voice: 'plain' } })
   */
  it('leaves speech input unchanged by default', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'plain-voice',
      name: 'Plain Voice',
      provider: 'openai-compatible-audio-speech',
      languages: [{ code: 'en-US', title: 'English' }],
    }

    const request = speechStore.resolveSpeechInput({
      text: 'hello',
      voice,
      providerConfig: { voice: 'plain-voice' },
    })

    expect(request.input).toBe('hello')
    expect(request.providerConfig).toEqual({ voice: 'plain-voice' })
  })

  it('applies configured pitch through SSML when supported', () => {
    const speechStore = useSpeechStore()
    const voice = {
      id: 'voice-1',
      name: 'Voice 1',
      provider: OFFICIAL_SPEECH_PROVIDER_ID,
      languages: [{ code: 'en-US', title: 'English' }],
      gender: 'neutral',
    }

    const request = speechStore.resolveSpeechInput({
      text: 'hello',
      voice,
      providerConfig: { pitch: 20 },
      forceSSML: true,
      supportsSSML: true,
    })

    expect(request.input).toContain('<prosody')
    expect(request.input).toContain('pitch="+20%"')
  })

  /**
   * @example
   * speechStore.resolveSpeechInput({ text, voice, forceSSML: true, supportsSSML: false })
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
    const request = speechStore.resolveSpeechInput({
      text: 'hello',
      voice,
      providerConfig: { pitch: 0 },
      forceSSML: true,
      supportsSSML: false,
    })

    expect(request.input).toBe('hello')
    expect(request.input).not.toContain('<speak')
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
  it('keeps a real Voice Pack TTS model selected for the regular official provider', () => {
    const providersStore = useProvidersStore()
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speechStore.activeSpeechModel = 'volcengine/pool-a'
    speechStore.activeSpeechVoiceId = 'voice-a'
    providersStore.providerRuntimeState[OFFICIAL_SPEECH_PROVIDER_ID].models = [
      { id: 'volcengine/pool-a', name: 'volcengine/pool-a', provider: OFFICIAL_SPEECH_PROVIDER_ID },
      { id: 'microsoft/v1', name: 'microsoft/v1', provider: OFFICIAL_SPEECH_PROVIDER_ID },
    ]

    speechStore.ensureActiveSpeechModel()

    expect(speechStore.activeSpeechModel).toBe('volcengine/pool-a')
    expect(speechStore.activeSpeechVoiceId).toBe('voice-a')
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

  // ROOT CAUSE:
  //
  // If a voice reload fails after a credential change (e.g. a valid API key
  // is replaced with an unauthorized one), loadVoicesForProvider caught the
  // error and returned [] without touching availableVoices, so the catalog
  // fetched with the previous credentials stayed visible and selectable.
  //
  // We fixed this by clearing the provider's availableVoices entry when a
  // current (non-superseded) reload fails under a changed provider config.
  //
  // https://github.com/moeru-ai/airi/pull/2070#discussion_r3597444853
  it('clears the cached catalog when a reload with changed credentials fails', async () => {
    const providersStore = useProvidersStore()
    const speechStore = useSpeechStore()
    const metadata = providersStore.providerMetadata['fish-audio']

    providersStore.providers['fish-audio'] = { apiKey: 'old-key' }
    metadata.capabilities.listVoices = vi.fn(async () => [
      { id: 'voice-old', name: 'Old Account Voice', provider: 'fish-audio', languages: [] },
    ])
    await speechStore.loadVoicesForProvider('fish-audio')
    expect(speechStore.availableVoices['fish-audio']).toHaveLength(1)

    providersStore.providers['fish-audio'] = { apiKey: 'unauthorized-key' }
    metadata.capabilities.listVoices = vi.fn(async () => {
      throw new Error('401 unauthorized')
    })
    const voices = await speechStore.loadVoicesForProvider('fish-audio')

    expect(voices).toEqual([])
    expect(speechStore.availableVoices['fish-audio']).toEqual([])
    expect(speechStore.speechProviderError).toContain('401')
  })

  // ROOT CAUSE:
  //
  // The first version of the stale-catalog fix cleared the cache on every
  // failed reload. A transient voice-list outage under unchanged credentials
  // then wiped a still-valid catalog and blocked generation until another
  // reload happened to run.
  //
  // We fixed this by snapshotting the config that produced the cached
  // catalog and clearing only when the failing reload used a different one.
  //
  // https://github.com/moeru-ai/airi/pull/2070#discussion_r3597538697
  it('keeps the cached catalog when a reload with unchanged credentials fails', async () => {
    const providersStore = useProvidersStore()
    const speechStore = useSpeechStore()
    const metadata = providersStore.providerMetadata['fish-audio']

    providersStore.providers['fish-audio'] = { apiKey: 'stable-key' }
    metadata.capabilities.listVoices = vi.fn(async () => [
      { id: 'voice-a', name: 'Voice A', provider: 'fish-audio', languages: [] },
    ])
    await speechStore.loadVoicesForProvider('fish-audio')
    expect(speechStore.availableVoices['fish-audio']).toHaveLength(1)

    metadata.capabilities.listVoices = vi.fn(async () => {
      throw new Error('503 upstream outage')
    })
    const voices = await speechStore.loadVoicesForProvider('fish-audio')

    expect(voices).toEqual([])
    expect(speechStore.availableVoices['fish-audio'].map(voice => voice.id)).toEqual(['voice-a'])
    expect(speechStore.speechProviderError).toContain('503')
  })

  // ROOT CAUSE:
  //
  // Overlapping voice reloads (credentials changed again while an earlier
  // request was in flight) both wrote to availableVoices[provider], so a slow
  // superseded response finishing last could overwrite the catalog fetched
  // with the newer credentials.
  //
  // We fixed this by stamping each reload with a per-provider generation and
  // discarding responses (and errors) from superseded generations.
  //
  // https://github.com/moeru-ai/airi/pull/2070#discussion_r3597444860
  it('ignores responses from superseded voice reloads', async () => {
    const providersStore = useProvidersStore()
    const speechStore = useSpeechStore()
    const metadata = providersStore.providerMetadata['fish-audio']

    let resolveSlow: (voices: { id: string, name: string, provider: string, languages: [] }[]) => void
    const slowRequest = new Promise<{ id: string, name: string, provider: string, languages: [] }[]>((resolve) => {
      resolveSlow = resolve
    })

    metadata.capabilities.listVoices = vi.fn(() => slowRequest)
    const slowReload = speechStore.loadVoicesForProvider('fish-audio')

    metadata.capabilities.listVoices = vi.fn(async () => [
      { id: 'voice-new', name: 'New Account Voice', provider: 'fish-audio', languages: [] },
    ])
    await speechStore.loadVoicesForProvider('fish-audio')
    expect(speechStore.availableVoices['fish-audio'].map(voice => voice.id)).toEqual(['voice-new'])

    // The old-credentials request finishes last; it must not clobber the
    // catalog owned by the newer reload.
    resolveSlow!([{ id: 'voice-old', name: 'Old Account Voice', provider: 'fish-audio', languages: [] }])
    await slowReload

    expect(speechStore.availableVoices['fish-audio'].map(voice => voice.id)).toEqual(['voice-new'])
  })
})
