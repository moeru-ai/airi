import messages from '@proj-airi/i18n/locales'
import workerURL from '@sherpaw/xsai-transcription/worker?worker&url'

import { resolveSupportedLocale } from '@proj-airi/i18n'
import { createSherpawTranscriptionDefinition } from '@proj-airi/provider-inference'
import { isStageCapacitor } from '@proj-airi/stage-shared'

import { fetchCachedModel } from '../../../inference/cache-utils'
import { defineProvider } from '../registry'
import { sherpawModelResources } from './model-resources'

export { executeSherpawStream, SHERPAW_TRANSCRIPTION_PROVIDER_ID } from '@proj-airi/provider-inference'

function getInterfaceLanguage(): string {
  const language = globalThis.localStorage?.getItem('settings/language') || globalThis.navigator?.language || 'en'
  return resolveSupportedLocale(language, Object.keys(messages))
}

function isMobile(): boolean {
  return isStageCapacitor() || (globalThis.matchMedia?.('(max-width: 767px)').matches ?? false)
}

export const providerSherpawTranscription = defineProvider({
  ...createSherpawTranscriptionDefinition({
    models: sherpawModelResources,
    workerURL,
    fetchModel: fetchCachedModel,
    getInterfaceLanguage,
    isMobile,
  }),
  views: {
    hearing: () => import('./hearing-settings.vue'),
  },
})
