/** The microphone stream and transcription mode owned by one page interaction. */
export interface VoiceInputBinding {
  stream: MediaStream
  mode: 'stream' | 'recording'
}

/** Operations that install and release one page's microphone consumers. */
export interface VoiceInputBindingOperations {
  start: (binding: VoiceInputBinding) => Promise<void>
  stop: () => Promise<void>
}

/**
 * Serializes microphone binding changes across toggles, device replacement, and unmount.
 * A newer request supersedes work that has not started, while an in-flight start is
 * released before the next binding begins.
 */
export function createVoiceInputBinding(operations: VoiceInputBindingOperations) {
  let desired: VoiceInputBinding | undefined
  let active: VoiceInputBinding | undefined
  let revision = 0
  let work = Promise.resolve()

  function update(next?: VoiceInputBinding): Promise<void> {
    desired = next
    const requestedRevision = ++revision
    const operation = work.then(async () => {
      if (requestedRevision !== revision)
        return

      if (active?.stream === desired?.stream && active?.mode === desired?.mode)
        return

      if (active) {
        active = undefined
        await operations.stop()
      }

      if (requestedRevision !== revision || !desired)
        return

      const binding = desired
      active = binding
      try {
        await operations.start(binding)
      }
      catch (cause) {
        active = undefined
        await operations.stop()
        throw cause
      }
    })
    work = operation.catch(() => undefined)
    return operation
  }

  return { update }
}
