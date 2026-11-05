import type { StreamingControlEmotion } from '@proj-airi/pipelines-audio'

import type { ExpectedEmotion } from '../cases/emoticon-speech'

/**
 * Folds the differences that do not change what TTS reads. A test object can join TTS segments with a space or a line
 * break, and drop the space that an emoticon leaves. It can also write full-width punctuation as half-width, as `，`
 * and `,`, which NFKC folds.
 *
 * @example
 * normalizeSpoken('Aww  that\nsounds rough，ok')
 * // => 'Awwthatsoundsrough,ok'
 */
export function normalizeSpoken(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '')
}

/** 1 when the test object sends exactly the expected text to TTS: nothing of the emoticon is left, and no content is lost. */
export function gradeSpoken(expected: string, spoken: string): 0 | 1 {
  return normalizeSpoken(expected) === normalizeSpoken(spoken) ? 1 : 0
}

/**
 * 1 when the avatar gets the expected emotion. `none` accepts no emotion. `any` accepts every result.
 * A named emotion needs at least one emotion, and every emotion of the reply must be that one.
 */
export function gradeEmotion(expected: ExpectedEmotion, emotions: readonly StreamingControlEmotion[]): 0 | 1 {
  if (expected === 'any')
    return 1
  if (expected === 'none')
    return emotions.length === 0 ? 1 : 0
  return emotions.length > 0 && emotions.every(emotion => emotion === expected) ? 1 : 0
}
