import { isStageTamagotchi } from '@proj-airi/stage-shared'

import { useHearingStore } from './modules/hearing'
import { useProvidersStore } from './providers'

export const LESSON_FALLBACK_HEARING_PROVIDER_ID = 'browser-web-speech-api'
const LESSON_FALLBACK_HEARING_MODEL_ID = 'web-speech-api'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isLessonHearingFallbackSupported(): boolean {
  return typeof window !== 'undefined'
    && !isStageTamagotchi()
    && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
}

export async function ensureLessonHearingFallbackProvider(): Promise<boolean> {
  const hearingStore = useHearingStore()
  const providersStore = useProvidersStore()
  const activeProviderId = normalizeString(hearingStore.activeTranscriptionProvider)

  if (activeProviderId && activeProviderId !== LESSON_FALLBACK_HEARING_PROVIDER_ID) {
    return providersStore.providerRuntimeState[activeProviderId]?.isConfigured !== false
  }

  if (!isLessonHearingFallbackSupported()) {
    return false
  }

  providersStore.initializeProvider(LESSON_FALLBACK_HEARING_PROVIDER_ID)
  const configured = await providersStore.validateProvider(LESSON_FALLBACK_HEARING_PROVIDER_ID, { force: true })
  if (!configured) {
    return false
  }

  hearingStore.activeTranscriptionProvider = LESSON_FALLBACK_HEARING_PROVIDER_ID

  if (!normalizeString(hearingStore.activeTranscriptionModel)) {
    const models = await hearingStore.getModelsForProvider(LESSON_FALLBACK_HEARING_PROVIDER_ID)
    hearingStore.activeTranscriptionModel = models[0]?.id || LESSON_FALLBACK_HEARING_MODEL_ID
  }

  return Boolean(normalizeString(hearingStore.activeTranscriptionModel))
}
