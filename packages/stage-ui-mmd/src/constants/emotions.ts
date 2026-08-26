/**
 * AIRI emotion vocabulary shared across renderers.
 *
 * Kept identical to the Live2D/Spine enums so the act-event bus in
 * `Stage.vue` can drive any renderer with the same emotion names.
 */
export enum Emotion {
  Angry = 'angry',
  Awkward = 'awkward',
  Curious = 'curious',
  Happy = 'happy',
  Neutral = 'neutral',
  Question = 'question',
  Sad = 'sad',
  Surprise = 'surprised',
  Think = 'think',
}

export const EMOTION_VALUES = Object.values(Emotion)
