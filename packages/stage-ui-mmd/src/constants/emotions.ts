/**
 * AIRI emotion vocabulary shared across renderers.
 *
 * Kept identical to the Live2D/Spine enums so the act-event bus in
 * `Stage.vue` can drive any renderer with the same emotion names.
 */
export enum Emotion {
  Happy = 'happy',
  Sad = 'sad',
  Angry = 'angry',
  Think = 'think',
  Surprise = 'surprised',
  Awkward = 'awkward',
  Question = 'question',
  Curious = 'curious',
  Neutral = 'neutral',
}

export const EMOTION_VALUES = Object.values(Emotion)
