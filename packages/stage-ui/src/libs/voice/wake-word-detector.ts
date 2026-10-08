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
 * State:
 * - `pronunciations` is the latest active catalog for this model. {@link setPronunciations} replaces it.
 * - `spotter` is runtime-loaded state. It exists after the first non-empty catalog prepares.
 * - `generation` changes on {@link stop}. Work from an older generation discards its result.
 */
export class WakeWordDetector {
  private pronunciations = new Map<string, WakePronunciation>()
  private spotter?: KeywordSpotter
  private keywordsReady = false
  /** Serializes spotter creation and keyword replacement, so the Worker receives the newest list last. */
  private updates: Promise<void> = Promise.resolve()
  private generation = 0
  private pending: Float32Array[] = []
  private pendingSamples = 0
  /** Sherpa-ONNX resamples to the model rate internally, but the rate must stay constant within one stream. */
  private streamSampleRate?: number

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

    this.keywordsReady = false
    this.clearPending()
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

      this.streamSampleRate = undefined
      if (generation !== this.generation || next !== this.pronunciations)
        return
      this.keywordsReady = true
      this.options.onPreparationChange?.('ready')
    })
    this.updates = update.catch(() => {})
    return update
  }

  /**
   * Receives each ordered window of the shared input. It returns a target only for the window that completes a batch
   * with a match. A window that only fills the batch, or arrives before the spotter is ready, returns undefined at once.
   *
   * This method never rejects. A failure of the shared observer callback ends the whole voice activity observation,
   * so recognition failures change the preparation to `error` and target failures go to `onError`.
   */
  async detect(window: AudioWindow, signal: AbortSignal): Promise<WakeTarget | undefined> {
    const spotter = this.spotter
    if (!spotter || !this.ready) {
      this.clearPending()
      return undefined
    }

    const generation = this.generation
    const detections = await this.recognize(spotter, window).catch((error: unknown) => {
      if (generation === this.generation) {
        this.keywordsReady = false
        this.options.onPreparationChange?.('error', errorMessageFrom(error) ?? 'Wake word recognition failed')
      }
      return undefined
    })

    // A stopped detector or an abandoned window must not wake a character.
    if (!detections || generation !== this.generation || signal.aborted)
      return undefined

    for (const detection of detections) {
      // The label is a catalog key. A key outside the current catalog belongs to a replaced keyword list.
      const pronunciation = this.pronunciations.get(detection.label)
      if (!pronunciation)
        continue

      try {
        const target = await this.options.resolveTarget(pronunciation.characterId, signal)
        if (generation !== this.generation || signal.aborted)
          return undefined

        return target
      }
      catch (error) {
        if (!signal.aborted && generation === this.generation)
          this.options.onError?.(error)
        return undefined
      }
    }

    return undefined
  }

  /** Disposes the spotter Worker. Pending recognition from before the stop returns no target. */
  stop() {
    this.generation++
    this.clearPending()
    this.spotter?.dispose()
    this.spotter = undefined
    this.keywordsReady = false
    this.streamSampleRate = undefined
    this.pronunciations = new Map()
  }

  /** Collects the window into the current batch. It sends a complete batch to the spotter and returns its detections. */
  private async recognize(spotter: KeywordSpotter, window: AudioWindow) {
    // A gap or a device change starts a new stream, so audio before it cannot complete a keyword.
    if (window.discontinuity || (this.streamSampleRate !== undefined && this.streamSampleRate !== window.sampleRate)) {
      this.clearPending()
      this.streamSampleRate = undefined
      await spotter.reset()
    }

    this.pending.push(toMonoSamples(window))
    this.pendingSamples += window.channels[0]?.length ?? 0
    if (this.pendingSamples < window.sampleRate * (this.options.batchMs ?? 100) / 1000)
      return []

    const batch = new Float32Array(this.pendingSamples)
    let offset = 0
    for (const samples of this.pending) {
      batch.set(samples, offset)
      offset += samples.length
    }
    this.clearPending()
    this.streamSampleRate = window.sampleRate
    return spotter.processAudio(batch, window.sampleRate)
  }

  private clearPending() {
    this.pending = []
    this.pendingSamples = 0
  }
}
