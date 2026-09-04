import { EMOTION_EmotionMotionName_value, EMOTION_VALUES } from '../emotions'

/**
 * Formats stage control-token instructions as one runtime emotion rule set.
 */
export function createEmotionRuleSet(instructions: string, actionRules: string) {
  return [
    instructions,
    EMOTION_VALUES
      .map(emotion => `- ${emotion} (Emotion for feeling ${EMOTION_EmotionMotionName_value[emotion]})`)
      .join('\n'),
    actionRules,
  ].join('\n\n')
}
