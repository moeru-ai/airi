import { OFFICIAL_CHAT_PROVIDER_ID, OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_TRANSCRIPTION_PROVIDER_ID, OFFICIAL_VISION_PROVIDER_ID } from '../../libs/providers/providers/official'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useConsciousnessStore } from './consciousness'
import { useHearingStore } from './hearing'
import { useSpeechStore } from './speech'
import { useVisionStore } from './vision'

// Vision provider instances use a category prefix but share the official chat definition.
const officialModuleDefaults = {
  consciousness: { provider: OFFICIAL_CHAT_PROVIDER_ID, model: 'auto' },
  hearing: { provider: OFFICIAL_TRANSCRIPTION_PROVIDER_ID, model: 'auto' },
  speech: { provider: OFFICIAL_SPEECH_PROVIDER_ID, model: 'auto' },
  vision: { provider: OFFICIAL_VISION_PROVIDER_ID, model: 'auto' },
} as const

/**
 * Applies official defaults to empty inference modules.
 *
 * The caller must own synchronized Pinia leadership. This command keeps the
 * configuration of each custom provider unchanged. It configures the official
 * choice for every module, then applies it only to empty or incomplete
 * official selections. Provider setup completes before module selections
 * become visible to other windows.
 *
 * @returns `true` when the command changes module or provider state.
 */
export async function configureAsDefaultsIfEmpty(): Promise<boolean> {
  const consciousnessStore = useConsciousnessStore()
  const hearingStore = useHearingStore()
  const speechStore = useSpeechStore()
  const visionStore = useVisionStore()

  const needsConsciousnessDefault = !consciousnessStore.activeProvider
  const usesOfficialConsciousness = consciousnessStore.activeProvider === officialModuleDefaults.consciousness.provider
  const needsHearingDefault = !hearingStore.activeTranscriptionProvider
  const usesOfficialHearing = hearingStore.activeTranscriptionProvider === officialModuleDefaults.hearing.provider
  const needsSpeechDefault = !speechStore.activeSpeechProvider || speechStore.activeSpeechProvider === 'speech-noop'
  const usesOfficialSpeech = speechStore.activeSpeechProvider === officialModuleDefaults.speech.provider
  const needsVisionDefault = !visionStore.activeProvider
  const usesOfficialVision = visionStore.activeProvider === officialModuleDefaults.vision.provider

  const providerStore = useProviderStore()
  const providerConfigStore = useProviderConfigStore()
  const managedOfficialProviders = new Set<string>(Object.values(officialModuleDefaults).map(module => module.provider))

  let changed = false
  for (const provider of managedOfficialProviders) {
    if (providerConfigStore.configuredProviders[provider] && providerConfigStore.addedProviders[provider])
      continue

    await providerStore.initializeProvider(provider)
    await providerStore.forceProviderConfigured(provider)
    changed = true
  }

  if (needsConsciousnessDefault) {
    consciousnessStore.customModelName = ''
    consciousnessStore.activeProvider = officialModuleDefaults.consciousness.provider
    consciousnessStore.activeModel = officialModuleDefaults.consciousness.model
    changed = true
  }
  else if (usesOfficialConsciousness && !consciousnessStore.activeModel) {
    consciousnessStore.customModelName = ''
    consciousnessStore.activeModel = officialModuleDefaults.consciousness.model
    changed = true
  }

  if (needsHearingDefault) {
    hearingStore.activeCustomModelName = ''
    hearingStore.activeTranscriptionProvider = officialModuleDefaults.hearing.provider
    hearingStore.activeTranscriptionModel = officialModuleDefaults.hearing.model
    changed = true
  }
  else if (usesOfficialHearing && !hearingStore.activeTranscriptionModel) {
    hearingStore.activeCustomModelName = ''
    hearingStore.activeTranscriptionModel = officialModuleDefaults.hearing.model
    changed = true
  }

  if (needsSpeechDefault) {
    speechStore.activeSpeechVoiceId = ''
    speechStore.activeSpeechProvider = officialModuleDefaults.speech.provider
    speechStore.activeSpeechModel = officialModuleDefaults.speech.model
    changed = true
  }
  else if (usesOfficialSpeech && !speechStore.activeSpeechModel) {
    speechStore.activeSpeechVoiceId = ''
    speechStore.activeSpeechModel = officialModuleDefaults.speech.model
    changed = true
  }

  if (needsVisionDefault) {
    visionStore.customModelName = ''
    visionStore.activeProvider = officialModuleDefaults.vision.provider
    visionStore.activeModel = officialModuleDefaults.vision.model
    changed = true
  }
  else if (usesOfficialVision && !visionStore.activeModel) {
    visionStore.customModelName = ''
    visionStore.activeModel = officialModuleDefaults.vision.model
    changed = true
  }

  return changed
}

/**
 * Removes provider state that is valid only during an authenticated session.
 *
 * The caller must own synchronized Pinia leadership. Custom module selections
 * remain unchanged. An official speech selection falls back to No Speech so
 * the speech pipeline keeps its account-free disabled state after logout.
 *
 * @returns `true` when the command changes module or provider state.
 */
export async function unconfigureAuthenticationProviders(): Promise<boolean> {
  const consciousnessStore = useConsciousnessStore()
  const hearingStore = useHearingStore()
  const speechStore = useSpeechStore()
  const visionStore = useVisionStore()
  const providerStore = useProviderStore()
  const providerConfigStore = useProviderConfigStore()
  let changed = false

  if (providerConfigStore.providers[consciousnessStore.activeProvider]?.configuredBy === 'authentication') {
    consciousnessStore.activeProvider = ''
    consciousnessStore.activeModel = ''
    consciousnessStore.customModelName = ''
    changed = true
  }

  if (providerConfigStore.providers[hearingStore.activeTranscriptionProvider]?.configuredBy === 'authentication') {
    hearingStore.activeTranscriptionProvider = ''
    hearingStore.activeTranscriptionModel = ''
    hearingStore.activeCustomModelName = ''
    changed = true
  }

  if (providerConfigStore.providers[speechStore.activeSpeechProvider]?.configuredBy === 'authentication') {
    speechStore.activeSpeechProvider = 'speech-noop'
    speechStore.activeSpeechModel = ''
    speechStore.activeSpeechVoiceId = ''
    speechStore.activeSpeechVoice = undefined
    changed = true
  }

  if (providerConfigStore.providers[visionStore.activeProvider]?.configuredBy === 'authentication') {
    visionStore.activeProvider = ''
    visionStore.activeModel = ''
    visionStore.customModelName = ''
    changed = true
  }

  for (const [providerId, provider] of Object.entries(providerConfigStore.providers)) {
    if (provider.configuredBy !== 'authentication')
      continue

    const isPersistedAsAdded = providerConfigStore.addedProviders[providerId]
    if (provider.status === 'unconfigured' && !isPersistedAsAdded)
      continue

    await providerStore.setProviderUnconfigured(providerId)
    changed = true
  }

  return changed
}
