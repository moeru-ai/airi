import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

/**
 * Bilingual subtitle configuration.
 *
 * The spoken language doubles as the main subtitle line, because the overlay
 * derives that line from speech playback. The only extra choice is the
 * translation shown underneath it.
 *
 * The feature is off by default. While it is off, the existing speech and
 * subtitle flow stays untouched.
 */
export const useSettingsBilingual = defineStore('settings-bilingual', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings/bilingual/enabled', false)
  const ttsLanguage = useLocalStorageManualReset<string>('settings/bilingual/tts-language', 'en')
  const translationLanguage = useLocalStorageManualReset<string>('settings/bilingual/translation-language', 'zh')

  /**
   * Languages the model is asked to emit, in the order the overlay shows them:
   * the spoken language first, then the translation.
   *
   * A translation set to `BILINGUAL_NONE` resolves away in the prompt builder
   * and the parser, leaving single-language output. Picking the spoken language
   * as the translation collapses to one entry instead of duplicating it.
   */
  const subtitleLanguages = computed<string[]>(() =>
    [...new Set([ttsLanguage.value, translationLanguage.value])],
  )

  function resetState() {
    enabled.reset()
    ttsLanguage.reset()
    translationLanguage.reset()
  }

  return {
    enabled,
    ttsLanguage,
    translationLanguage,
    subtitleLanguages,
    resetState,
  }
})
