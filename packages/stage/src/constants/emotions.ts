export const EMOTION_HAPPY = '<|EMOTE_HAPPY|>'
export const EMOTION_SAD = '<|EMOTE_SAD|>'
export const EMOTION_ANGRY = '<|EMOTE_ANGRY|>'
export const EMOTION_THINK = '<|EMOTE_THINK|>'
export const EMOTION_SURPRISE = '<|EMOTE_SURPRISE|>'
export const EMOTION_AWKWARD = '<|EMOTE_AWKWARD|>'

export enum Emotion {
  Happy = '<|EMOTE_HAPPY|>',
  Sad = '<|EMOTE_SAD|>',
  Angry = '<|EMOTE_ANGRY|>',
  Think = '<|EMOTE_THINK|>',
  Surprise = '<|EMOTE_SURPRISE|>',
  Awkward = '<|EMOTE_AWKWARD|>',
}

export const EMOTION_VALUES = Object.values(Emotion)

export const EmotionHappyMotionName = 'EmotionHappy'
export const EmotionSadMotionName = 'EmotionSad'
export const EmotionAngryMotionName = 'EmotionAngry'
export const EmotionAwkwardMotionName = 'EmotionAwkward'
export const EmotionThinkMotionName = 'EmotionThink'
export const EmotionSurpriseMotionName = 'EmotionSurprise'

export const EMOTION_EmotionMotionName_value = {
  [Emotion.Happy]: EmotionHappyMotionName,
  [Emotion.Sad]: EmotionSadMotionName,
  [Emotion.Angry]: EmotionAngryMotionName,
  [Emotion.Think]: EmotionThinkMotionName,
  [Emotion.Surprise]: EmotionSurpriseMotionName,
  [Emotion.Awkward]: EmotionAwkwardMotionName,
}