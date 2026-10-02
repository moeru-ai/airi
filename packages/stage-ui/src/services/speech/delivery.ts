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

/** Voice turns kept while they wait for their message or their delivery report. */
const VOICE_TURN_LIMIT = 32

/**
 * Records the delivered part of interrupted voice turns on their chat messages.
 *
 * Use when:
 * - A voice turn writes a chat message, and later prompts must read only the speech that was heard.
 *
 * Expects:
 * - `start` runs when a voice turn begins. `attach` runs when its message exists. The message and the delivery report arrive in either order.
 *
 * Returns:
 * - Turn functions and a stop function. `record` receives the session, the message, and its delivered speech once per interrupted turn.
 */
export function recordVoiceTurnDelivery(pipeline: SpeechDeliverySource, record: (sessionId: string, messageId: string, deliveredSpeech: string) => void) {
  const turns = new Map<string, { sessionId: string, messageId?: string, deliveredSpeech?: string }>()

  function flush(turnId: string) {
    const entry = turns.get(turnId)
    if (!entry?.messageId || entry.deliveredSpeech === undefined)
      return
    turns.delete(turnId)
    record(entry.sessionId, entry.messageId, entry.deliveredSpeech)
  }

  const stop = trackSpeechDelivery(pipeline, (turnId, deliveredSpeech) => {
    const entry = turns.get(turnId)
    if (!entry)
      return
    entry.deliveredSpeech = deliveredSpeech
    flush(turnId)
  })

  return {
    /** Starts following one voice turn of a session. */
    start(turnId: string, sessionId: string) {
      turns.set(turnId, { sessionId })
      const oldest = turns.keys().next().value
      if (turns.size > VOICE_TURN_LIMIT && oldest)
        turns.delete(oldest)
    },
    /** Names the message that the turn wrote. */
    attach(turnId: string, messageId: string) {
      const entry = turns.get(turnId)
      if (!entry)
        return
      entry.messageId = messageId
      flush(turnId)
    },
    stop() {
      stop()
      turns.clear()
    },
  }
}
