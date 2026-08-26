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
  [Emotion.Angry]: EmotionAngryMotionName,
  [Emotion.Awkward]: EmotionAwkwardMotionName,
  [Emotion.Curious]: EmotionCuriousMotionName,
  [Emotion.Happy]: EmotionHappyMotionName,
  [Emotion.Neutral]: EmotionNeutralMotionName,
  [Emotion.Question]: EmotionQuestionMotionName,
  [Emotion.Sad]: EmotionSadMotionName,
  [Emotion.Surprise]: EmotionSurpriseMotionName,
  [Emotion.Think]: EmotionThinkMotionName,
}

export const EMOTION_VRMExpressionName_value = {
  [Emotion.Angry]: 'angry',
  [Emotion.Awkward]: 'neutral',
  [Emotion.Curious]: 'think',
  [Emotion.Happy]: 'happy',
  [Emotion.Neutral]: 'neutral',
  [Emotion.Question]: 'think',
  [Emotion.Sad]: 'sad',
  [Emotion.Surprise]: 'surprised',
  [Emotion.Think]: 'think',
} satisfies Record<Emotion, string | undefined>

export const EMOTION_SpineAnimationName_value = {
  [Emotion.Angry]: 'angry',
  [Emotion.Awkward]: 'awkward',
  [Emotion.Curious]: 'curious',
  [Emotion.Happy]: 'celebrate',
  [Emotion.Neutral]: 'idle',
  [Emotion.Question]: 'question',
  [Emotion.Sad]: 'sad',
  [Emotion.Surprise]: 'surprise',
  [Emotion.Think]: 'think',
} satisfies Record<Emotion, string>

export interface EmotionPayload {
  intensity: number
  name: Emotion
}
