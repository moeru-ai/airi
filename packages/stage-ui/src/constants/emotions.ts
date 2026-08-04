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

export const EmotionHappyMotionName = 'Happy'
export const EmotionSadMotionName = 'Sad'
export const EmotionAngryMotionName = 'Angry'
export const EmotionAwkwardMotionName = 'Awkward'
export const EmotionThinkMotionName = 'Think'
export const EmotionSurpriseMotionName = 'Surprise'
export const EmotionQuestionMotionName = 'Question'
export const EmotionNeutralMotionName = 'Idle'
export const EmotionCuriousMotionName = 'Curious'

export const EMOTION_EmotionMotionName_value = {
  [Emotion.Happy]: EmotionHappyMotionName,
  [Emotion.Sad]: EmotionSadMotionName,
  [Emotion.Angry]: EmotionAngryMotionName,
  [Emotion.Think]: EmotionThinkMotionName,
  [Emotion.Surprise]: EmotionSurpriseMotionName,
  [Emotion.Awkward]: EmotionAwkwardMotionName,
  [Emotion.Question]: EmotionQuestionMotionName,
  [Emotion.Neutral]: EmotionNeutralMotionName,
  [Emotion.Curious]: EmotionCuriousMotionName,
}

export const EMOTION_VRMExpressionName_value = {
  [Emotion.Happy]: 'happy',
  [Emotion.Sad]: 'sad',
  [Emotion.Angry]: 'angry',
  [Emotion.Think]: 'think',
  [Emotion.Surprise]: 'surprised',
  [Emotion.Awkward]: 'neutral',
  [Emotion.Question]: 'think',
  [Emotion.Neutral]: 'neutral',
  [Emotion.Curious]: 'think',
} satisfies Record<Emotion, string | undefined>

export const EMOTION_SpineAnimationName_value = {
  [Emotion.Happy]: 'celebrate',
  [Emotion.Sad]: 'sad',
  [Emotion.Angry]: 'angry',
  [Emotion.Think]: 'think',
  [Emotion.Surprise]: 'surprise',
  [Emotion.Awkward]: 'awkward',
  [Emotion.Question]: 'question',
  [Emotion.Neutral]: 'idle',
  [Emotion.Curious]: 'curious',
} satisfies Record<Emotion, string>

export interface EmotionPayload {
  name: Emotion
  intensity: number
}

/**
 * A point in the valence-arousal-dominance space, each axis in `[-1, 1]`.
 *
 * Valence is how pleasant the state is, arousal how activated, and dominance
 * how in-control. Dominance is what separates otherwise similar states: anger
 * and anxiety share negative valence and high arousal, and only dominance
 * tells them apart.
 */
export interface VADVector {
  valence: number
  arousal: number
  dominance: number
}

/**
 * Where each discrete emotion sits in continuous space.
 *
 * The enum stays the wire format between the model and the app; this table is
 * only the entry point into the continuous layer, so a consumer that reads VAD
 * and one that reads the enum never disagree about what the character feels.
 *
 * Values are authored, not derived: they place each emotion relative to the
 * others rather than claiming any absolute scale.
 */
export const EMOTION_VAD_value = {
  [Emotion.Happy]: { valence: 0.72, arousal: 0.45, dominance: 0.35 },
  [Emotion.Sad]: { valence: -0.65, arousal: -0.35, dominance: -0.42 },
  // High dominance is what keeps anger distinguishable from anxiety, which
  // shares its negative valence and high arousal.
  [Emotion.Angry]: { valence: -0.70, arousal: 0.75, dominance: 0.55 },
  [Emotion.Think]: { valence: 0.05, arousal: -0.20, dominance: 0.15 },
  [Emotion.Surprise]: { valence: 0.18, arousal: 0.85, dominance: -0.15 },
  // Negative valence with *low* dominance — the withdrawing kind of unpleasant,
  // as opposed to anger's assertive kind.
  [Emotion.Awkward]: { valence: -0.35, arousal: 0.30, dominance: -0.50 },
  [Emotion.Question]: { valence: 0.05, arousal: 0.25, dominance: -0.10 },
  [Emotion.Curious]: { valence: 0.40, arousal: 0.42, dominance: 0.12 },
  [Emotion.Neutral]: { valence: 0, arousal: 0, dominance: 0 },
} satisfies Record<Emotion, VADVector>
