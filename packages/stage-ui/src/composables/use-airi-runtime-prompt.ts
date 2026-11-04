import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { EMOTION_EmotionMotionName_value, EMOTION_VALUES } from '../constants/emotions'
import { useStageMotionCatalogStore } from '../stores/stage-motion-catalog'

const RUNTIME_PROMPT_KEYS = [
  'base.prompt.emotion',
  'base.prompt.emoji',
  'base.prompt.suffix',
]

/**
 * Returns the localized emotion and emoji prompt for each model request.
 * When the stage can play motions, the prompt also lists them for the ACT `motion` field.
 */
export function useAiriRuntimePrompt() {
  const { locale, t, te } = useI18n()
  const motionCatalog = useStageMotionCatalogStore()

  return computed(() => {
    if (!RUNTIME_PROMPT_KEYS.every(key => te(key, locale.value)))
      return ''

    const motions = motionCatalog.motions.length > 0
      ? [t('base.prompt.motions'), motionCatalog.motions.map(motion => `- ${motion.id} (${motion.description})`).join('\n')]
      : []

    return [
      t('base.prompt.emotion'),
      EMOTION_VALUES
        .map(emotion => `- ${emotion} (Emotion for feeling ${EMOTION_EmotionMotionName_value[emotion]})`)
        .join('\n'),
      ...motions,
      t('base.prompt.suffix'),
      t('base.prompt.emoji'),
    ].join('\n\n')
  })
}
