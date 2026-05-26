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

/**
 * Default Spine animation track used for the persistent idle/state loop.
 */
export const SPINE_IDLE_TRACK = 0

/**
 * Default Spine animation track used for one-shot emotion overrides.
 *
 * Higher track index renders on top of the idle track, mirroring how the
 * Spine player layers shoot/celebrate animations over the idle skeleton.
 */
export const SPINE_EMOTION_TRACK = 1

/**
 * Common Spine animation names that AIRI maps incoming emotions to.
 *
 * These names follow the Esoteric Software example conventions
 * (idle/walk/run/jump/shoot/death/celebrate). Models that ship custom
 * names can override the mapping at runtime through the settings panel.
 */
export const SpineAnimationName = {
  Idle: 'idle',
  Happy: 'celebrate',
  Sad: 'sad',
  Angry: 'angry',
  Awkward: 'awkward',
  Think: 'think',
  Surprise: 'surprise',
  Question: 'question',
  Curious: 'curious',
  Neutral: 'idle',
} as const

export type SpineAnimationKey = keyof typeof SpineAnimationName

/**
 * Maps an AIRI emotion to a canonical Spine animation name.
 *
 * The actual track name played at runtime falls back to whichever name
 * exists on the loaded skeleton — see useSpineAnimationManager().
 */
export const EMOTION_SpineAnimationName_value: Record<Emotion, string> = {
  [Emotion.Happy]: SpineAnimationName.Happy,
  [Emotion.Sad]: SpineAnimationName.Sad,
  [Emotion.Angry]: SpineAnimationName.Angry,
  [Emotion.Think]: SpineAnimationName.Think,
  [Emotion.Surprise]: SpineAnimationName.Surprise,
  [Emotion.Awkward]: SpineAnimationName.Awkward,
  [Emotion.Question]: SpineAnimationName.Question,
  [Emotion.Neutral]: SpineAnimationName.Neutral,
  [Emotion.Curious]: SpineAnimationName.Curious,
}
