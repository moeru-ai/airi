import { Emotion } from './emotions'

/**
 * Standard Live2D sample-model expression group naming convention.
 *
 * Many Live2D sample models (hiyori, mao, etc.) ship with expression
 * groups named `exp_01` through `exp_08` in `model3.json`.  This table
 * maps each Emotion to the convention-aware group name.
 *
 * Limitations:
 * - `exp_02` (eyes smile) has no Emotion counterpart — left unmapped.
 * - `exp_03` has all-zero parameters — Think / Question produce no visual.
 * - `exp_07` is shared by Surprise and Curious.
 */
export const STANDARD_EXP_CONVENTION: Partial<Record<Emotion, string>> = {
  [Emotion.Happy]: 'exp_04',
  [Emotion.Sad]: 'exp_05',
  [Emotion.Angry]: 'exp_06',
  [Emotion.Think]: 'exp_03',
  [Emotion.Surprise]: 'exp_07',
  [Emotion.Awkward]: 'exp_08',
  [Emotion.Question]: 'exp_03',
  [Emotion.Neutral]: 'exp_01',
  [Emotion.Curious]: 'exp_07',
}

/**
 * Per-model overrides for models that deviate from the standard convention.
 *
 * Key:   `stageModelSelected` value from the settings store.
 * Value: partial {@link Emotion} → expression group name map.
 *        Omitted Emotions fall back to {@link STANDARD_EXP_CONVENTION}.
 *
 * @example
 * ```ts
 * 'my-custom-model': {
 *   [Emotion.Happy]: 'smile1',
 *   [Emotion.Sad]:   'tear',
 * }
 * ```
 */
export const EMOTION_EXPRESSION_MAPPINGS: Record<string, Partial<Record<Emotion, string>>> = {
}
