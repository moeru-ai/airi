import { EMOTION_EmotionMotionName_value, EMOTION_VALUES } from '../emotions'

/** Runtime response rules shared by chat and autonomous reactions. */
export interface AiriRuntimeRuleSet {
  /** Stage-control instructions that drive the active emotion and action state. */
  emotion: string
  /** Output characters that cannot reach the speech pipeline safely. */
  emoji: string
}

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

/**
 * Formats the complete response rule set for one runtime message.
 *
 * @example
 * formatAiriRuntimeRuleSet({ emotion: 'Emit ACT.', emoji: 'Do not use emojis.' })
 * // => 'Emit ACT.\n\nDo not use emojis.'
 */
export function formatAiriRuntimeRuleSet(ruleSet: AiriRuntimeRuleSet) {
  return [ruleSet.emotion, ruleSet.emoji]
    .filter(rule => rule.trim().length > 0)
    .join('\n\n')
}
