import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { EMOTION_EmotionMotionName_value, EMOTION_VALUES } from '../constants/emotions'
import { buildBilingualPrompt } from '../libs/bilingual/prompt'
import { useSettingsBilingual } from '../stores/settings/bilingual'

const RUNTIME_PROMPT_KEYS = [
  'base.prompt.emotion',
  'base.prompt.emoji',
  'base.prompt.suffix',
]

export interface UseAiriRuntimePromptOptions {
  /**
   * Append the opt-in bilingual subtitle instruction.
   *
   * Only consumers that split the tagged output may opt in. The captioned chat
   * and spark reactions both run it through the bilingual parser before the
   * text is spoken or stored, so the `[EN]`/`[CN]` control tags never survive.
   * Any other consumer would keep those tags in text nothing ever parses.
   *
   * @default false
   */
  bilingual?: boolean
}

/** Returns the localized emotion and emoji prompt for each model request. */
export function useAiriRuntimePrompt(options: UseAiriRuntimePromptOptions = {}) {
  const { locale, t, te } = useI18n()
  const bilingual = useSettingsBilingual()

  return computed(() => {
    const sections: string[] = []

    // Only locales that ship the split keys get the emotion and emoji prompt.
    // Locales still on the combined prompt keep using their own copy.
    if (RUNTIME_PROMPT_KEYS.every(key => te(key, locale.value))) {
      sections.push(
        t('base.prompt.emotion'),
        EMOTION_VALUES
          .map(emotion => `- ${emotion} (Emotion for feeling ${EMOTION_EmotionMotionName_value[emotion]})`)
          .join('\n'),
        t('base.prompt.suffix'),
        t('base.prompt.emoji'),
      )
    }

    // Bilingual output is opt-in and deliberately independent of the emotion
    // prompt: several locales have no `base.prompt.emotion` key, and gating on
    // it would silently drop the instruction for them. Appended last so the
    // model reads the emotion rules before the formatting rules.
    if (options.bilingual && bilingual.enabled) {
      const bilingualPrompt = buildBilingualPrompt({
        ttsLanguage: bilingual.ttsLanguage,
        subtitleLanguages: bilingual.subtitleLanguages,
      })

      if (bilingualPrompt)
        sections.push(bilingualPrompt)
    }

    return sections.join('\n\n')
  })
}
