import type { BilingualPair } from '../libs/bilingual/turn'

import { useBroadcastChannel } from '@vueuse/core'

/** One spoken sentence of a spark reaction, paired with its translation. */
export interface SparkTranslationEvent extends BilingualPair {
  /** Speech turn the pair belongs to, e.g. `spark:<event id>`. */
  turnId: string
}

/**
 * Carries a spark reaction's sentence pairs to the window that plays it.
 *
 * Use when:
 * - A reaction is split in the window that ran the model, while the speech
 *   pipeline — and the playback a caption follows — lives in another window.
 *
 * Returns:
 * - `post`, used by the window that splits the reaction, and `data`, observed by
 *   the window that plays it.
 */
export function useSparkTranslationChannel() {
  return useBroadcastChannel<SparkTranslationEvent, SparkTranslationEvent>({ name: 'airi-spark-translation' })
}
