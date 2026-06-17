export interface VoiceInputTranscriptionTicket {
  /** Returns whether this queued transcription still belongs to the active listening session. */
  isCurrent: () => boolean
}

export interface VoiceInputTranscriptionQueue {
  /** Runs work after earlier transcription tasks have settled. */
  enqueue: <T>(task: (ticket: VoiceInputTranscriptionTicket) => Promise<T> | T) => Promise<T | undefined>
  /** Invalidates pending tickets so queued work cannot publish stale voice input. */
  clearPending: () => void
  /** Resolves when all previously accepted transcription work has settled. */
  idle: () => Promise<void>
}

/**
 * Creates a serial queue for record-then-transcribe speech segments.
 *
 * Use when:
 * - Multiple VAD `speech-ready` events may start provider requests.
 * - Chat text must follow speech order instead of provider response order.
 *
 * Expects:
 * - Tasks check `ticket.isCurrent()` before publishing user-visible results after async work.
 *
 * Returns:
 * - A queue that serializes work and can invalidate pending/running tickets.
 */
export function createVoiceInputTranscriptionQueue(): VoiceInputTranscriptionQueue {
  let tail = Promise.resolve()
  let generation = 0

  /**
   * Adds one transcription task after the current queue tail.
   */
  function enqueue<T>(task: (ticket: VoiceInputTranscriptionTicket) => Promise<T> | T) {
    const taskGeneration = generation
    const ticket: VoiceInputTranscriptionTicket = {
      isCurrent: () => taskGeneration === generation,
    }

    const run = tail.then(async () => {
      if (!ticket.isCurrent())
        return undefined

      return task(ticket)
    })

    tail = run.then(
      () => undefined,
      () => undefined,
    )

    return run
  }

  /**
   * Invalidates queued tasks and marks running tickets as stale.
   */
  function clearPending() {
    generation += 1
  }

  /**
   * Waits until all queue work accepted before this call has settled.
   */
  function idle() {
    return tail
  }

  return {
    enqueue,
    clearPending,
    idle,
  }
}
