import type { TurnRef } from '@proj-airi/core-agent'
import type { AudioWindow } from '@proj-airi/pipelines-audio'
import type { KeywordEntry, KeywordSpotter } from '@sherpaw/kws'

import type { WakePronunciation } from './wake-words'

import { errorMessageFrom } from '@moeru/std'

/** The session that a wake selects. The voice activity plugin starts one input for it. */
export interface WakeTarget {
  readonly sessionId: string
  readonly interruptTurns: readonly TurnRef[]
}

/**
 * Preparation of the keyword spotter runtime.
 *
 * - `unconfigured`: no active pronunciation uses the detector model, so no model loads.
 * - `preparing`: the model pack downloads or the spotter Worker starts.
 * - `ready`: the spotter has the current pronunciations and receives audio.
 * - `error`: preparation or recognition failed. A later pronunciation change retries.
 */
export type WakeWordPreparation = 'unconfigured' | 'preparing' | 'ready' | 'error'

export interface WakeWordDetectorOptions {
  /** Pronunciations of other models stay inactive, because their tokens are not in this model's vocabulary. */
  readonly modelId: string
  /** Creates a spotter Worker. Initialization requires at least one keyword. The detector owns and disposes the result. */
  readonly createSpotter: (keywords: readonly KeywordEntry[]) => Promise<KeywordSpotter>
  /** Selects the character session after a match. The signal aborts when the observed audio window is abandoned. */
  readonly resolveTarget: (characterId: string, signal: AbortSignal) => Promise<WakeTarget>
  readonly onPreparationChange?: (preparation: WakeWordPreparation, error?: string) => void
  /** Receives a failure to select the target session. Recognition continues with the next window. */
  readonly onError?: (error: unknown) => void
  /**
   * Audio that the detector collects before each Worker call. Shorter batches add Worker round trips per second.
   *
   * @default 100
   */
  readonly batchMs?: number
  /**
   * Recognition audio that can wait for the Worker. A larger backlog is dropped, because a wake from stale audio
   * arrives too late to be useful, and the spotter starts a new stream.
   *
   * @default 1000
   */
  readonly maxBacklogMs?: number
}

/** A complete batch that waits for the Worker. `reset` starts a new stream before this batch. */
interface RecognitionBatch {
  readonly samples: Float32Array
  readonly sampleRate: number
  readonly reset: boolean
}

/** Sherpa-ONNX accepts finite mono PCM in [-1, 1]. */
function toMonoSamples(window: AudioWindow) {
  const length = window.channels[0]?.length ?? 0
  const samples = new Float32Array(length)
  for (const channel of window.channels) {
    for (let index = 0; index < length; index++)
      samples[index] += (channel[index] ?? 0) / window.channels.length
  }
  for (let index = 0; index < length; index++) {
    const value = samples[index]
    // NaN or Infinity from a device or a resampler would poison the decoder state until the next reset.
    samples[index] = Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0
  }

  return samples
}

/**
 * Spots active wake word pronunciations in the ordered windows of the shared audio input.
 *
 * The detector owns one keyword spotter Worker. It does not own a microphone or an AudioContext.
 * Each keyword label is a {@link WakePronunciation.key}. A match maps back to the current catalog,
 * so a pronunciation that changed owner or became inactive during recognition cannot wake a character.
 *
 * Recognition runs off the ordered window path. {@link detect} queues complete batches and returns at once,
 * so a Worker slower than real time cannot delay VAD or make the shared observer fall behind.
 * A match resolves its target in the background, and the next window returns it.
 *
 * State:
 * - `pronunciations` is the latest active catalog for this model. {@link setPronunciations} replaces it.
 * - `spotter` is runtime-loaded state. It exists after the first non-empty catalog prepares.
 * - `queue` holds batches for the Worker. `wake` holds a resolved target until a window returns it.
 * - `generation` changes on {@link stop} and on keyword rebuilds. Work from an older generation discards its result.
 */
export class WakeWordDetector {
  private pronunciations = new Map<string, WakePronunciation>()
  private spotter?: KeywordSpotter
  private keywordsReady = false
  /** Serializes spotter creation and keyword replacement, so the Worker receives the newest list last. */
  private updates: Promise<void> = Promise.resolve()
  private generation = 0
  /** Aborts target resolution of the current generation. */
  private lifetime = new AbortController()
  private pending: Float32Array[] = []
  private pendingSamples = 0
  private queue: RecognitionBatch[] = []
  private recognizing = false
  private wake?: WakeTarget
  /** Sherpa-ONNX resamples to the model rate internally, but the rate must stay constant within one stream. */
  private streamSampleRate?: number
  private resetStream = false

  constructor(private readonly options: WakeWordDetectorOptions) {}

  /** True when audio reaches a spotter that has the current pronunciations. */
  get ready() {
    return !!this.spotter && this.keywordsReady && this.pronunciations.size > 0
  }

