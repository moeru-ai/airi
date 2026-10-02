import type { SpeechPipelineEvents } from '@proj-airi/pipelines-audio'

/** The pipeline events that delivery tracking reads. */
export interface SpeechDeliverySource {
  on: <K extends 'onPlaybackStart' | 'onPlaybackEnd' | 'onPlaybackInterrupt' | 'onPlaybackReject' | 'onTurnEnd' | 'onTurnCancel'>(event: K, listener: SpeechPipelineEvents<unknown>[K]) => () => void
}

/** Finished turns kept to ignore late playback events. */
const FINISHED_TURN_LIMIT = 64

/**
 * Tracks which speech segments of each turn reached the listener.
 *
 * Use when:
 * - History must record what was said, not only what was generated.
 *
 * Expects:
 * - Segment playback events carry the chat turn id.
 *
 * Returns:
 * - A stop function. `onInterrupted` receives the delivered text of a turn whose playback stopped early.
 *   A turn that played nothing, for example while speech is muted, reports nothing. A partly played segment counts as not delivered.
 */
export function trackSpeechDelivery(pipeline: SpeechDeliverySource, onInterrupted: (turnId: string, deliveredSpeech: string) => void) {
  const turns = new Map<string, { played: boolean, delivered: string[], interrupted: boolean }>()
  const finished: string[] = []

  function turn(turnId: string | undefined) {
    if (!turnId || finished.includes(turnId))
      return undefined
    let entry = turns.get(turnId)
    if (!entry) {
      entry = { played: false, delivered: [], interrupted: false }
      turns.set(turnId, entry)
    }
    return entry
  }

  function finish(turnId: string) {
    const entry = turns.get(turnId)
    turns.delete(turnId)
    finished.push(turnId)
    if (finished.length > FINISHED_TURN_LIMIT)
      finished.shift()
    if (entry?.played && entry.interrupted)
      onInterrupted(turnId, entry.delivered.join(''))
  }

  const stops = [
    pipeline.on('onPlaybackStart', ({ item }) => {
      const entry = turn(item.turnId)
      if (entry)
        entry.played = true
    }),
    pipeline.on('onPlaybackEnd', ({ item }) => {
      turn(item.turnId)?.delivered.push(item.text)
    }),
    pipeline.on('onPlaybackInterrupt', ({ item }) => {
      const entry = turn(item.turnId)
      if (entry)
        entry.interrupted = true
    }),
    pipeline.on('onPlaybackReject', ({ item }) => {
      const entry = turn(item.turnId)
      if (entry)
        entry.interrupted = true
    }),
    pipeline.on('onTurnCancel', ({ turnId }) => {
      const entry = turn(turnId)
      if (entry)
        entry.interrupted = true
      finish(turnId)
    }),
    pipeline.on('onTurnEnd', (turnId) => {
      if (turns.has(turnId))
        finish(turnId)
    }),
  ]

  return () => {
    for (const stop of stops)
      stop()
  }
}
