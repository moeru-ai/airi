import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, providerOfficialSpeech } from '../../libs/providers/providers/official'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
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

  // ROOT CAUSE:
  //
  // The speech store watched its model-list projection even when no UI used
  // that projection. Each synced provider snapshot invalidated the projection.
  // The watcher then called getModelsForProvider twice when the cache was empty.
  //
  // We fixed this by keeping model selection behind explicit operations. A UI
  // consumer can still read providerModels when it needs the cached catalog.
  it('does not query the model cache when only provider state changes', async () => {
    const providersStore = useProviderStore()
    vi.spyOn(providersStore, 'listProviderVoices').mockResolvedValue([])
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    await nextTick()

    let modelQueries = 0
    providersStore.$onAction(({ name }) => {
      if (name === 'getModelsForProvider')
        modelQueries += 1
    })

    providersStore.providerRuntimeState = {}
    await nextTick()

    expect(modelQueries).toBe(0)
  })

  // ROOT CAUSE:
  //
  // A voice request replaced the empty catalog with another empty object. The
  // catalog lived in synchronized state, so this renderer published the whole
  // speech tuple even though no persisted selection changed.
  //
  // We fixed this by keeping request results renderer-local and by writing the
  // selected voice only when a matching voice differs from the current value.
  it('does not publish a synchronized mutation for an unresolved voice', async () => {
    const providersStore = useProviderStore()
    vi.spyOn(providersStore, 'listProviderVoices').mockResolvedValue([])
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speechStore.activeSpeechVoiceId = 'missing-voice'
    speechStore.activeSpeechVoice = undefined
    speechStore.availableVoices = {}
    await nextTick()

    let mutations = 0
    speechStore.$subscribe(() => mutations += 1, { flush: 'sync' })

    speechStore.availableVoices = {}
    await nextTick()

    expect(mutations).toBe(0)
  })

  // ROOT CAUSE:
  //
  // Synced stores arrive in separate snapshots. The speech store can receive
  // its selected provider before the matching provider configuration snapshot.
  // A metadata watcher treated this temporary state as provider deletion and
  // replaced the synchronized selection with speech-noop.
  //
  // We fixed this by keeping provider selection command-driven. A provider
  // configuration snapshot no longer edits the speech module selection.
  it('keeps the selected provider while provider snapshots are incomplete', async () => {
    const providersStore = useProviderStore()
    const providerConfigStore = useProviderConfigStore()
    vi.spyOn(providersStore, 'listProviderVoices').mockResolvedValue([])
    const speechStore = useSpeechStore()
    await providersStore.initializeProvider(OFFICIAL_SPEECH_PROVIDER_ID)
    providersStore.forceProviderConfigured(OFFICIAL_SPEECH_PROVIDER_ID)
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speechStore.activeSpeechModel = 'auto'
    await vi.waitFor(() => {
      expect(providersStore.configuredSpeechProvidersMetadata.map(provider => provider.id)).toContain(OFFICIAL_SPEECH_PROVIDER_ID)
    })

    providersStore.providerRuntimeState = {}
    providerConfigStore.providers = {}
    await vi.waitFor(() => {
      expect(providersStore.configuredSpeechProvidersMetadata.map(provider => provider.id)).not.toContain(OFFICIAL_SPEECH_PROVIDER_ID)
    })

    expect(speechStore.activeSpeechProvider).toBe(OFFICIAL_SPEECH_PROVIDER_ID)
    expect(speechStore.activeSpeechModel).toBe('auto')
  })

  // ROOT CAUSE:
  //
  // Provider pages and the speech module could request the same voice catalog
  // at the same time. Every request toggled one synchronized loading boolean,
  // so unrelated windows repeatedly replaced the voice list with a skeleton.
  //
  // We fixed this by coalescing equal requests and deriving loading state from
  // this renderer's in-flight requests for the active provider only.
  it('coalesces voice loads and scopes loading to the active provider', async () => {
    const providersStore = useProviderStore()
    let resolveVoices: ((voices: []) => void) | undefined
    const voicesRequest = new Promise<[]>((resolve) => {
      resolveVoices = resolve
    })
    const listVoices = vi.spyOn(providersStore, 'listProviderVoices').mockImplementation(async (provider) => {
      if (provider === 'kokoro-local')
        return await voicesRequest
      return []
    })
    const speechStore = useSpeechStore()
    await vi.waitFor(() => expect(speechStore.isLoadingSpeechProviderVoices).toBe(false))
    listVoices.mockClear()

    const firstLoad = speechStore.loadVoicesForProvider('kokoro-local')
    const secondLoad = speechStore.loadVoicesForProvider('kokoro-local')

    expect(listVoices).toHaveBeenCalledTimes(1)
    expect(speechStore.isLoadingSpeechProviderVoices).toBe(false)
    expect('isLoadingSpeechProviderVoices' in speechStore.$state).toBe(false)
    expect('activeVoiceLoadKeys' in speechStore.$state).toBe(false)
    expect('availableVoices' in speechStore.$state).toBe(false)
    expect('activeSpeechVoice' in speechStore.$state).toBe(false)

    speechStore.activeSpeechProvider = 'kokoro-local'
    await nextTick()

    expect(listVoices).toHaveBeenCalledTimes(1)
    expect(speechStore.isLoadingSpeechProviderVoices).toBe(true)

    resolveVoices?.([])
    await Promise.all([firstLoad, secondLoad])
    await vi.waitFor(() => expect(speechStore.isLoadingSpeechProviderVoices).toBe(false))
  })

  // https://github.com/moeru-ai/airi/pull/2382#discussion_r3876471588
  it('loads voices when the provider changes and the model ID stays the same', async () => {
    const providersStore = useProviderStore()
    const listVoices = vi.spyOn(providersStore, 'listProviderVoices').mockResolvedValue([])
    const speechStore = useSpeechStore()
    await vi.waitFor(() => expect(speechStore.isLoadingSpeechProviderVoices).toBe(false))
    listVoices.mockClear()

    speechStore.activeSpeechModel = 'shared-model'
    speechStore.activeSpeechProvider = 'provider-a'
    await vi.waitFor(() => expect(listVoices).toHaveBeenCalledWith('provider-a', 'shared-model'))
    listVoices.mockClear()

    speechStore.activeSpeechProvider = 'provider-b'
    await vi.waitFor(() => expect(listVoices).toHaveBeenCalledWith('provider-b', 'shared-model'))
  })

  // https://github.com/moeru-ai/airi/pull/2382#discussion_r3876290830
  // https://github.com/moeru-ai/airi/pull/2382#discussion_r3876471599
  // ROOT CAUSE:
  //
  // The voice-load key contained only the provider and model. A request that
  // used old credentials remained reusable after the Provider configuration
  // changed. Its result could then replace the new account's voice catalog.
  // The provider-only loading counter also kept obsolete requests visible.
  //
  // We fixed this by adding the Provider configuration to the request identity.
  // The current request key now owns the catalog result and loading state.
  it('starts a new voice load after Provider configuration changes and ignores the stale result', async () => {
    const providerConfigStore = useProviderConfigStore()
    const providersStore = useProviderStore()
    const speechStore = useSpeechStore()
    await vi.waitFor(() => expect(speechStore.isLoadingSpeechProviderVoices).toBe(false))

    providerConfigStore.providers.elevenlabs = {
      id: 'elevenlabs',
      definitionId: 'elevenlabs',
      config: { apiKey: 'old-key' },
      status: 'configured',
      configuredBy: 'user',
    }

    const listVoices = vi.spyOn(providersStore, 'listProviderVoices').mockResolvedValue([])
    speechStore.activeSpeechModel = 'eleven_multilingual_v2'
    speechStore.activeSpeechProvider = 'elevenlabs'
    await vi.waitFor(() => expect(listVoices).toHaveBeenCalledWith('elevenlabs', 'eleven_multilingual_v2'))
    await vi.waitFor(() => expect(speechStore.isLoadingSpeechProviderVoices).toBe(false))
    listVoices.mockReset().mockResolvedValue([])

    const oldVoices = [{ id: 'old-voice', name: 'Old voice', provider: 'elevenlabs', languages: [] }]
    const newVoices = [{ id: 'new-voice', name: 'New voice', provider: 'elevenlabs', languages: [] }]
    let resolveOldVoices: ((voices: typeof oldVoices) => void) | undefined
    let resolveNewVoices: ((voices: typeof newVoices) => void) | undefined
    const oldRequest = new Promise<typeof oldVoices>((resolve) => {
      resolveOldVoices = resolve
    })
    const newRequest = new Promise<typeof newVoices>((resolve) => {
      resolveNewVoices = resolve
    })
    listVoices.mockImplementationOnce(async () => await oldRequest)
      .mockImplementationOnce(async () => await newRequest)

    const oldLoad = speechStore.loadVoicesForProvider('elevenlabs', 'eleven_multilingual_v2')
    providerConfigStore.providers.elevenlabs.config = { apiKey: 'new-key' }
    const newLoad = speechStore.loadVoicesForProvider('elevenlabs', 'eleven_multilingual_v2')

    expect(listVoices).toHaveBeenCalledTimes(2)
    expect(speechStore.isLoadingSpeechProviderVoices).toBe(true)

    resolveNewVoices?.(newVoices)
    await newLoad
    expect(speechStore.availableVoices.elevenlabs).toEqual(newVoices)
    await vi.waitFor(() => expect(speechStore.isLoadingSpeechProviderVoices).toBe(false))

    resolveOldVoices?.(oldVoices)
    await oldLoad
    expect(speechStore.availableVoices.elevenlabs).toEqual(newVoices)
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
    const providersStore = useProviderStore()
    const speechStore = useSpeechStore()
    const listVoices = vi.spyOn(providersStore, 'listProviderVoices')
    providersStore.setProviderUnconfigured(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)

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
  it('keeps a real Voice Pack TTS model selected for the regular official provider', async () => {
    const providersStore = useProviderStore()
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speechStore.activeSpeechModel = 'volcengine/pool-a'
    speechStore.activeSpeechVoiceId = 'voice-a'
    await providersStore.initializeProvider(OFFICIAL_SPEECH_PROVIDER_ID)
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

    const providersStore = useProviderStore()
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
      await providersStore.initializeProvider(OFFICIAL_SPEECH_PROVIDER_ID)
      const provider = await providerOfficialSpeech.createProvider({})
      providersStore.providerRuntimeState[OFFICIAL_SPEECH_PROVIDER_ID].models = await providerOfficialSpeech.extraMethods!.listModels!(
        {},
        provider,
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

    const providersStore = useProviderStore()
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speechStore.activeSpeechModel = 'old-model'
    speechStore.activeSpeechVoiceId = 'old-model-voice'

    try {
      await providersStore.initializeProvider(OFFICIAL_SPEECH_PROVIDER_ID)
      const provider = await providerOfficialSpeech.createProvider({})
      providersStore.providerRuntimeState[OFFICIAL_SPEECH_PROVIDER_ID].models = await providerOfficialSpeech.extraMethods!.listModels!(
        {},
        provider,
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

    const providersStore = useProviderStore()
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID

    try {
      await providersStore.initializeProvider(OFFICIAL_SPEECH_PROVIDER_ID)
      const provider = await providerOfficialSpeech.createProvider({})
      providersStore.providerRuntimeState[OFFICIAL_SPEECH_PROVIDER_ID].models = await providerOfficialSpeech.extraMethods!.listModels!(
        {},
        provider,
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

describe('single model speech providers', () => {
  // Selecting a provider makes the speech store load its voices. Without a stub
  // the VOICEVOX entries reach for a real engine on localhost. The rejection
  // then logs after the file finishes, and the run fails on a teardown race.
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', async () => Response.json([]))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // https://github.com/moeru-ai/airi/issues/2166
  it('selects the only published model, so the provider is not left unconfigured — Issue #2166', async () => {
    // `settings/modules/speech.vue` clears `activeSpeechModel` on every provider
    // switch. Without the seeding below, a provider that publishes one model
    // keeps an empty model, `configured` stays false, and the stage never
    // speaks until the user opens the dropdown and picks that one entry.
    const providersStore = useProviderStore()
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = 'voicevox'
    speechStore.activeSpeechModel = ''
    await providersStore.initializeProvider('voicevox')
    providersStore.providerRuntimeState.voicevox.models = [
      { id: 'default', name: 'VOICEVOX', provider: 'voicevox' },
    ]

    speechStore.ensureActiveSpeechModel()

    expect(speechStore.activeSpeechModel).toBe('default')
  })

  it('keeps the voice when it seeds the model, because voices belong to the provider', async () => {
    const providersStore = useProviderStore()
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = 'voicevox'
    speechStore.activeSpeechModel = ''
    speechStore.activeSpeechVoiceId = '3'
    await providersStore.initializeProvider('voicevox')
    providersStore.providerRuntimeState.voicevox.models = [
      { id: 'default', name: 'VOICEVOX', provider: 'voicevox' },
    ]

    speechStore.ensureActiveSpeechModel()

    expect(speechStore.activeSpeechVoiceId).toBe('3')
  })

  it('does not guess when a provider publishes several models', async () => {
    const providersStore = useProviderStore()
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = 'elevenlabs'
    speechStore.activeSpeechModel = ''
    await providersStore.initializeProvider('elevenlabs')
    providersStore.providerRuntimeState.elevenlabs.models = [
      { id: 'eleven_v3', name: 'v3', provider: 'elevenlabs' },
      { id: 'eleven_flash_v2_5', name: 'flash', provider: 'elevenlabs' },
    ]

    speechStore.ensureActiveSpeechModel()

    expect(speechStore.activeSpeechModel).toBe('')
  })
})

describe('vOICEVOX provider defaults', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // https://github.com/moeru-ai/airi/issues/2166
  it('persists the neutral volume default, so a new provider is not silent — Issue #2166', async () => {
    // The settings form seeds `{ pitch: 0, speed: 1, volume: 0 }` when the
    // stored configuration carries no voice settings, and a `volumeScale` of
    // zero is silence. Provider metadata resolves asynchronously, so this pins
    // that `initializeProvider` waits for it before it writes the schema
    // defaults into the stored configuration.
    const providersStore = useProviderStore()
    const providerConfigStore = useProviderConfigStore()

    await providersStore.initializeProvider('voicevox')

    expect(providerConfigStore.getProviderConfig('voicevox')?.voiceSettings)
      .toEqual({ speed: 1, pitch: 0, intonation: 1, volume: 1 })
  })
})
