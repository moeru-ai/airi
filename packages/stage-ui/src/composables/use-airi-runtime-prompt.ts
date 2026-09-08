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

/** Returns the localized emotion and emoji prompt for each model request. */
export function useAiriRuntimePrompt() {
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
    if (bilingual.enabled) {
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
