import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID, OFFICIAL_TRANSCRIPTION_PROVIDER_ID } from '../../libs/providers/providers/official'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useConsciousnessStore } from './consciousness'
import { configureAsDefaultsIfEmpty, unconfigureAuthenticationProviders } from './default'
import { useHearingStore } from './hearing'
import { useSpeechStore } from './speech'
import { useVisionStore } from './vision'

vi.mock('../../composables/use-analytics', () => ({
  useAnalytics: () => ({
    trackAudioDeviceUnavailable: vi.fn(),
    trackMicrophonePermissionDenied: vi.fn(),
    trackSttFailed: vi.fn(),
    trackSttStarted: vi.fn(),
    trackSttSucceeded: vi.fn(),
    trackVoiceInputStarted: vi.fn(),
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en-US' },
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

describe('official provider module defaults', () => {
  it('preserves an explicit Steam silence selection when applying authenticated defaults', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
    const speech = useSpeechStore()
    speech.activeSpeechProvider = 'speech-noop'
    await configureAsDefaultsIfEmpty()
    expect(speech.activeSpeechProvider).toBe('speech-noop')
  })

  it('restores ordinary Steam speech after logout without treating it as explicit silence', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
    await configureAsDefaultsIfEmpty()
    const speech = useSpeechStore()
    expect(speech.activeSpeechProvider).toBe(OFFICIAL_SPEECH_PROVIDER_ID)
    await unconfigureAuthenticationProviders()
    expect(speech.activeSpeechProvider).toBe('')
    await configureAsDefaultsIfEmpty()
    expect(speech.activeSpeechProvider).toBe(OFFICIAL_SPEECH_PROVIDER_ID)
    expect(speech.activeSpeechModel).toBe('auto')
  })
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      recommended: {},
      voices: [],
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it.each(['', OFFICIAL_TRANSCRIPTION_PROVIDER_ID, 'browser-web-speech-api', 'openai-compatible-audio-transcription'])('uses local ASR in Steam instead of %s after login', async (previousProvider) => {
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
    const hearing = useHearingStore()
    hearing.activeTranscriptionProvider = previousProvider
    hearing.activeTranscriptionModel = 'old-cloud-model'
    hearing.activeCustomModelName = 'old-custom-model'

    await configureAsDefaultsIfEmpty()

    expect(hearing.activeTranscriptionProvider).toBe('sherpaw-transcription')
    expect(hearing.activeTranscriptionModel).toBe('sherpaw')
    expect(hearing.activeCustomModelName).toBe('')
    expect(useProviderConfigStore().addedProviders[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]).not.toBe(true)
    await unconfigureAuthenticationProviders()
    expect(hearing.activeTranscriptionProvider).toBe('sherpaw-transcription')
  })

  it('starts and resets Steam Hearing with local ASR before login', () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
    const hearing = useHearingStore()
    expect(hearing.activeTranscriptionProvider).toBe('sherpaw-transcription')
    expect(hearing.activeTranscriptionModel).toBe('sherpaw')
    hearing.resetState()
    expect(hearing.activeTranscriptionProvider).toBe('sherpaw-transcription')
  })

  it('rejects a cloud ASR instance passed directly to Steam Hearing', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
    const transcription = vi.fn(() => ({ baseURL: 'https://example.invalid', apiKey: '', model: 'auto' }))
    await expect(useHearingStore().transcription(
      OFFICIAL_TRANSCRIPTION_PROVIDER_ID,
      { transcription },
      'auto',
      new File(['audio'], 'recording.wav'),
    )).rejects.toThrow('Steam requires local Sherpaw')
    expect(transcription).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // The previous auth synchronization reacted to each module independently.
  // One login could repeat provider setup and could overwrite part of a
  // user's configuration. The replacement command now changes only empty or
  // incomplete official modules and keeps custom modules unchanged.
  it('applies each official provider once when all module selections are empty', async () => {
    const consciousnessStore = useConsciousnessStore()
    const hearingStore = useHearingStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()
    const providerStore = useProviderStore()
    const providerConfigStore = useProviderConfigStore()
    const initializeProvider = vi.spyOn(providerStore, 'initializeProvider')
    const forceProviderConfigured = vi.spyOn(providerStore, 'forceProviderConfigured')

    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(true)

    expect(consciousnessStore.activeProvider).toBe('official-provider')
    expect(consciousnessStore.activeModel).toBe('auto')
    expect(hearingStore.activeTranscriptionProvider).toBe(OFFICIAL_TRANSCRIPTION_PROVIDER_ID)
    expect(hearingStore.activeTranscriptionModel).toBe('auto')
    expect(speechStore.activeSpeechProvider).toBe(OFFICIAL_SPEECH_PROVIDER_ID)
    expect(speechStore.activeSpeechModel).toBe('auto')
    expect(visionStore.activeProvider).toBe('vision-official-provider')
    expect(visionStore.activeModel).toBe('auto')

    expect(providerConfigStore.providers['official-provider']?.status).toBe('configured')
    expect(providerConfigStore.providers['official-provider']?.configuredBy).toBe('authentication')
    expect(providerConfigStore.providers[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]?.configuredBy).toBe('authentication')
    expect(providerConfigStore.providers[OFFICIAL_SPEECH_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_SPEECH_PROVIDER_ID]?.configuredBy).toBe('authentication')
    expect(providerConfigStore.providers['vision-official-provider']?.status).toBe('configured')
    expect(providerConfigStore.providers['vision-official-provider']?.configuredBy).toBe('authentication')
    expect(providerConfigStore.addedProviders['official-provider']).toBe(true)
    expect(providerConfigStore.addedProviders[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]).toBe(true)
    expect(providerConfigStore.addedProviders[OFFICIAL_SPEECH_PROVIDER_ID]).toBe(true)
    expect(providerConfigStore.addedProviders['vision-official-provider']).toBe(true)
    expect(initializeProvider).toHaveBeenCalledTimes(4)
    expect(forceProviderConfigured).toHaveBeenCalledTimes(4)

    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(false)
    expect(initializeProvider).toHaveBeenCalledTimes(4)
    expect(forceProviderConfigured).toHaveBeenCalledTimes(4)
  })

  // ROOT CAUSE:
  //
  // A provider can be empty while an old model or voice remains in storage.
  // The settings page hides these child values, but the default command treated
  // them as a configured module and skipped every official provider.
  //
  // We fixed this by using provider selection as the module ownership signal.
  it('applies defaults when only stale child selections remain', async () => {
    const consciousnessStore = useConsciousnessStore()
    const hearingStore = useHearingStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()
    const providerConfigStore = useProviderConfigStore()
    consciousnessStore.customModelName = 'my-model'
    hearingStore.activeTranscriptionModel = 'old-transcription-model'
    speechStore.activeSpeechModel = 'old-speech-model'
    speechStore.activeSpeechVoiceId = 'old-speech-voice'
    visionStore.customModelName = 'old-vision-model'

    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(true)

    expect(consciousnessStore.activeProvider).toBe('official-provider')
    expect(consciousnessStore.activeModel).toBe('auto')
    expect(consciousnessStore.customModelName).toBe('')
    expect(hearingStore.activeTranscriptionProvider).toBe(OFFICIAL_TRANSCRIPTION_PROVIDER_ID)
    expect(hearingStore.activeTranscriptionModel).toBe('auto')
    expect(hearingStore.activeCustomModelName).toBe('')
    expect(speechStore.activeSpeechProvider).toBe(OFFICIAL_SPEECH_PROVIDER_ID)
    expect(speechStore.activeSpeechModel).toBe('auto')
    expect(speechStore.activeSpeechVoiceId).toBe('')
    expect(visionStore.activeProvider).toBe('vision-official-provider')
    expect(visionStore.activeModel).toBe('auto')
    expect(visionStore.customModelName).toBe('')
    expect(providerConfigStore.providers['official-provider']?.status).toBe('configured')
  })

  // ROOT CAUSE:
  //
  // The default command returned when any module had a provider. A previous
  // run could leave one official module configured while all other modules
  // and provider records stayed empty. Later authentication hooks then kept
  // the partial state forever.
  //
  // We fixed this by repairing official modules and configuring each empty
  // module independently.
  it('repairs a partial official configuration after authentication', async () => {
    const consciousnessStore = useConsciousnessStore()
    const hearingStore = useHearingStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()
    const providerStore = useProviderStore()
    const providerConfigStore = useProviderConfigStore()
    const initializeProvider = vi.spyOn(providerStore, 'initializeProvider')
    const forceProviderConfigured = vi.spyOn(providerStore, 'forceProviderConfigured')
    hearingStore.activeTranscriptionProvider = OFFICIAL_TRANSCRIPTION_PROVIDER_ID
    hearingStore.activeTranscriptionModel = 'auto'

    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(true)

    expect(consciousnessStore.activeProvider).toBe('official-provider')
    expect(consciousnessStore.activeModel).toBe('auto')
    expect(hearingStore.activeTranscriptionProvider).toBe(OFFICIAL_TRANSCRIPTION_PROVIDER_ID)
    expect(hearingStore.activeTranscriptionModel).toBe('auto')
    expect(speechStore.activeSpeechProvider).toBe(OFFICIAL_SPEECH_PROVIDER_ID)
    expect(speechStore.activeSpeechModel).toBe('auto')
    expect(visionStore.activeProvider).toBe('vision-official-provider')
    expect(visionStore.activeModel).toBe('auto')
    expect(providerConfigStore.providers['official-provider']?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_SPEECH_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers['vision-official-provider']?.status).toBe('configured')
    expect(initializeProvider).toHaveBeenCalledTimes(4)
    expect(forceProviderConfigured).toHaveBeenCalledTimes(4)

    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(false)
    expect(initializeProvider).toHaveBeenCalledTimes(4)
    expect(forceProviderConfigured).toHaveBeenCalledTimes(4)
  })

  it('fills an empty model for an existing official provider', async () => {
    const consciousnessStore = useConsciousnessStore()
    const hearingStore = useHearingStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()
    const providerConfigStore = useProviderConfigStore()
    consciousnessStore.activeProvider = 'custom-chat'
    consciousnessStore.activeModel = 'custom-chat-model'
    hearingStore.activeTranscriptionProvider = 'custom-transcription'
    hearingStore.activeTranscriptionModel = 'custom-transcription-model'
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_PROVIDER_ID
    speechStore.activeSpeechModel = ''
    speechStore.activeSpeechVoiceId = 'stale-voice'
    visionStore.activeProvider = 'custom-vision'
    visionStore.activeModel = 'custom-vision-model'

    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(true)

    expect(consciousnessStore.activeProvider).toBe('custom-chat')
    expect(consciousnessStore.activeModel).toBe('custom-chat-model')
    expect(hearingStore.activeTranscriptionProvider).toBe('custom-transcription')
    expect(hearingStore.activeTranscriptionModel).toBe('custom-transcription-model')
    expect(speechStore.activeSpeechProvider).toBe(OFFICIAL_SPEECH_PROVIDER_ID)
    expect(speechStore.activeSpeechModel).toBe('auto')
    expect(speechStore.activeSpeechVoiceId).toBe('')
    expect(visionStore.activeProvider).toBe('custom-vision')
    expect(visionStore.activeModel).toBe('custom-vision-model')
    expect(providerConfigStore.providers['official-provider']?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_SPEECH_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.addedProviders[OFFICIAL_SPEECH_PROVIDER_ID]).toBe(true)
    expect(providerConfigStore.providers['vision-official-provider']?.status).toBe('configured')
  })

  it('adds a configured official provider to the visible provider list', async () => {
    const consciousnessStore = useConsciousnessStore()
    const hearingStore = useHearingStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()
    const providerStore = useProviderStore()
    const providerConfigStore = useProviderConfigStore()
    const forceProviderConfigured = vi.spyOn(providerStore, 'forceProviderConfigured')
    consciousnessStore.activeProvider = 'official-provider'
    consciousnessStore.activeModel = 'auto'
    hearingStore.activeTranscriptionProvider = 'custom-transcription'
    hearingStore.activeTranscriptionModel = 'custom-transcription-model'
    speechStore.activeSpeechProvider = 'custom-speech'
    speechStore.activeSpeechModel = 'custom-speech-model'
    visionStore.activeProvider = 'custom-vision'
    visionStore.activeModel = 'custom-vision-model'
    providerConfigStore.ensureProvider('official-provider', 'official-provider')
    providerConfigStore.setProviderStatus('official-provider', 'configured')

    expect(providerConfigStore.addedProviders['official-provider']).toBeUndefined()
    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(true)

    expect(providerConfigStore.providers['official-provider']?.status).toBe('configured')
    expect(providerConfigStore.addedProviders['official-provider']).toBe(true)
    expect(forceProviderConfigured).toHaveBeenCalledTimes(4)

    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(false)
    expect(forceProviderConfigured).toHaveBeenCalledTimes(4)
  })

  it('keeps a custom module and configures the other empty modules', async () => {
    const consciousnessStore = useConsciousnessStore()
    const hearingStore = useHearingStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()
    const providerConfigStore = useProviderConfigStore()
    consciousnessStore.activeProvider = 'custom-provider'
    consciousnessStore.activeModel = 'custom-model'

    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(true)

    expect(consciousnessStore.activeProvider).toBe('custom-provider')
    expect(consciousnessStore.activeModel).toBe('custom-model')
    expect(hearingStore.activeTranscriptionProvider).toBe(OFFICIAL_TRANSCRIPTION_PROVIDER_ID)
    expect(hearingStore.activeTranscriptionModel).toBe('auto')
    expect(speechStore.activeSpeechProvider).toBe(OFFICIAL_SPEECH_PROVIDER_ID)
    expect(speechStore.activeSpeechModel).toBe('auto')
    expect(visionStore.activeProvider).toBe('vision-official-provider')
    expect(visionStore.activeModel).toBe('auto')
    expect(providerConfigStore.providers['official-provider']?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_SPEECH_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers['vision-official-provider']?.status).toBe('configured')
  })

  // ROOT CAUSE:
  //
  // Authenticated setup only created an official provider record when its
  // module was empty or already used that provider. A custom module selection
  // therefore hid the official choice even while the user was signed in.
  //
  // We fixed this by configuring every standard official provider after login
  // while applying official module selections only to empty modules.
  it('configures official choices without replacing custom module selections', async () => {
    const consciousnessStore = useConsciousnessStore()
    const hearingStore = useHearingStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()
    const providerConfigStore = useProviderConfigStore()

    consciousnessStore.activeProvider = 'custom-chat'
    consciousnessStore.activeModel = 'custom-chat-model'
    hearingStore.activeTranscriptionProvider = 'custom-transcription'
    hearingStore.activeTranscriptionModel = 'custom-transcription-model'
    speechStore.activeSpeechProvider = 'custom-speech'
    speechStore.activeSpeechModel = 'custom-speech-model'
    visionStore.activeProvider = 'custom-vision'
    visionStore.activeModel = 'custom-vision-model'

    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(true)

    expect(consciousnessStore.activeProvider).toBe('custom-chat')
    expect(consciousnessStore.activeModel).toBe('custom-chat-model')
    expect(hearingStore.activeTranscriptionProvider).toBe('custom-transcription')
    expect(hearingStore.activeTranscriptionModel).toBe('custom-transcription-model')
    expect(speechStore.activeSpeechProvider).toBe('custom-speech')
    expect(speechStore.activeSpeechModel).toBe('custom-speech-model')
    expect(visionStore.activeProvider).toBe('custom-vision')
    expect(visionStore.activeModel).toBe('custom-vision-model')
    expect(providerConfigStore.providers['official-provider']?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_SPEECH_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers['vision-official-provider']?.status).toBe('configured')
  })

  // ROOT CAUSE:
  //
  // Official provider records and module selections survived logout. Module
  // pages therefore still treated official services as configured even though
  // the authenticated session that grants access no longer existed.
  //
  // We fixed this by unconfiguring official records on logout and clearing only
  // module selections that belong to those records. Custom selections remain.
  it('removes authenticated official configuration on logout', async () => {
    const consciousnessStore = useConsciousnessStore()
    const hearingStore = useHearingStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()
    const providerStore = useProviderStore()
    const providerConfigStore = useProviderConfigStore()

    await configureAsDefaultsIfEmpty()
    await providerStore.initializeProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
    await providerStore.forceProviderConfigured(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
    speechStore.activeSpeechProvider = OFFICIAL_SPEECH_STREAMING_PROVIDER_ID
    speechStore.activeSpeechModel = 'streaming-model'

    await expect(unconfigureAuthenticationProviders()).resolves.toBe(true)

    expect(consciousnessStore.activeProvider).toBe('')
    expect(consciousnessStore.activeModel).toBe('')
    expect(hearingStore.activeTranscriptionProvider).toBe('')
    expect(hearingStore.activeTranscriptionModel).toBe('')
    expect(speechStore.activeSpeechProvider).toBe('speech-noop')
    expect(speechStore.activeSpeechModel).toBe('')
    expect(speechStore.activeSpeechVoiceId).toBe('')
    expect(visionStore.activeProvider).toBe('')
    expect(visionStore.activeModel).toBe('')

    expect(providerConfigStore.providers['official-provider']?.status).toBe('unconfigured')
    expect(providerConfigStore.providers[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]?.status).toBe('unconfigured')
    expect(providerConfigStore.providers[OFFICIAL_SPEECH_PROVIDER_ID]?.status).toBe('unconfigured')
    expect(providerConfigStore.providers[OFFICIAL_SPEECH_STREAMING_PROVIDER_ID]?.status).toBe('unconfigured')
    expect(providerConfigStore.providers['vision-official-provider']?.status).toBe('unconfigured')
    expect(providerConfigStore.addedProviders['official-provider']).toBeUndefined()
    expect(providerConfigStore.addedProviders[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]).toBeUndefined()
    expect(providerConfigStore.addedProviders[OFFICIAL_SPEECH_PROVIDER_ID]).toBeUndefined()
    expect(providerConfigStore.addedProviders[OFFICIAL_SPEECH_STREAMING_PROVIDER_ID]).toBeUndefined()
    expect(providerConfigStore.addedProviders['vision-official-provider']).toBeUndefined()

    await expect(unconfigureAuthenticationProviders()).resolves.toBe(false)
    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(true)
    expect(providerConfigStore.providers['official-provider']?.status).toBe('configured')
  })

  it('keeps custom module selections when official providers are unconfigured', async () => {
    const consciousnessStore = useConsciousnessStore()
    const hearingStore = useHearingStore()
    const speechStore = useSpeechStore()
    const visionStore = useVisionStore()

    consciousnessStore.activeProvider = 'custom-chat'
    consciousnessStore.activeModel = 'custom-chat-model'
    hearingStore.activeTranscriptionProvider = 'custom-transcription'
    hearingStore.activeTranscriptionModel = 'custom-transcription-model'
    speechStore.activeSpeechProvider = 'speech-noop'
    speechStore.activeSpeechModel = ''
    visionStore.activeProvider = 'custom-vision'
    visionStore.activeModel = 'custom-vision-model'

    await expect(unconfigureAuthenticationProviders()).resolves.toBe(false)

    expect(consciousnessStore.activeProvider).toBe('custom-chat')
    expect(consciousnessStore.activeModel).toBe('custom-chat-model')
    expect(hearingStore.activeTranscriptionProvider).toBe('custom-transcription')
    expect(hearingStore.activeTranscriptionModel).toBe('custom-transcription-model')
    expect(speechStore.activeSpeechProvider).toBe('speech-noop')
    expect(speechStore.activeSpeechModel).toBe('')
    expect(visionStore.activeProvider).toBe('custom-vision')
    expect(visionStore.activeModel).toBe('custom-vision-model')
  })
})