  /**
   * Replaces the active pronunciations. The first non-empty list creates the spotter.
   * An empty list pauses recognition and keeps the Worker for a later list.
   * The returned promise settles after the spotter applies this list or a newer one.
   */
  setPronunciations(pronunciations: readonly WakePronunciation[]): Promise<void> {
    const next = new Map(pronunciations.filter(pronunciation => pronunciation.modelId === this.options.modelId).map(pronunciation => [pronunciation.key, pronunciation]))
    const unchanged = next.size === this.pronunciations.size && [...next.keys()].every(key => this.pronunciations.has(key))
    // An owner change keeps the token sequence. The spotter keeps its keywords and the next match reads the new owner.
    this.pronunciations = next
    if (unchanged)
      return this.updates

    // Queued audio and a resolved wake belong to the old keywords.
    this.invalidate()
    this.keywordsReady = false
    const generation = this.generation
    const keywords: KeywordEntry[] = [...next.values()].map(pronunciation => ({ label: pronunciation.key, matches: [{ tokens: [...pronunciation.tokens] }] }))
    const update = this.updates.then(async () => {
      // A newer list or a stop replaced this one while an earlier update ran.
      if (generation !== this.generation || next !== this.pronunciations)
        return

      if (keywords.length === 0) {
        this.options.onPreparationChange?.('unconfigured')
        await this.spotter?.setKeywords([])
        return
      }

      this.options.onPreparationChange?.('preparing')
      try {
        if (this.spotter) {
          await this.spotter.setKeywords(keywords)
        }
        else {
          const spotter = await this.options.createSpotter(keywords)
          if (generation !== this.generation) {
            spotter.dispose()
            return
          }
          this.spotter = spotter
        }
      }
      catch (error) {
        if (generation === this.generation)
          this.options.onPreparationChange?.('error', errorMessageFrom(error) ?? 'Wake word model failed to prepare')
        throw error
      }

      // A keyword update starts a new stream in the Worker.
      this.streamSampleRate = undefined
      this.resetStream = false
      if (generation !== this.generation || next !== this.pronunciations)
        return
      this.keywordsReady = true
      this.options.onPreparationChange?.('ready')
    })
    this.updates = update.catch(() => {})
    return update
  }

  /**
   * Receives each ordered window of the shared input and returns without waiting for the Worker.
   * It returns a target when background recognition resolved a wake since the previous window.
   * A window with an aborted signal leaves that wake for the next window.
   *
   * This method never rejects. A failure of the shared observer callback ends the whole voice activity observation,
   * so recognition failures change the preparation to `error` and target failures go to `onError`.
   */
  async detect(window: AudioWindow, signal: AbortSignal): Promise<WakeTarget | undefined> {
    if (!this.ready) {
      this.clearPending()
      return undefined
    }

    this.collect(window)
    void this.recognize(this.generation)

    const wake = this.wake
    if (!wake || signal.aborted)
      return undefined

    this.wake = undefined
    return wake
  }

  /** Disposes the spotter Worker. Queued recognition and a resolved wake from before the stop return no target. */
  stop() {
    this.invalidate()
    this.spotter?.dispose()
    this.spotter = undefined
    this.keywordsReady = false
    this.pronunciations = new Map()
  }

  /** Adds the window to the current batch, and queues the batch when it is complete. */
  private collect(window: AudioWindow) {
    // A gap or a device change starts a new stream, so audio before it cannot complete a keyword.
    if (window.discontinuity || (this.streamSampleRate !== undefined && this.streamSampleRate !== window.sampleRate)) {
      this.clearPending()
      this.resetStream = true
    }
    this.streamSampleRate = window.sampleRate

    this.pending.push(toMonoSamples(window))
    this.pendingSamples += window.channels[0]?.length ?? 0
    if (this.pendingSamples < window.sampleRate * (this.options.batchMs ?? 100) / 1000)
      return

    const samples = new Float32Array(this.pendingSamples)
    let offset = 0
    for (const part of this.pending) {
      samples.set(part, offset)
      offset += part.length
    }
    this.clearPending()
    this.queue.push({ samples, sampleRate: window.sampleRate, reset: this.resetStream })
    this.resetStream = false

    const backlogMs = this.queue.reduce((total, batch) => total + batch.samples.length * 1000 / batch.sampleRate, 0)
    if (backlogMs > (this.options.maxBacklogMs ?? 1000)) {
      // The Worker is slower than real time. Drop the stale audio and continue from the next batch in a new stream.
      this.queue = []
      this.resetStream = true
    }
  }

  /** Sends queued batches to the Worker in order. One loop runs at a time. */
  private async recognize(generation: number) {
    if (this.recognizing)
      return

    this.recognizing = true
    try {
      while (generation === this.generation && this.queue.length > 0) {
        const spotter = this.spotter
        const batch = this.queue.shift()!
        if (!spotter)
          return
        if (batch.reset)
          await spotter.reset()
        const detections = await spotter.processAudio(batch.samples, batch.sampleRate)
        // A stopped detector or a rebuilt keyword list must not wake a character.
        if (generation !== this.generation)
          return

        const pronunciation = detections
          // The label is a catalog key. A key outside the current catalog belongs to a replaced keyword list.
          .map(detection => this.pronunciations.get(detection.label))
          .find(candidate => candidate !== undefined)
        if (pronunciation)
          await this.resolveWake(pronunciation, generation)
      }
    }
    catch (error) {
      if (generation === this.generation) {
        this.keywordsReady = false
        this.queue = []
        this.options.onPreparationChange?.('error', errorMessageFrom(error) ?? 'Wake word recognition failed')
      }
    }
    finally {
      this.recognizing = false
    }
    // A batch queued while an older generation finished its last Worker call still needs a loop.
    if (generation !== this.generation && this.queue.length > 0)
      void this.recognize(this.generation)
  }

  private async resolveWake(pronunciation: WakePronunciation, generation: number) {
    const signal = this.lifetime.signal
    try {
      const target = await this.options.resolveTarget(pronunciation.characterId, signal)
      if (generation === this.generation && !signal.aborted)
        this.wake = target
    }
    catch (error) {
      if (generation === this.generation && !signal.aborted)
        this.options.onError?.(error)
    }
  }

  /** Ends the current generation. Its queued audio, Worker results, and resolved wake are discarded. */
  private invalidate() {
    this.generation++
    this.lifetime.abort('Wake word detection changed')
    this.lifetime = new AbortController()
    this.clearPending()
    this.queue = []
    this.wake = undefined
    this.streamSampleRate = undefined
    this.resetStream = false
  }

  private clearPending() {
    this.pending = []
    this.pendingSamples = 0
  }
}
