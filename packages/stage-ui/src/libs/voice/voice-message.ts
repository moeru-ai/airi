import type { AudioInput, PcmBlock } from '@proj-airi/pipelines-audio'

import { errorMessageFrom } from '@moeru/std'
import { encodeWav } from '@proj-airi/audio/encoding'
import { capture } from '@proj-airi/pipelines-audio'

/** The application owns a preview until explicit submission receives its durable message receipt. */
export interface VoiceMessageSnapshot {
  readonly id: string
  readonly sessionId: string
  readonly phase: 'pending' | 'capturing' | 'finalizing' | 'ready' | 'sending' | 'sent' | 'cancelled' | 'failed'
  readonly audio?: Blob
  readonly error?: string
}

/** The longest time a send waits for the transcript after the recording ends. A later transcript is not used. */
const TRANSCRIPT_WAIT_MS = 8000

/**
 * A voice attachment recorded as 16 kHz mono WAV. It does not depend on Hearing mode.
 *
 * Phases: pending until audio arrives, capturing, finalizing after finish, then ready with the file.
 *
 * With `transcribe`, the same captured audio is also transcribed while it records. The send carries the transcript, so a
 * model without audio input reads it instead of transcribing the stored file later. A failed or late transcript is
 * omitted, and the chat then transcribes the file.
 */
export class VoiceMessage {
  private readonly listeners = new Set<() => void>()
  private current: VoiceMessageSnapshot
  private sending: Promise<{ messageId: string }> | undefined
  private receipt: { messageId: string } | undefined
  private readonly recording: ReturnType<typeof capture>
  private readonly transcription = new AbortController()
  private transcript: Promise<string | undefined> | undefined

  constructor(
    readonly id: string,
    readonly sessionId: string,
    input: AudioInput,
    private readonly submit: (draft: { messageId: string, sessionId: string, audio: Blob, text: string, transcript?: string }) => Promise<{ messageId: string }>,
    transcribe?: (audio: ReadableStream<PcmBlock>, signal: AbortSignal) => Promise<string | undefined>,
  ) {
    this.current = { id, sessionId, phase: 'pending' }
    this.recording = capture(input)
    const [encoded, recognized] = transcribe ? this.recording.stream.tee() : [this.recording.stream]
    if (transcribe && recognized) {
      this.transcript = transcribe(recognized, this.transcription.signal).catch(() => undefined)
      void this.recording.done.then((outcome) => {
        if (outcome.status !== 'finished')
          this.transcription.abort('Voice message ended without audio')
      })
    }
    const encoding = encodeWav(encoded, { sampleRate: 16000, channels: 1 })
    // Cancellation and capture failure also reject encoding. The done handler reports those outcomes instead.
    void encoding.catch(() => {})
    void this.recording.started.then((started) => {
      if (started)
        this.advance('pending', 'capturing')
    })
    void this.recording.done.then(async (outcome) => {
      if (outcome.status === 'cancelled')
        return this.advance(this.current.phase, 'cancelled')
      if (outcome.status === 'failed')
        return this.change({ ...this.current, phase: 'failed', error: outcome.error.message })
      try {
        const audio = await encoding
        this.change({ ...this.current, phase: 'ready', audio })
      }
      catch (cause) {
        this.change({ ...this.current, phase: 'failed', error: errorMessageFrom(cause) ?? 'Voice message encoding failed' })
      }
    })
  }

  get snapshot(): VoiceMessageSnapshot { return this.current }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  finish() {
    this.advance('capturing', 'finalizing')
    return this.recording.finish()
  }

  /** Persistence owns an in-flight send. Discard cannot erase the only recoverable draft during that operation. */
  cancel(): 'cancelled' | 'closed' {
    if (this.sending || this.receipt)
      return 'closed'
    this.recording.cancel('Voice message discarded')
    this.transcription.abort('Voice message discarded')
    this.change({ id: this.id, sessionId: this.sessionId, phase: 'cancelled' })
    return 'cancelled'
  }

  /** `text` goes into the same user message as the recording. A retry while a send runs keeps the first text. */
  send(text = ''): Promise<{ messageId: string }> {
    if (this.receipt)
      return Promise.resolve(this.receipt)
    if (this.sending)
      return this.sending
    const audio = this.current.audio
    if (this.current.phase !== 'ready' || !audio)
      return Promise.reject(new Error('Voice message is not ready'))
    this.change({ ...this.current, phase: 'sending', error: undefined })
    // Defer transport invocation until the in-flight promise is installed. Synchronous adapters cannot bypass deduplication.
    this.sending = Promise.resolve().then(() => this.waitForTranscript().then(transcript => this.submit({ messageId: this.id, sessionId: this.sessionId, audio, text, ...(transcript ? { transcript } : {}) }))).then((receipt) => {
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

  /** Resolves with the transcript, or with nothing once {@link TRANSCRIPT_WAIT_MS} passes. */
  private async waitForTranscript() {
    if (!this.transcript)
      return undefined
    let timer: Parameters<typeof clearTimeout>[0]
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(resolve, TRANSCRIPT_WAIT_MS)
    })
    try {
      return await Promise.race([this.transcript, timeout])
    }
    finally {
      clearTimeout(timer)
    }
  }

  /** Moves forward only from the expected phase, so late recording events cannot undo a newer state. */
  private advance(from: VoiceMessageSnapshot['phase'], to: VoiceMessageSnapshot['phase']) {
    if (this.current.phase === from)
      this.change({ ...this.current, phase: to })
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
