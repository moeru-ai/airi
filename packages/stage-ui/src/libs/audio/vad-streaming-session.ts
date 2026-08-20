export interface VadStreamingSessionOptions {
  start: () => Promise<void>
  stop: () => Promise<void>
  onError?: (error: unknown) => void
}

/**
 * Serializes realtime transcription sessions from VAD speech boundaries.
 *
 * A detected speech segment owns one provider session. The session starts when
 * VAD detects speech and stops after VAD reports the configured silence period.
 */
export function createVadStreamingSession(options: VadStreamingSessionOptions) {
  let disposed = false
  let speechActive = false
  let providerSessionActive = false
  let lifecycle = Promise.resolve()

  function enqueue(operation: () => Promise<void>) {
    lifecycle = lifecycle
      .catch(() => undefined)
      .then(operation)
    return lifecycle
  }

  function onSpeechStart() {
    if (disposed || speechActive)
      return

    speechActive = true
    void enqueue(async () => {
      if (disposed || providerSessionActive)
        return

      try {
        await options.start()
        providerSessionActive = true
      }
      catch (error) {
        options.onError?.(error)
        return
      }

      if (!disposed && speechActive)
        return

      try {
        await options.stop()
      }
      catch (error) {
        options.onError?.(error)
      }
      finally {
        providerSessionActive = false
      }
    })
  }

  function onSpeechEnd() {
    if (disposed || !speechActive)
      return

    speechActive = false
    void enqueue(async () => {
      if (!providerSessionActive)
        return

      try {
        await options.stop()
      }
      catch (error) {
        options.onError?.(error)
      }
      finally {
        providerSessionActive = false
      }
    })
  }

  async function dispose() {
    if (disposed)
      return

    disposed = true
    speechActive = false
    await enqueue(async () => {
      if (!providerSessionActive)
        return

      try {
        await options.stop()
      }
      catch (error) {
        options.onError?.(error)
      }
      finally {
        providerSessionActive = false
      }
    })
  }

  return {
    onSpeechStart,
    onSpeechEnd,
    dispose,
  }
}
