import { BILINGUAL_LANGUAGES, getBilingualLanguage } from '@proj-airi/stage-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

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

    const ttsTag = ttsLangInfo.value.tag
    const sub1Tag = sub1LangInfo.value.tag
    const sub2Tag = sub2LangInfo.value.tag

    // When TTS language matches Subtitle 1, only two sections are needed.
    const sections = ttsTag === sub1Tag
      ? [
          `${sub1Tag} <content in ${sub1LangInfo.value.name}>`,
          `${sub2Tag} <translation in ${sub2LangInfo.value.name}>`,
        ]
      : [
          `${ttsTag} <spoken content in ${ttsLangInfo.value.name}>`,
          `${sub1Tag} <content in ${sub1LangInfo.value.name}>`,
          `${sub2Tag} <translation in ${sub2LangInfo.value.name}>`,
        ]

    return `- Bilingual Subtitle Format Requirement:\n  You MUST structure your response into language-tagged sections.\n  Use exactly these tags in this order:\n${sections.map(s => `  ${s}`).join('\n')}\n  Do NOT omit any of the above tags. Each tag must appear on its own line.\n\n`
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
