export interface VadStreamingSessionOptions<T = void> {
  start: (segment: T) => Promise<void>
  stop: () => Promise<void>
  cancel: () => Promise<void>
  onError?: (error: unknown) => void
}

/** The ASR provider lifecycle for the current VAD utterance. */
export type VadStreamingState
  = | { status: 'idle' }
    | { status: 'opening', utteranceId: number }
    | { status: 'streaming', utteranceId: number }
    | { status: 'closing', utteranceId: number }
    | { status: 'error', utteranceId: number, cause: unknown }
    | { status: 'disposed' }

interface Utterance<T> {
  id: number
  segment: T
  speechEnded: boolean
  cancelled: boolean
}

/**
 * Serializes VAD utterances and owns one provider session at a time.
 * An utterance ID keeps completion of an older stop from changing a newer state.
 * The ASR transport is supplied by start/stop and can be HTTP or WebSocket.
 */
export function createVadStreamingSession<T = void>(options: VadStreamingSessionOptions<T>) {
  let state: VadStreamingState = { status: 'idle' }
  let current: Utterance<T> | undefined
  let providerOwner: Utterance<T> | undefined
  let disposalCancellation: Promise<void> | undefined
  let nextUtteranceId = 0
  let lifecycle = Promise.resolve()

  function isDisposed() {
    return state.status === 'disposed'
  }

  function enqueue(operation: () => Promise<void>) {
    lifecycle = lifecycle.then(operation)
    return lifecycle
  }

  function reportError(cause: unknown) {
    try {
      options.onError?.(cause)
    }
    catch (callbackError) {
      console.error('VAD streaming error handler failed:', callbackError)
    }
  }

  async function close(utterance: Utterance<T>) {
    if (providerOwner !== utterance)
      return

    if (current === utterance && state.status !== 'disposed')
      state = { status: 'closing', utteranceId: utterance.id }

    try {
      if (utterance.cancelled)
        await (disposalCancellation ?? options.cancel())
      else
        await options.stop()
      if (current === utterance && state.status !== 'disposed')
        state = { status: 'idle' }
    }
    catch (cause) {
      if (current === utterance && state.status !== 'disposed')
        state = { status: 'error', utteranceId: utterance.id, cause }
      reportError(cause)
    }
    finally {
      providerOwner = undefined
    }
  }

  function onSpeechStart(segment: T) {
    if (isDisposed() || (current && !current.speechEnded))
      return

    const utterance: Utterance<T> = { id: ++nextUtteranceId, segment, speechEnded: false, cancelled: false }
    current = utterance
    state = { status: 'opening', utteranceId: utterance.id }
    void enqueue(async () => {
      if (isDisposed())
        return

      try {
        await options.start(utterance.segment)
        providerOwner = utterance
      }
      catch (cause) {
        if (current === utterance && !isDisposed())
          state = { status: 'error', utteranceId: utterance.id, cause }
        reportError(cause)
        return
      }

      if (isDisposed() || utterance.speechEnded) {
        await close(utterance)
        return
      }

      if (current === utterance)
        state = { status: 'streaming', utteranceId: utterance.id }
    })
  }

  function onSpeechEnd() {
    if (state.status === 'disposed' || !current || current.speechEnded)
      return

    const utterance = current
    utterance.speechEnded = true
    void enqueue(async () => await close(utterance))
  }

  function onSpeechCancel() {
    if (isDisposed() || !current || current.speechEnded)
      return

    const utterance = current
    utterance.speechEnded = true
    utterance.cancelled = true
    void enqueue(async () => await close(utterance))
  }

  async function dispose() {
    if (state.status === 'disposed') {
      await lifecycle
      return
    }

    const wasOpeningOrClosing = state.status === 'opening' || state.status === 'closing' || state.status === 'streaming'
    state = { status: 'disposed' }
    if (current) {
      current.speechEnded = true
      current.cancelled = true
    }
    if (providerOwner)
      providerOwner.cancelled = true

    // A pending provider start or final response can hold the queue open.
    // Abort it immediately so the queued cleanup can finish.
    if (wasOpeningOrClosing || providerOwner)
      disposalCancellation = Promise.resolve().then(options.cancel).catch(reportError)

    await enqueue(async () => {
      if (providerOwner)
        await close(providerOwner)
    })
  }

  return {
    onSpeechStart,
    onSpeechEnd,
    onSpeechCancel,
    dispose,
    get state(): VadStreamingState { return state },
  }
}
