import type { AudioInput, PcmBlock } from '@proj-airi/pipelines-audio'

import { errorMessageFrom } from '@moeru/std'
import { encodeWav } from '@proj-airi/audio/encoding'
import { capture } from '@proj-airi/pipelines-audio'

/**
 * The application owns a preview until explicit submission receives its durable message receipt.
 * `transcribing` follows a submit while the transcript of the stored message is still coming.
 */
export interface VoiceMessageSnapshot {
  readonly id: string
  readonly sessionId: string
  readonly phase: 'pending' | 'capturing' | 'finalizing' | 'ready' | 'sending' | 'transcribing' | 'sent' | 'cancelled' | 'failed'
  readonly audio?: Blob
  readonly error?: string
}

/** The longest time a submitted message waits for its transcript. Then transcription stops, and the chat transcribes the file. */
const TRANSCRIPT_LIMIT_MS = 60_000

/** The settled transcript of a recording. `undefined` means transcription failed, stopped, or is not used. */
type Transcript = string | undefined

/** The transcriber found no speech in the recording. Sending it again cannot succeed. */
class NoSpeechError extends Error {
  constructor() {
    super('No speech was recognized in the recording')
  }
}

/**
 * A voice attachment recorded as 16 kHz mono WAV. It does not depend on Hearing mode.
 *
 * Phases: pending until audio arrives, capturing, finalizing after finish, then ready with the file.
 *
 * With `transcribe`, the same captured audio is also transcribed while it records. A model without audio input reads the
 * transcript, so the chat does not transcribe the stored file again.
 *
 * A send never waits for the transcript, so the chat shows the message at once. A transcript that is ready goes with
 * the submit. A later one goes to `deliverTranscript`, and the message stays `transcribing` until then.
 *
 * `transcribe` resolves with an empty string when it completed and recognized no speech. Before the submit, the send
 * fails. After it, `deliverTranscript` removes the message from the chat. Either way the message ends `cancelled`.
 */
export class VoiceMessage {
  private readonly listeners = new Set<() => void>()
  private current: VoiceMessageSnapshot
  private sending: Promise<{ messageId: string }> | undefined
  private receipt: { messageId: string } | undefined
  private readonly recording: ReturnType<typeof capture>
  private readonly transcription = new AbortController()
  private transcript: Promise<Transcript> | undefined
  private settledTranscript: { value: Transcript } | undefined

  constructor(
    readonly id: string,
    readonly sessionId: string,
    input: AudioInput,
    /** `transcriptPending` means the transcript goes to `deliverTranscript` after this submit. */
    private readonly submit: (draft: { messageId: string, sessionId: string, audio: Blob, text: string, transcript?: string, transcriptPending?: boolean }) => Promise<{ messageId: string }>,
    transcribe?: (audio: ReadableStream<PcmBlock>, signal: AbortSignal) => Promise<Transcript>,
    private readonly deliverTranscript?: (draft: { messageId: string, sessionId: string, transcript?: string }) => Promise<void>,
  ) {
    this.current = { id, sessionId, phase: 'pending' }
    this.recording = capture(input)
    const [encoded, recognized] = transcribe ? this.recording.stream.tee() : [this.recording.stream]
    if (transcribe && recognized) {
      this.transcript = transcribe(recognized, this.transcription.signal).catch(() => undefined).then((value) => {
        this.settledTranscript = { value }
        return value
      })
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
    this.sending = Promise.resolve().then(() => {
      const settled = this.settledTranscript
      if (settled?.value === '')
        throw new NoSpeechError()
      const late = !settled && this.transcript && this.deliverTranscript ? { transcript: this.transcript, deliver: this.deliverTranscript } : undefined
      return this.submit({ messageId: this.id, sessionId: this.sessionId, audio, text, ...(settled?.value ? { transcript: settled.value } : {}), ...(late ? { transcriptPending: true } : {}) })
        .then(receipt => ({ receipt, late }))
    }).then(({ receipt, late }) => {
      if (receipt.messageId !== this.id)
        throw new Error('Voice message receipt has a different identity')
      this.receipt = receipt
      if (late)
        void this.deliverLateTranscript(late.transcript, late.deliver)
      else
        this.change({ id: this.id, sessionId: this.sessionId, phase: 'sent' })
      return receipt
    }).catch((error: unknown) => {
      if (error instanceof NoSpeechError)
        this.change({ id: this.id, sessionId: this.sessionId, phase: 'cancelled', error: error.message })
      else
        this.change({ ...this.current, phase: 'ready', error: errorMessageFrom(error) ?? 'Voice message submission failed' })
      throw error
    }).finally(() => { this.sending = undefined })
    return this.sending
  }

  /** Hands a transcript that settles after the submit to the chat. Transcription stops after {@link TRANSCRIPT_LIMIT_MS}. */
  private async deliverLateTranscript(transcript: Promise<Transcript>, deliver: NonNullable<typeof this.deliverTranscript>) {
    this.change({ id: this.id, sessionId: this.sessionId, phase: 'transcribing' })
    const timer = setTimeout(() => this.transcription.abort('Voice message transcription took too long'), TRANSCRIPT_LIMIT_MS)
    const value = await transcript
    clearTimeout(timer)
    // A failed delivery leaves the chat without the transcript. The chat then transcribes the stored file.
    await deliver({ messageId: this.id, sessionId: this.sessionId, ...(value === undefined ? {} : { transcript: value }) }).catch(() => {})
    if (value === '')
      this.change({ id: this.id, sessionId: this.sessionId, phase: 'cancelled', error: new NoSpeechError().message })
    else
      this.change({ id: this.id, sessionId: this.sessionId, phase: 'sent' })
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
