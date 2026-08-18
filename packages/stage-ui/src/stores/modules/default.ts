import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_TRANSCRIPTION_PROVIDER_ID } from '../../libs/providers/providers/official'
import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useConsciousnessStore } from './consciousness'
import { useHearingStore } from './hearing'
import { useSpeechStore } from './speech'
import { useVisionStore } from './vision'

// Vision provider instances use a category prefix but share the official chat definition.
const officialModuleDefaults = {
  consciousness: { provider: 'official-provider', model: 'auto' },
  hearing: { provider: OFFICIAL_TRANSCRIPTION_PROVIDER_ID, model: 'auto' },
  speech: { provider: OFFICIAL_SPEECH_PROVIDER_ID, model: 'auto' },
  vision: { provider: 'vision-official-provider', model: 'auto' },
} as const

/**
 * Applies official defaults to empty inference modules.
 *
 * The caller must own synchronized Pinia leadership. This command keeps the
 * configuration of each custom provider unchanged. It also repairs missing
 * provider records for modules that already use an official provider.
 * Provider setup completes before module selections become visible to other
 * windows.
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
  const managedOfficialProviders = new Set<string>()
  if (needsConsciousnessDefault || usesOfficialConsciousness)
    managedOfficialProviders.add(officialModuleDefaults.consciousness.provider)
  if (needsHearingDefault || usesOfficialHearing)
    managedOfficialProviders.add(officialModuleDefaults.hearing.provider)
  if (needsSpeechDefault || usesOfficialSpeech)
    managedOfficialProviders.add(officialModuleDefaults.speech.provider)
  if (needsVisionDefault || usesOfficialVision)
    managedOfficialProviders.add(officialModuleDefaults.vision.provider)

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
