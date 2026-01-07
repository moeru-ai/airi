export const EMOTION_HAPPY = '<|EMOTE_HAPPY|>'
export const EMOTION_SAD = '<|EMOTE_SAD|>'
export const EMOTION_ANGRY = '<|EMOTE_ANGRY|>'
export const EMOTION_THINK = '<|EMOTE_THINK|>'
export const EMOTION_SURPRISE = '<|EMOTE_SURPRISED|>'
export const EMOTION_AWKWARD = '<|EMOTE_AWKWARD|>'
export const EMOTION_QUESTION = '<|EMOTE_QUESTION|>'
export const EMOTION_CURIOUS = '<|EMOTE_CURIOUS|>'

export enum Emotion {
  Idle = '<|EMOTE_NEUTRAL|>',
  Happy = '<|EMOTE_HAPPY|>',
  Sad = '<|EMOTE_SAD|>',
  Angry = '<|EMOTE_ANGRY|>',
  Think = '<|EMOTE_THINK|>',
  Surprise = '<|EMOTE_SURPRISED|>',
  Awkward = '<|EMOTE_AWKWARD|>',
  Question = '<|EMOTE_QUESTION|>',
  Curious = '<|EMOTE_CURIOUS|>',
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
  [Emotion.Idle]: EmotionNeutralMotionName,
  [Emotion.Curious]: EmotionCuriousMotionName,
}

export const EMOTION_VRMExpressionName_value = {
  [Emotion.Happy]: 'happy',
  [Emotion.Sad]: 'sad',
  [Emotion.Angry]: 'angry',
  [Emotion.Think]: undefined,
  [Emotion.Surprise]: 'surprised',
  [Emotion.Awkward]: undefined,
  [Emotion.Question]: undefined,
  [Emotion.Idle]: undefined,
  [Emotion.Curious]: 'surprised',
} satisfies Record<Emotion, string | undefined>
