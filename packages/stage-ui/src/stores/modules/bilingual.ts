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
    const sub2Tag = sub2LangInfo.value.tag

    return `- Bilingual Subtitle Format Requirement:\n  You MUST structure your response into dual-language sections using language tags.\n  First, output the primary spoken content in ${ttsLangInfo.value.name} starting with tag ${ttsTag}.\n  Second, output the translated content in ${sub2LangInfo.value.name} starting with tag ${sub2Tag}.\n  Format example:\n  ${ttsTag} Hello, how are you today?\n  ${sub2Tag} 你好，今天过得怎么样？\n\n`
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
