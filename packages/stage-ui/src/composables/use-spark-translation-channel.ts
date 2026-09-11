import type { BilingualPair } from '../libs/bilingual/turn'

import { useBroadcastChannel } from '@vueuse/core'

/** One spoken sentence of a spark reaction, paired with its translation. */
interface SparkPairEvent extends BilingualPair {
  /** Discriminator, so a reaction's start travels the same channel. */
  kind: 'pair'
  /** Speech turn the pair belongs to, e.g. `spark:<event id>`. */
  turnId: string
}

/** A spark reaction that is about to be produced, and the language it speaks. */
interface SparkTurnEvent {
  kind: 'turn'
  /** Speech turn the reaction will play as, e.g. `spark:<event id>`. */
  turnId: string
  /**
   * Language the reaction is spoken in, chosen when its request was composed.
   *
   * `undefined` for a reaction requested without bilingual: it is monolingual,
   * so its playback keeps the configured voice rather than one picked for a
   * language the request never asked for.
   */
  ttsLanguage?: string
}

/**
 * A spark turn that is over.
 *
 * Sent for every announced turn, including one whose reaction ended without
 * speaking: the window that plays reactions reserves state per turn, and a turn
 * with nothing to play would otherwise be reserved for the life of the session.
 * A turn that did speak keeps its reservation until playback moves on, which is
 * what the receiving side decides on.
 */
interface SparkTurnEndEvent {
  kind: 'turn-end'
  /** Speech turn that ended, e.g. `spark:<event id>`. */
  turnId: string
}

export type SparkTranslationEvent = SparkPairEvent | SparkTurnEvent | SparkTurnEndEvent

/**
 * Carries a spark reaction to the window that plays it.
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
