import { BILINGUAL_LANGUAGES, getBilingualLanguage } from '@proj-airi/stage-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const BILINGUAL_TAG_TTS = '[TTS]'
export const BILINGUAL_TAG_SUB1 = '[SUB1]'
export const BILINGUAL_TAG_SUB2 = '[SUB2]'
export const BILINGUAL_KNOWN_TAGS = [BILINGUAL_TAG_TTS, BILINGUAL_TAG_SUB1, BILINGUAL_TAG_SUB2]

export const useBilingualStore = defineStore('bilingual', () => {
  const enabled = useLocalStorageManualReset<boolean>('settings-bilingual-enabled', false)
  const ttsLanguage = useLocalStorageManualReset<string>('settings-bilingual-tts-lang', 'en')
  const subtitleLanguage1 = useLocalStorageManualReset<string>('settings-bilingual-sub1-lang', 'en')
  const subtitleLanguage2 = useLocalStorageManualReset<string>('settings-bilingual-sub2-lang', 'zh')

  const ttsLangInfo = computed(() => getBilingualLanguage(ttsLanguage.value) ?? BILINGUAL_LANGUAGES[0])
  const sub1LangInfo = computed(() => getBilingualLanguage(subtitleLanguage1.value) ?? BILINGUAL_LANGUAGES[0])
  const sub2LangInfo = computed(() => getBilingualLanguage(subtitleLanguage2.value) ?? BILINGUAL_LANGUAGES[1])

  const systemPromptInstruction = computed(() => {
    if (!enabled.value)
      return ''

    const sections = [
      `${BILINGUAL_TAG_TTS} <spoken content in ${ttsLangInfo.value.name}>`,
      `${BILINGUAL_TAG_SUB1} <subtitle 1 in ${sub1LangInfo.value.name}>`,
      `${BILINGUAL_TAG_SUB2} <subtitle 2 in ${sub2LangInfo.value.name}>`,
    ]

    return `- Bilingual Subtitle Format Requirement:\n  You MUST structure your response into role-tagged sections using exactly these tags in this order:\n${sections.join('\n')}\n  Do NOT omit any of the above tags. Each tag must appear at the beginning of its own line.\n\n`
  })

  return {
    enabled,
    ttsLanguage,
    subtitleLanguage1,
    subtitleLanguage2,
    ttsLangInfo,
    sub1LangInfo,
    sub2LangInfo,
    systemPromptInstruction,
    availableLanguages: computed(() => BILINGUAL_LANGUAGES),
  }
})
