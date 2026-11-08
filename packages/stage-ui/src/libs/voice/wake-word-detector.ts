import type { TurnRef } from '@proj-airi/core-agent'
import type { AudioInput, AudioWindow, Observer } from '@proj-airi/pipelines-audio'
import type { KeywordEntry, KeywordSpotter } from '@sherpaw/kws'

import type { WakePronunciation } from './wake-words'

import { errorMessageFrom } from '@moeru/std'
import { observe } from '@proj-airi/pipelines-audio'

import { toMonoSamples } from './mono-samples'

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
  /**
   * Selects the character session after a match. The signal aborts when the observed audio window is abandoned.
   * `pronunciation` is the matched catalog entry, so the caller can trace which word woke the character.
   */
  readonly resolveTarget: (characterId: string, signal: AbortSignal, pronunciation: WakePronunciation) => Promise<WakeTarget>
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
  /**
   * Non-speech that ends the current spotter stream. The next batch starts a new stream.
   *
   * A stream that runs for minutes carries decoder state from earlier noise and speech, and it missed most calls
   * in recorded live speech. A reset in each pause matched the same calls. VAD supplies the speech evidence through
   * {@link WakeWordDetector.take}.
   *
   * @default 500
   */
  readonly resetAfterSilenceMs?: number
  /** Boost and probability threshold of every keyword. Omission uses the spotter defaults. */
  readonly search?: { readonly score?: number, readonly threshold?: number }
  /**
   * Returns extra token sequences that also match a pronunciation, for example tone variants.
   * A sequence that another pronunciation already uses stays with that pronunciation.
   */
  readonly variants?: (tokens: readonly string[]) => readonly (readonly string[])[]
}

/** VAD evidence for the window that the voice activity plugin observed with this call. */
export interface WakeActivity {
  readonly speech: boolean
  readonly durationMs: number
}

/** A complete batch that waits for the Worker. `reset` starts a new stream before this batch. */
interface RecognitionBatch {
  readonly samples: Float32Array
  readonly sampleRate: number
  readonly reset: boolean
}

/**
 * Spots active wake word pronunciations in the windows of an audio input.
 *
 * The detector owns one keyword spotter Worker. It does not own a microphone or an AudioContext.
 * Its input is separate from the VAD input, because browser echo cancellation, noise suppression, and gain
 * change the phones that the keyword model hears. {@link listen} feeds that input, and the voice activity plugin
 * collects each resolved wake with {@link take} on its own windows.
 *
 * Each keyword label is a {@link WakePronunciation.key}. A match maps back to the current catalog,
 * so a pronunciation that changed owner or became inactive during recognition cannot wake a character.
 *
 * Recognition runs off the window path. Each window queues complete batches and returns at once,
 * so a Worker slower than real time cannot make the input observer fall behind.
 * A match resolves its target in the background, and the next {@link take} returns it.
 *
 * State:
 * - `pronunciations` is the latest active catalog for this model. {@link setPronunciations} replaces it.
 * - `spotter` is runtime-loaded state. It exists after the first non-empty catalog prepares.
 * - `queue` holds batches for the Worker. `wake` holds a resolved target until {@link take} returns it.
 * - `silenceMs` counts VAD non-speech. A pause starts a new spotter stream at the next batch.
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
  /** Non-speech since the last VAD speech. A reset happens once per pause. */
  private silenceMs = 0

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
    const keywords = this.keywordsOf([...next.values()])
    const update = this.updates.then(async () => {
      // A newer list or a stop replaced this one while an earlier update ran.
      // An equal list replaces `pronunciations` without a new generation, so only the generation tells a newer list.
      if (generation !== this.generation)
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
      if (generation !== this.generation)
        return
      this.keywordsReady = true
      this.options.onPreparationChange?.('ready')
    })
    this.updates = update.catch(() => {})
    return update
  }

  /**
   * Feeds the ordered windows of `input` to recognition until `signal` aborts.
   *
   * The detector does not own the input. The caller selects it and starts a new listen after a device change.
   * A listen that replaces an earlier one is allowed, and the windows of both reach the same stream until the
   * caller aborts the earlier one. Recognition never blocks the input, because each window only queues audio.
   */
  listen(input: AudioInput, signal: AbortSignal): Observer {
    return observe(input, { windowMs: this.options.batchMs ?? 100, hopMs: this.options.batchMs ?? 100, scheduling: 'ordered', signal }, async (window) => {
      this.accept(window)
    }, () => {})
  }

  /**
   * Returns a target when background recognition resolved a wake since the previous call.
   * A call with an aborted signal leaves that wake for the next call.
   *
   * The voice activity plugin calls this for each of its windows and passes its VAD result as `activity`,
   * so a pause can start a new spotter stream. This method never rejects.
   */
  take(signal: AbortSignal, activity?: WakeActivity): WakeTarget | undefined {
    if (activity)
      this.noteActivity(activity)

    const wake = this.wake
    if (!wake || signal.aborted)
      return undefined

    this.wake = undefined
    return wake
  }

  private noteActivity(activity: WakeActivity) {
    if (activity.speech) {
      this.silenceMs = 0
      return
    }

    const before = this.silenceMs
    this.silenceMs += activity.durationMs
    const limit = this.options.resetAfterSilenceMs ?? 500
    // Only the call that crosses the limit resets, so a long pause does not restart the stream on every window.
    if (before < limit && this.silenceMs >= limit) {
      this.clearPending()
      this.resetStream = true
    }
  }

  /**
   * Queues one window for recognition without waiting for the Worker.
   *
   * Recognition failures change the preparation to `error` and target failures go to `onError`, so a failure
   * never ends the observation of the input.
   */
  private accept(window: AudioWindow) {
    if (!this.ready) {
      this.clearPending()
      return
    }

    this.collect(window)
    void this.recognize(this.generation)
  }

  /**
   * Builds one keyword for each pronunciation. The label is the catalog key, so a match maps back to its owner.
   * Sherpa-ONNX requires unique token sequences, so a variant that equals any sequence before it is skipped.
   * Card pronunciations claim their sequences before any variant does.
   */
  private keywordsOf(pronunciations: readonly WakePronunciation[]): KeywordEntry[] {
    const claimed = new Set(pronunciations.map(pronunciation => pronunciation.tokens.join(' ')))
    return pronunciations.map((pronunciation) => {
      const variants = (this.options.variants?.(pronunciation.tokens) ?? []).filter((tokens) => {
        const sequence = tokens.join(' ')
        if (claimed.has(sequence))
          return false
        claimed.add(sequence)
        return true
      })
      return {
        label: pronunciation.key,
        ...this.options.search,
        matches: [pronunciation.tokens, ...variants].map(tokens => ({ tokens: [...tokens] })),
      }
    })
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
      const target = await this.options.resolveTarget(pronunciation.characterId, signal, pronunciation)
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
