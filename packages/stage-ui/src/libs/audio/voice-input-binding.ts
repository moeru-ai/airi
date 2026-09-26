/** The microphone stream and transcription mode owned by one page interaction. */
export interface VoiceInputBinding {
  stream: MediaStream
  mode: 'stream' | 'recording'
}

/** The requested microphone input; a missing stream means acquisition is pending. */
export interface VoiceInputRequest {
  enabled: boolean
  stream?: MediaStream | null
  mode: VoiceInputBinding['mode']
}

/** One page's microphone binding state. ASR utterances have a separate lifecycle. */
export type VoiceInputState
  = | { status: 'off' }
    | { status: 'awaiting-stream' }
    | { status: 'starting', binding: VoiceInputBinding }
    | { status: 'listening', binding: VoiceInputBinding }
    | { status: 'stopping', binding: VoiceInputBinding }
    | { status: 'error', cause: unknown }
    | { status: 'disposed' }

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
  let state: VoiceInputState = { status: 'off' }
  let disposed = false
  let revision = 0
  let work = Promise.resolve()

  function update(request: VoiceInputRequest): Promise<void> {
    if (disposed)
      return Promise.resolve()

    desired = request.enabled && request.stream
      ? { stream: request.stream, mode: request.mode }
      : undefined
    const requestedRevision = ++revision
    if (request.enabled && !request.stream)
      state = { status: 'awaiting-stream' }

    const operation = work.then(async () => {
      if (requestedRevision !== revision)
        return

      if (state.status === 'listening' && active?.stream === desired?.stream && active?.mode === desired?.mode)
        return

      if (active) {
        if (!disposed)
          state = { status: 'stopping', binding: active }
        try {
          await operations.stop()
          active = undefined
        }
        catch (cause) {
          if (!disposed)
            state = { status: 'error', cause }
          throw cause
        }
      }

      if (requestedRevision !== revision)
        return

      if (!desired) {
        state = request.enabled ? { status: 'awaiting-stream' } : { status: 'off' }
        return
      }

      const binding = desired
      active = binding
      state = { status: 'starting', binding }
      try {
        await operations.start(binding)
        if (requestedRevision === revision)
          state = { status: 'listening', binding }
      }
      catch (cause) {
        try {
          await operations.stop()
          active = undefined
        }
        finally {
          if (requestedRevision === revision)
            state = { status: 'error', cause }
        }
        throw cause
      }
    })
    work = operation.catch(() => undefined)
    return operation
  }

  async function dispose() {
    if (disposed)
      return await work

    disposed = true
    desired = undefined
    revision += 1
    state = { status: 'disposed' }
    const operation = work.then(async () => {
      if (!active)
        return
      await operations.stop()
      active = undefined
    })
    work = operation.catch(() => undefined)
    await operation
  }

  return {
    update,
    dispose,
    get state(): VoiceInputState { return state },
  }
}
