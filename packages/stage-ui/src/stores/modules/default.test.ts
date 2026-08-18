import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_TRANSCRIPTION_PROVIDER_ID } from '../../libs/providers/providers/official'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useConsciousnessStore } from './consciousness'
import { configureAsDefaultsIfEmpty } from './default'
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
    expect(providerConfigStore.providers[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_SPEECH_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers['vision-official-provider']?.status).toBe('configured')
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
    expect(providerConfigStore.providers[OFFICIAL_SPEECH_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.addedProviders[OFFICIAL_SPEECH_PROVIDER_ID]).toBe(true)
    expect(providerConfigStore.providers['official-provider']).toBeUndefined()
    expect(providerConfigStore.providers[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]).toBeUndefined()
    expect(providerConfigStore.providers['vision-official-provider']).toBeUndefined()
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
    expect(forceProviderConfigured).toHaveBeenCalledOnce()

    await expect(configureAsDefaultsIfEmpty()).resolves.toBe(false)
    expect(forceProviderConfigured).toHaveBeenCalledOnce()
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
    expect(providerConfigStore.providers['official-provider']).toBeUndefined()
    expect(providerConfigStore.providers[OFFICIAL_TRANSCRIPTION_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers[OFFICIAL_SPEECH_PROVIDER_ID]?.status).toBe('configured')
    expect(providerConfigStore.providers['vision-official-provider']?.status).toBe('configured')
  })
})
