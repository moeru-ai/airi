/**
 * Operations that bind and release the main-stage voice-input consumers.
 *
 * @param TStopOptions Configuration accepted by the stop operation.
 */
export interface VoiceInputInteractionOperations<TStopOptions> {
  /** Starts the streaming or recorder-backed microphone consumers. */
  start: () => Promise<void>
  /** Stops active microphone consumers and applies the requested flush policy. */
  stop: (options?: TStopOptions) => Promise<void>
}

/**
 * Serialized lifecycle for main-stage voice input.
 *
 * Use when:
 * - Mic toggles can overlap asynchronous start and stop operations.
 * - A restart must wait until the previous listener has fully stopped.
 *
 * Expects:
 * - Operations own the actual microphone, transcription, and transcript-buffer work.
 * - Stop remains safe after a failed start.
 *
 * Returns:
 * - Start and stop actions that preserve operation errors and prevent overlapping lifecycles.
 */
export function createVoiceInputInteractionLifecycle<TStopOptions = never>(
  operations: VoiceInputInteractionOperations<TStopOptions>,
) {
  let startPromise: Promise<void> | undefined
  let stopPromise: Promise<void> | undefined

  /** Starts after any active stop and deduplicates concurrent starts. */
  async function start() {
    if (stopPromise)
      await stopPromise

    if (startPromise)
      return startPromise

    const operation = Promise.resolve().then(operations.start)
    startPromise = operation
    try {
      await operation
    }
    finally {
      if (startPromise === operation)
        startPromise = undefined
    }
  }

  /** Stops after any active start and deduplicates concurrent stops. */
  async function stop(options?: TStopOptions) {
    if (stopPromise)
      return stopPromise

    const operation = (async () => {
      if (startPromise) {
        try {
          await startPromise
        }
        catch {
          // A failed start still needs its partially-created microphone consumers released.
        }
      }

      await operations.stop(options)
    })()
    stopPromise = operation
    try {
      await operation
    }
    finally {
      if (stopPromise === operation)
        stopPromise = undefined
    }
  }

  return {
    start,
    stop,
    isStarting: () => startPromise !== undefined,
    isStopping: () => stopPromise !== undefined,
  }
}
