interface OpenIntent {
  /** Streaming intents only: the session will schedule no more audio. */
  inputDone: boolean
  /** Streaming intents only: scheduled audio that has not ended, been interrupted, or been rejected. */
  pendingAudio: number
}

/**
 * Tracks whether speech output voices a reply: an open speech intent already
 * played audio. It stays `true` in the pauses between sentences, and turns
 * `false` when every open intent has closed.
 *
 * Use when:
 * - Another window must know when a spoken reply ends, such as the danmaku chat.
 *
 * Two kinds of intent open and close here, keyed by `intentId`:
 * - A segmenter intent follows the speech pipeline. The pipeline closes it
 *   after its last audio ends, or when it is canceled.
 * - A streaming intent bypasses the pipeline and schedules audio straight
 *   into playback. It opens with its first scheduled audio, and closes when
 *   its session is done and all of its scheduled audio has settled. A
 *   canceled session closes its intent at once, because stopping playback
 *   drops queued audio without an event, so that audio never settles.
 *
 * Audio from no open intent, such as a special token, never makes speech voicing.
 */
export class SpeechVoicingTracker {
  private readonly openIntents = new Map<string, OpenIntent>()
  private voicing = false

  /** @param onChange Receives each new voicing value. */
  constructor(private readonly onChange: (voicing: boolean) => void) {}

  /** A segmenter intent opened in the speech pipeline. */
  openIntent(intentId: string) {
    if (!this.openIntents.has(intentId))
      this.openIntents.set(intentId, { inputDone: false, pendingAudio: 0 })
  }

  /** A segmenter intent ended or was canceled in the speech pipeline, or a streaming session was canceled. */
  closeIntent(intentId: string) {
    this.openIntents.delete(intentId)
    if (this.openIntents.size === 0)
      this.setVoicing(false)
  }

  /** A streaming session scheduled audio. Its first audio opens its intent. */
  streamingAudioScheduled(intentId: string) {
    this.openIntent(intentId)
    this.openIntents.get(intentId)!.pendingAudio += 1
  }

  /** A streaming session finished, so it schedules no more audio. */
  streamingInputDone(intentId: string) {
    const intent = this.openIntents.get(intentId)
    if (!intent)
      return

    intent.inputDone = true
    if (intent.pendingAudio === 0)
      this.closeIntent(intentId)
  }

  audioStarted(intentId: string) {
    if (this.openIntents.has(intentId))
      this.setVoicing(true)
  }

  /** Audio ended, was interrupted, or was rejected. */
  audioSettled(intentId: string) {
    const intent = this.openIntents.get(intentId)
    // A segmenter intent counts no audio. The pipeline closes it instead.
    if (!intent || intent.pendingAudio === 0)
      return

    intent.pendingAudio -= 1
    if (intent.inputDone && intent.pendingAudio === 0)
      this.closeIntent(intentId)
  }

  private setVoicing(voicing: boolean) {
    if (voicing === this.voicing)
      return

    this.voicing = voicing
    this.onChange(voicing)
  }
}
