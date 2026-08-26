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
  Angry: 'angry',
  Awkward: 'awkward',
  Curious: 'curious',
  Happy: 'celebrate',
  Idle: 'idle',
  Neutral: 'idle',
  Question: 'question',
  Sad: 'sad',
  Surprise: 'surprise',
  Think: 'think',
} as const

export type SpineAnimationKey = keyof typeof SpineAnimationName

/**
 * Maps an AIRI emotion to a canonical Spine animation name.
 *
 * The actual track name played at runtime falls back to whichever name
 * exists on the loaded skeleton — see useSpineAnimationManager().
 */
export const EMOTION_SpineAnimationName_value: Record<Emotion, string> = {
  [Emotion.Angry]: SpineAnimationName.Angry,
  [Emotion.Awkward]: SpineAnimationName.Awkward,
  [Emotion.Curious]: SpineAnimationName.Curious,
  [Emotion.Happy]: SpineAnimationName.Happy,
  [Emotion.Neutral]: SpineAnimationName.Neutral,
  [Emotion.Question]: SpineAnimationName.Question,
  [Emotion.Sad]: SpineAnimationName.Sad,
  [Emotion.Surprise]: SpineAnimationName.Surprise,
  [Emotion.Think]: SpineAnimationName.Think,
}
