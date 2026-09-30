import type { AudioRange, PcmBlock } from './audio-input'

/** A gap discards overlap. Each detector receives its own sample arrays. */
export interface AudioWindow extends PcmBlock {
  readonly discontinuity: boolean
}

/** Window scheduling affects pending inference, not the shared audio source. */
export interface WindowOptions {
  readonly windowMs: number
  readonly hopMs: number
  /** Start with this much audio, then grow each window until windowMs. Omission starts with a full window. */
  readonly minWindowMs?: number
  /** @default latest. Keep active inference and replace only pending windows. */
  readonly scheduling?: 'latest' | 'ordered'
  readonly signal?: AbortSignal
  /** Retain this interval before each window until its inference and result callback complete. No inference deadline is imposed. */
  readonly preRollMs?: number
}

/** Evidence retains source coordinates after asynchronous inference. */
export interface Observation<T> {
  readonly range: AudioRange
  readonly value: T
  readonly discontinuity: boolean
}

/** Cancellation closes publication immediately, even when inference ignores abort. */
export interface Observer {
  readonly done: Promise<{ status: 'cancelled' } | { status: 'failed', error: Error }>
  cancel: () => void
}

/** Model implementation and allocation remain the plugin author's responsibility. */
export type Detector<T> = (window: AudioWindow, signal: AbortSignal) => Promise<T>

/** Internal observation owner. AudioInput supplies blocks and owns source shutdown. */
export class AudioObserver<T> implements Observer {
  private readonly completion = Promise.withResolvers<{ status: 'cancelled' } | { status: 'failed', error: Error }>()
  private readonly abort = new AbortController()
  private readonly blocks: PcmBlock[] = []
  private readonly pending: AudioWindow[] = []
  private nextEnd: number | undefined
  private firstFrame = 0
  private lastFrame: number | undefined
  private discontinuity = false
  private running = false
  private activeWindow: AudioWindow | undefined
  private sampleRate: number | undefined
  private closed = false
  readonly done = this.completion.promise

  constructor(private readonly options: WindowOptions, private readonly detector: Detector<T>, private readonly onResult: (result: Observation<T>) => void) {
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0 || !Number.isFinite(options.hopMs) || options.hopMs <= 0)
      throw new Error('Audio window and hop must be finite and positive')
    if (options.minWindowMs !== undefined && (!Number.isFinite(options.minWindowMs) || options.minWindowMs <= 0 || options.minWindowMs > options.windowMs))
      throw new Error('Initial window must be positive and no longer than the full window')
    if (options.preRollMs !== undefined && (!Number.isFinite(options.preRollMs) || options.preRollMs < 0))
      throw new Error('Pre-roll duration must be finite and nonnegative')
    const abort = () => this.cancel()
    options.signal?.addEventListener('abort', abort, { once: true })
    void this.done.then(() => options.signal?.removeEventListener('abort', abort))
    if (options.signal?.aborted)
      this.cancel()
  }

  /** The source retains windows still awaiting inference, plus the next window under construction. */
  get retainedFrom(): number | undefined {
    if (this.closed || this.options.preRollMs === undefined || !this.sampleRate)
      return undefined
    const nextStart = Math.max(this.firstFrame, (this.nextEnd ?? this.firstFrame) - Math.round(this.options.windowMs * this.sampleRate / 1000))
    const first = Math.min(nextStart, this.activeWindow?.range.startFrame ?? Infinity, this.pending[0]?.range.startFrame ?? Infinity)
    return Math.max(0, first - Math.round(this.options.preRollMs * this.sampleRate / 1000))
  }

  /** Triggering workflow: AudioInput source read → accepted PCM block → detector window → result callback. */
  push(block: PcmBlock) {
    if (this.closed)
      return
    if (this.lastFrame !== undefined && this.lastFrame !== block.range.startFrame) {
      this.blocks.length = 0
      this.nextEnd = undefined
      this.discontinuity = true
    }
    this.lastFrame = block.range.endFrame
    this.sampleRate = block.sampleRate
    this.blocks.push(block)
    const length = Math.max(1, Math.round(this.options.windowMs * block.sampleRate / 1000))
    const hop = Math.max(1, Math.round(this.options.hopMs * block.sampleRate / 1000))
    if (this.nextEnd === undefined) {
      this.firstFrame = block.range.startFrame
      this.nextEnd = this.firstFrame + Math.max(1, Math.round((this.options.minWindowMs ?? this.options.windowMs) * block.sampleRate / 1000))
    }
    while (this.nextEnd <= block.range.endFrame) {
      const end = this.nextEnd
      const start = Math.max(this.firstFrame, end - length)
      const channels = block.channels.map(() => new Float32Array(end - start))
      for (const part of this.blocks) {
        const partStart = Math.max(start, part.range.startFrame)
        const partEnd = Math.min(end, part.range.endFrame)
        if (partEnd <= partStart)
          continue
        part.channels.forEach((channel, index) => channels[index].set(channel.subarray(partStart - part.range.startFrame, partEnd - part.range.startFrame), partStart - start))
      }
      const window: AudioWindow = {
        range: { sourceId: block.range.sourceId, startFrame: start, endFrame: end },
        sampleRate: block.sampleRate,
        channels,
        // A coalesced window must retain a gap that inference has not received yet.
        discontinuity: this.discontinuity || (this.options.scheduling !== 'ordered' && this.pending.some(window => window.discontinuity)),
      }
      this.discontinuity = false
      if (this.options.scheduling !== 'ordered')
        this.pending.length = 0
      this.pending.push(window)
      void this.run()
      this.nextEnd += hop
    }
    while (this.blocks[0]?.range.endFrame <= Math.max(this.firstFrame, this.nextEnd - length))
      this.blocks.shift()
  }

  cancel() {
    this.settle({ status: 'cancelled' })
  }

  fail(error: Error) {
    this.settle({ status: 'failed', error })
  }

  private settle(outcome: { status: 'cancelled' } | { status: 'failed', error: Error }) {
    if (this.closed)
      return
    this.closed = true
    this.abort.abort()
    this.pending.length = 0
    this.blocks.length = 0
    this.completion.resolve(outcome)
  }

  private async run() {
    if (this.running || this.closed)
      return
    this.running = true
    try {
      while (this.pending.length && !this.closed) {
        const window = this.pending.shift()!
        this.activeWindow = window
        const value = await this.detector(window, this.abort.signal)
        if (!this.closed)
          this.onResult({ range: window.range, discontinuity: window.discontinuity, value })
      }
    }
    catch (cause) {
      this.fail(cause instanceof Error ? cause : new Error('Audio detector failed', { cause }))
    }
    finally {
      this.activeWindow = undefined
      this.running = false
    }
  }
}
