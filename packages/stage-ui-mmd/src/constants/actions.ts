import { Emotion } from './emotions'

/**
 * Optional emotion → motion-name mapping for gesture playback.
 *
 * Expressions (morphs) are always applied for an emotion; on top of that, if
 * the loaded model has a registered VMD motion under one of these names, the
 * scene also plays it as a one-shot gesture. Models rarely ship motions named
 * exactly like this, so the animation manager treats a missing name as a
 * no-op and the user can remap names from the settings panel.
 */
export const EMOTION_ACTION_NAME: Record<Emotion, string> = {
  [Emotion.Happy]: 'happy',
  [Emotion.Sad]: 'sad',
  [Emotion.Angry]: 'angry',
  [Emotion.Think]: 'think',
  [Emotion.Surprise]: 'surprise',
  [Emotion.Awkward]: 'awkward',
  [Emotion.Question]: 'question',
  [Emotion.Curious]: 'curious',
  [Emotion.Neutral]: 'idle',
}

/** Conventional name AIRI uses for the persistent looping idle motion. */
export const IDLE_ACTION_NAME = 'idle'
