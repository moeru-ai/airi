import type { LeaseTable } from '@proj-airi/core-agent'
import type { SpeechPipelineEvents } from '@proj-airi/pipelines-audio'

/** The pipeline events and turn query that the playback lease reads. */
export interface VoicePlaybackSource {
  on: <K extends 'onTurnEnd' | 'onTurnCancel'>(event: K, listener: SpeechPipelineEvents<unknown>[K]) => () => void
  hasTurn: (turnId: string) => boolean
}

/**
 * A playback lease whose turn end never arrives expires after this time.
 * Turn events release it first. This limit only keeps a lost event from holding the voice.
 */
export const VOICE_PLAYBACK_LEASE_TTL_MS = 180_000

/** Lease holder for the speech of one turn that keeps playing after its run. */
export function playbackHolder(turnId: string) {
  return `playback:${turnId}`
}

/**
 * Keeps the voice lease while a run's speech still plays, so one voice owner covers both generation and playback.
 *
 * Use when:
 * - A run that holds the voice ends, but its speech turn still waits or plays.
 *
 * Expects:
 * - The pipeline is this renderer's speech host, and `leases` is the table that granted the run its voice.
 *
 * Returns:
 * - `hold`, which moves the voice from the run to its turn's playback. The lease is interruptible, so the owner's next turn can cut in.
 *   Calm work waits for the turn to end. The turn's end or cancellation releases the lease.
 */
export function holdVoiceDuringPlayback(pipeline: VoicePlaybackSource, leases: Pick<LeaseTable, 'handOver' | 'release'>) {
  const held = new Set<string>()

  function release(turnId: string) {
    if (held.delete(turnId))
      leases.release('voice', playbackHolder(turnId))
  }

  const stops = [
    pipeline.on('onTurnEnd', release),
    pipeline.on('onTurnCancel', ({ turnId }) => release(turnId)),
  ]

  return {
    /** Moves the voice from a finished run to its turn's playback. Returns false when nothing plays or the run does not hold the voice. */
    hold(turnId: string, runId: string) {
      if (!pipeline.hasTurn(turnId) || !leases.handOver('voice', runId, playbackHolder(turnId), { ttlMs: VOICE_PLAYBACK_LEASE_TTL_MS, interruptible: true }))
        return false
      held.add(turnId)
      return true
    },
    stop() {
      for (const stop of stops)
        stop()
      for (const turnId of [...held])
        release(turnId)
    },
  }
}
