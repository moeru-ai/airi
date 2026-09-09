import type { Session, User } from 'better-auth'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, pickOfficialSpeechVoice, providerOfficialSpeech } from '../../libs/providers/providers/official'
import { useAuthStore } from '../auth'
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

/** Configures the authenticated state required by official provider requests. */
function authenticateOfficialProvider(): void {
  const user: User = {
    id: 'user-1',
    name: 'AIRI User',
    email: 'user@example.com',
    emailVerified: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }
  const session: Session = {
    id: 'session-1',
    token: 'server-session-token',
    userId: user.id,
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }
  useAuthStore().$patch({ session, token: 'restored-access-token', user })
}

describe('speech store helpers', () => {
  beforeEach(() => {
    i18nState.locale.value = 'en-US'
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
  // A synced snapshot replaced the empty voice catalog with another empty
  // object. The voice watcher then assigned undefined to an undefined ref.
  // refManualReset reported that no-op assignment as another Pinia mutation.
  //
  // Catalog refreshes now stay outside the speech settings snapshot. They
  // must not publish settings when no selected voice needs an update.
  it('does not publish a second mutation for an unresolved voice', async () => {
    const providersStore = useProviderStore()
    vi.spyOn(providersStore, 'listProviderVoices').mockResolvedValue([])
    const speechStore = useSpeechStore()
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speechStore.activeSpeechVoiceId = 'missing-voice'
    speechStore.activeSpeechVoice = undefined
    await speechStore.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID)
    await nextTick()
    // The startup watcher now enters through the deferred public action.
    await vi.waitFor(() => expect(speechStore.isLoadingSpeechProviderVoices).toBe(false))

    let mutations = 0
    speechStore.$subscribe(() => mutations += 1, { flush: 'sync' })

    await speechStore.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID)
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
    // Let the initial no-speech request finish before observing streaming calls.
    await nextTick()
    await vi.waitFor(() => expect(speechStore.isLoadingSpeechProviderVoices).toBe(false))
    const listVoices = vi.spyOn(providersStore, 'listProviderVoices')
    providersStore.setProviderUnconfigured(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)

    const voices = await speechStore.loadVoicesForProvider(
      OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
      'volcengine/seed-tts-2.0',
    )

    expect(voices).toEqual([])
    expect(listVoices).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // Streaming discovery kept its default model in one renderer's module
  // variable. Another renderer received the synchronized models but selected
  // the first entry instead of the operator default.
  //
  // Before: read getDefaultStreamingModel() from renderer-local memory.
  //
  // We fixed this by storing the default beside the synchronized model catalog.
  it('selects the synchronized streaming default instead of the first model', async () => {
    const providersStore = useProviderStore()
    vi.spyOn(providersStore, 'listProviderVoices').mockResolvedValue([])
    const speechStore = useSpeechStore()
    await providersStore.initializeProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
    providersStore.providerRuntimeState[OFFICIAL_SPEECH_STREAMING_PROVIDER_ID] = {
      models: [
        { id: 'volcengine/seed-tts-1.0', name: 'Seed TTS 1.0', provider: OFFICIAL_SPEECH_STREAMING_PROVIDER_ID },
        { id: 'volcengine/seed-tts-2.0', name: 'Seed TTS 2.0', provider: OFFICIAL_SPEECH_STREAMING_PROVIDER_ID },
      ],
      defaultModel: 'volcengine/seed-tts-2.0',
      modelStatus: 'ready',
      modelError: null,
    }
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_STREAMING_PROVIDER_ID
    speechStore.activeSpeechModel = ''

    speechStore.ensureActiveSpeechModel()

    expect(speechStore.activeSpeechModel).toBe('volcengine/seed-tts-2.0')
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
    authenticateOfficialProvider()

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
      await vi.waitFor(() => expect(speechStore.activeSpeechVoiceId).toBe('en-US-AvaMultilingualNeural'))
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
    authenticateOfficialProvider()

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
      await vi.waitFor(() => expect(speechStore.activeSpeechVoiceId).toBe('zh-CN-XiaochenNeural'))
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
  // ROOT CAUSE: Model reloads lived in the settings page, so card changes bypassed them.
  it('refreshes voices when only the active model changes outside settings', async () => {
    const providers = useProviderStore()
    const loads = vi.spyOn(providers, 'listProviderVoices').mockResolvedValue([])
    const speech = useSpeechStore()
    speech.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speech.activeSpeechModel = 'model-a'
    await new Promise(resolve => setTimeout(resolve, 20))
    loads.mockClear()
    speech.activeSpeechModel = 'model-b'
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(loads).toHaveBeenCalledWith(OFFICIAL_SPEECH_PROVIDER_ID, 'model-b', expect.anything())
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3964660980
  // ROOT CAUSE: Every refresh cleared the catalog, even when its identity did
  // not change. A temporary failure then removed valid cached choices.
  it('retains the same catalog on refresh failure but clears it for a different model', async () => {
    const providers = useProviderStore()
    const voices = [{ id: 'cached', name: 'Cached', languages: [], provider: 'microsoft-speech' }]
    const loads = vi.spyOn(providers, 'listProviderVoices').mockResolvedValue(voices)
    const speech = useSpeechStore()
    await speech.loadVoicesForProvider('microsoft-speech', 'model-a')
    loads.mockRejectedValue(new Error('temporary outage'))
    await speech.loadVoicesForProvider('microsoft-speech', 'model-a')
    expect(speech.availableVoices['microsoft-speech']).toEqual(voices)
    expect(speech.voiceCatalogStatus['microsoft-speech']?.error).toBe('temporary outage')
    await speech.loadVoicesForProvider('microsoft-speech', 'model-b')
    expect(speech.availableVoices['microsoft-speech']).toEqual([])
  })

  it('invalidates cached voices when configuration changes or the provider session expires', async () => {
    const providers = useProviderStore()
    const voices = [{ id: 'cached', name: 'Cached', languages: [], provider: 'microsoft-speech' }]
    const loads = vi.spyOn(providers, 'listProviderVoices').mockResolvedValue(voices)
    const speech = useSpeechStore()
    const original = { definitionId: 'microsoft-speech', config: { baseUrl: 'https://old.invalid/' } }
    const changed = { definitionId: 'microsoft-speech', config: { baseUrl: 'https://new.invalid/' } }
    await speech.loadVoiceCatalog('microsoft-speech', 'model-a', original)
    loads.mockRejectedValue(new Error('configuration unavailable'))
    await expect(speech.loadVoiceCatalog('microsoft-speech', 'model-a', changed)).rejects.toThrow('configuration unavailable')
    expect(speech.availableVoices['microsoft-speech']).toEqual([])
    loads.mockResolvedValue(voices)
    await speech.loadVoiceCatalog('microsoft-speech', 'model-a', changed)
    loads.mockResolvedValue(undefined)
    await speech.loadVoiceCatalog('microsoft-speech', 'model-a', changed)
    expect(speech.availableVoices['microsoft-speech']).toEqual([])
    expect(speech.voiceCatalogIdentities['microsoft-speech']).toBeUndefined()
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3964866479
  // ROOT CAUSE: Completed catalogs outlived their owner because only pending
  // requests observed session invalidation. Logout must invalidate cached data.
  it('clears completed owned catalogs on logout while preserving user-provider catalogs', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ flux: 0 })))
    authenticateOfficialProvider()
    const providers = useProviderStore()
    const voices = [{ id: 'old-owner', name: 'Old owner', languages: [], provider: OFFICIAL_SPEECH_PROVIDER_ID }]
    const loads = vi.spyOn(providers, 'listProviderVoices').mockResolvedValue(voices)
    const speech = useSpeechStore()
    await speech.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID, 'model-a')
    await speech.loadVoicesForProvider('microsoft-speech', 'model-a')
    useAuthStore().$patch({ user: null, session: null, token: null })
    await vi.waitFor(() => expect(speech.availableVoices[OFFICIAL_SPEECH_PROVIDER_ID]).toEqual([]))
    expect(speech.availableVoices['microsoft-speech']).toEqual(voices)
    authenticateOfficialProvider()
    useAuthStore().user = { ...useAuthStore().user!, id: 'new-owner' }
    loads.mockRejectedValue(new Error('new account unavailable'))
    await speech.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID, 'model-a')
    expect(speech.availableVoices[OFFICIAL_SPEECH_PROVIDER_ID]).toEqual([])
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3964866488
  it('retains completed catalogs across token renewal and same-ID session objects', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ flux: 0 })))
    authenticateOfficialProvider()
    const providers = useProviderStore()
    const voices = [{ id: 'retained', name: 'Retained', languages: [], provider: OFFICIAL_SPEECH_PROVIDER_ID }]
    vi.spyOn(providers, 'listProviderVoices').mockResolvedValue(voices)
    const speech = useSpeechStore()
    await speech.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID, 'model-a')
    const identity = speech.voiceCatalogIdentities[OFFICIAL_SPEECH_PROVIDER_ID]
    const auth = useAuthStore()
    auth.$patch({ token: 'renewed-token', user: { ...auth.user! }, session: { ...auth.session! } })
    await nextTick()
    await speech.invalidateVoiceCatalogs()
    expect(speech.availableVoices[OFFICIAL_SPEECH_PROVIDER_ID]).toEqual(voices)
    expect(speech.voiceCatalogIdentities[OFFICIAL_SPEECH_PROVIDER_ID]).toEqual(identity)
  })

  it('discards a request reset while its configuration fingerprint is pending', async () => {
    const providers = useProviderStore()
    const original = providers.getVoiceCatalogIdentity.bind(providers)
    let finish!: () => void
    const barrier = new Promise<void>((resolve) => {
      finish = resolve
    })
    vi.spyOn(providers, 'getVoiceCatalogIdentity').mockImplementation(async (model, configuration) => {
      const identity = await original(model, configuration)
      if (model === 'delayed')
        await barrier
      return identity
    })
    const requests = vi.spyOn(providers, 'listProviderVoices').mockResolvedValue([])
    const speech = useSpeechStore()
    const pending = speech.loadVoiceCatalog('microsoft-speech', 'delayed', { definitionId: 'microsoft-speech', config: {} })
    await speech.resetState()
    finish()
    await expect(pending).resolves.toEqual([])
    expect(requests.mock.calls.some(([, model]) => model === 'delayed')).toBe(false)
    expect(speech.availableVoices['microsoft-speech']).toBeUndefined()
  })

  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3964866488
  it('keeps large provider samples out of replicated speech state', async () => {
    vi.spyOn(useProviderStore(), 'listProviderVoices').mockResolvedValue([])
    const speech = useSpeechStore()
    await speech.loadVoiceCatalog('microsoft-speech', 'model-a', {
      definitionId: 'microsoft-speech',
      config: { voiceSample: 'private-sample'.repeat(100000) },
    })
    const state = JSON.stringify({ settings: speech.$state, identities: speech.voiceCatalogIdentities })
    expect(state.length).toBeLessThan(2000)
    expect(state).not.toContain('private-sample')
  })

  // ROOT CAUSE: The adapter wrote recommendations before the store discarded stale responses.
  it('rejects old recommendation side effects together with the old catalog', async () => {
    authenticateOfficialProvider()
    const speech = useSpeechStore()
    const { promise: oldResponse, resolve: finishOld } = Promise.withResolvers<Response>()
    const voices = [
      { id: 'old', name: 'Old', languages: [{ code: 'en-US', title: 'English' }] },
      { id: 'new', name: 'New', languages: [{ code: 'en-US', title: 'English' }] },
    ]
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes('model=model-a'))
        return oldResponse
      return Response.json({ voices, recommended: { 'en-US': 'new' } })
    }))
    const oldLoad = speech.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID, 'model-a')
    await new Promise(resolve => setTimeout(resolve, 20))
    await speech.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID, 'model-b')
    finishOld(Response.json({ voices, recommended: { 'en-US': 'old' } }))
    await oldLoad
    expect(pickOfficialSpeechVoice({
      activeSpeechProvider: OFFICIAL_SPEECH_PROVIDER_ID,
      activeSpeechVoiceId: '',
      availableVoices: speech.availableVoices,
      uiLocale: 'en-US',
    })).toBe('new')
  })
  // ROOT CAUSE: Clearing a card's voice could auto-pick from the previous model while its replacement loaded.
  it('does not auto-pick from the old model while loading the new catalog', async () => {
    const providers = useProviderStore()
    const loads = vi.spyOn(providers, 'listProviderVoices').mockResolvedValue([])
    const speech = useSpeechStore()
    speech.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speech.activeSpeechModel = 'model-a'
    await new Promise(resolve => setTimeout(resolve, 20))
    loads.mockResolvedValue([
      { id: 'old', name: 'Old', languages: [], provider: OFFICIAL_SPEECH_PROVIDER_ID, recommendedFor: ['en-US'] },
    ])
    await speech.loadVoicesForProvider(OFFICIAL_SPEECH_PROVIDER_ID, 'model-a')
    await speech.ensureActiveSpeechVoice()
    let finish!: () => void
    loads.mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve([])
    }))
    speech.activeSpeechModel = 'model-b'
    speech.activeSpeechVoiceId = ''
    try {
      await vi.waitFor(() => expect(finish).toBeDefined())
      expect(speech.activeSpeechVoiceId).toBe('')
    }
    finally {
      finish?.()
    }
  })
  // https://github.com/moeru-ai/airi/pull/2490#discussion_r3963756330
  // ROOT CAUSE: A background provider's newer request hid the active provider's pending state and error.
  it('keeps active provider status when another provider finishes first', async () => {
    const providers = useProviderStore()
    const loads = vi.spyOn(providers, 'listProviderVoices').mockResolvedValue([])
    const speech = useSpeechStore()
    speech.activeSpeechProvider = 'microsoft-speech'
    await new Promise(resolve => setTimeout(resolve, 20))
    let rejectActive!: (error: Error) => void
    loads.mockImplementation(async (provider) => {
      if (provider === 'microsoft-speech') {
        return new Promise((_resolve, reject) => {
          rejectActive = reject
        })
      }
      return []
    })
    const active = speech.loadVoicesForProvider('microsoft-speech')
    try {
      await vi.waitFor(() => expect(rejectActive).toBeDefined())
      await speech.loadVoicesForProvider('speech-noop')
      expect(speech.isLoadingSpeechProviderVoices).toBe(true)
      rejectActive(new Error('active provider failed'))
      await active
      expect(speech.speechProviderError).toBe('active provider failed')
      expect(speech.isLoadingSpeechProviderVoices).toBe(false)
    }
    finally {
      rejectActive?.(new Error('test cleanup'))
      await active
    }
  })
})
