import type { Recording, RecordingState } from '@proj-airi/pipelines-audio'

import { errorMessageFrom } from '@moeru/std'

/** The application owns a preview until explicit submission receives its durable message receipt. */
export interface VoiceMessageSnapshot {
  readonly id: string
  readonly sessionId: string
  readonly phase: 'pending' | 'capturing' | 'finalizing' | 'ready' | 'sending' | 'sent' | 'cancelled' | 'failed'
  readonly audio?: Blob
  readonly error?: string
}

/** A voice attachment does not depend on transcription or Hearing mode. */
export class VoiceMessage {
  private readonly listeners = new Set<() => void>()
  private current: VoiceMessageSnapshot
  private sending: Promise<{ messageId: string }> | undefined
  private receipt: { messageId: string } | undefined
  private readonly stopRecording: () => void

  constructor(
    readonly id: string,
    readonly sessionId: string,
    private readonly recording: Recording,
    private readonly submit: (draft: { messageId: string, sessionId: string, audio: Blob }) => Promise<{ messageId: string }>,
  ) {
    this.current = { id, sessionId, phase: recording.state.phase === 'settled' ? 'pending' : recording.state.phase }
    this.stopRecording = recording.subscribe(state => this.onRecording(state))
  }

  get snapshot(): VoiceMessageSnapshot { return this.current }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  finish() { return this.recording.finish() }

  /** Persistence owns an in-flight send. Discard cannot erase the only recoverable draft during that operation. */
  cancel(): 'cancelled' | 'closed' {
    if (this.sending || this.receipt)
      return 'closed'
    this.stopRecording()
    this.recording.cancel('Voice message discarded')
    this.change({ id: this.id, sessionId: this.sessionId, phase: 'cancelled' })
    return 'cancelled'
  }

  send(): Promise<{ messageId: string }> {
    if (this.receipt)
      return Promise.resolve(this.receipt)
    if (this.sending)
      return this.sending
    const audio = this.current.audio
    if (this.current.phase !== 'ready' || !audio)
      return Promise.reject(new Error('Voice message is not ready'))
    this.change({ ...this.current, phase: 'sending', error: undefined })
    // Defer transport invocation until the in-flight promise is installed. Synchronous adapters cannot bypass deduplication.
    this.sending = Promise.resolve().then(() => this.submit({ messageId: this.id, sessionId: this.sessionId, audio })).then((receipt) => {
      if (receipt.messageId !== this.id)
        throw new Error('Voice message receipt has a different identity')
      this.receipt = receipt
      this.change({ id: this.id, sessionId: this.sessionId, phase: 'sent' })
      return receipt
    }).catch((error: unknown) => {
      this.change({ ...this.current, phase: 'ready', error: errorMessageFrom(error) ?? 'Voice message submission failed' })
      throw error
    }).finally(() => { this.sending = undefined })
    return this.sending
  }

  /** Recording owns source admission and encoding. This handler retains only the completed attachment. */
  private onRecording(state: RecordingState) {
    if (state.phase !== 'settled') {
      this.change({ ...this.current, phase: state.phase })
      return
    }
    const outcome = state.outcome
    if (outcome.status === 'finished')
      this.change({ ...this.current, phase: 'ready', audio: outcome.value })
    else if (outcome.status === 'failed')
      this.change({ ...this.current, phase: 'failed', error: outcome.error.message })
    else
      this.change({ ...this.current, phase: 'cancelled' })
  }

  private change(snapshot: VoiceMessageSnapshot) {
    this.current = snapshot
    for (const listener of this.listeners) {
      try {
        listener()
      }
      catch (error) {
        console.error('Voice message observer failed', error)
      }
    }
  }
}
