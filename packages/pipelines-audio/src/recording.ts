import type { AudioInput, Capture, FileOptions, Outcome } from './audio-input'

/** File capture keeps permission startup visible. Completion supplies media for a caller-owned preview or submission. */
export type RecordingState
  = { readonly phase: 'pending' | 'capturing' | 'finalizing' }
    | { readonly phase: 'settled', readonly outcome: Outcome<Blob> }

/** Borrows an audio source. Cancelling a recording never closes other captures or detector windows on that source. */
export class Recording implements Capture<Blob> {
  private readonly completion = Promise.withResolvers<Outcome<Blob>>()
  private readonly listeners = new Set<(state: RecordingState) => void>()
  private capture: Capture<Blob> | undefined
  private current: RecordingState = { phase: 'pending' }
  readonly done = this.completion.promise

  constructor(openInput: () => Promise<AudioInput>, file: FileOptions) {
    // Source startup begins in the caller's gesture. Permission cannot be deferred to a later microtask.
    try {
      void openInput().then((audio) => {
        if (this.current.phase === 'settled')
          return
        this.capture = audio.capture({ delivery: 'file', file })
        this.change({ phase: 'capturing' })
        void this.capture.done.then(outcome => this.settle(outcome))
      }).catch(cause => this.settle({ status: 'failed', error: cause instanceof Error ? cause : new Error('Recording startup failed', { cause }) }))
    }
    catch (cause) {
      this.settle({ status: 'failed', error: cause instanceof Error ? cause : new Error('Recording startup failed', { cause }) })
    }
  }

  get state(): RecordingState { return this.current }

  subscribe(listener: (state: RecordingState) => void): () => void {
    this.listeners.add(listener)
    this.notify(listener)
    return () => this.listeners.delete(listener)
  }

  finish(): Promise<Outcome<Blob>> {
    if (this.current.phase === 'pending')
      this.cancel('Recording ended before source startup')
    if (this.current.phase === 'capturing') {
      this.change({ phase: 'finalizing' })
      void this.capture!.finish()
    }
    return this.done
  }

  cancel(reason: string) {
    if (this.current.phase === 'settled')
      return
    this.capture?.cancel(reason)
    this.settle({ status: 'cancelled', reason })
  }

  private settle(outcome: Outcome<Blob>) {
    if (this.current.phase === 'settled')
      return
    this.change({ phase: 'settled', outcome })
    this.completion.resolve(outcome)
    this.listeners.clear()
  }

  private change(state: RecordingState) {
    this.current = state
    this.listeners.forEach(listener => this.notify(listener))
  }

  private notify(listener: (state: RecordingState) => void) {
    try {
      listener(this.current)
    }
    catch (error) {
      console.error('Recording observer failed', error)
    }
  }
}
