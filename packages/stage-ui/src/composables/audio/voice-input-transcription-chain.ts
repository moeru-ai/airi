export interface VoiceInputTranscriptionTicket {
  /** Returns whether this queued transcription still belongs to the active listening session. */
  isCurrent: () => boolean
}

export interface VoiceInputTranscriptionChain {
  /** Runs work after earlier current transcription tasks have settled. */
  enqueue: <T>(task: (ticket: VoiceInputTranscriptionTicket) => Promise<T> | T) => Promise<T | undefined>
  /** Invalidates pending/running tickets and lets future work start from a fresh tail. */
  reset: () => void
  /** Resolves when all currently chained transcription work has settled. */
  idle: () => Promise<void>
}

export function createVoiceInputTranscriptionChain(): VoiceInputTranscriptionChain {
  let tail = Promise.resolve()
  let generation = 0

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

  function reset() {
    generation += 1
    tail = Promise.resolve()
  }

  function idle() {
    return tail
  }

  return {
    enqueue,
    reset,
    idle,
  }
}
