import type { AudioInput, AudioRange, Outcome, PcmBlock } from './audio-input'

import { createScope } from './scope'

/** A gap discards overlap. Each detector receives its own sample arrays. */
export interface AudioWindow extends PcmBlock {
  readonly discontinuity: boolean
}

/** Window size and hop are in milliseconds of source audio. */
export interface WindowShape {
  readonly windowMs: number
  readonly hopMs: number
  /** Start with this much audio, then grow each window until windowMs. Omission starts with a full window. */
  readonly minWindowMs?: number
}

/** Window scheduling affects pending inference, not the shared audio source. */
export interface WindowOptions extends WindowShape {
  /** @default latest. Keep active inference and replace only pending windows. */
  readonly scheduling?: 'latest' | 'ordered'
  readonly signal?: AbortSignal
  /** Retain this interval before each pending window until its inference and result callback complete. */
  readonly preRollMs?: number
  /** @default 60000. With `ordered` scheduling, the observer fails when its pending windows span more audio than this. */
  readonly maxBufferedMs?: number
}

/** Evidence retains source coordinates after asynchronous inference. */
export interface Observation<T> {
  readonly range: AudioRange
  readonly value: T
  readonly discontinuity: boolean
}

/**
 * Cancellation closes publication immediately, even when inference ignores abort.
 * `done` finishes when the source ends and the last window has been processed.
 */
export interface Observer {
  readonly done: Promise<Outcome>
  cancel: (reason: string) => void
}

/** Model implementation and allocation remain the plugin author's responsibility. */
export type Detector<T> = (window: AudioWindow, signal: AbortSignal) => Promise<T>

function validateShape(shape: WindowShape) {
  if (!Number.isFinite(shape.windowMs) || shape.windowMs <= 0 || !Number.isFinite(shape.hopMs) || shape.hopMs <= 0)
    throw new Error('Audio window and hop must be finite and positive')
  if (shape.minWindowMs !== undefined && (!Number.isFinite(shape.minWindowMs) || shape.minWindowMs <= 0 || shape.minWindowMs > shape.windowMs))
    throw new Error('Initial window must be positive and no longer than the full window')
}

/**
 * Slices a block stream into sliding windows.
 *
 * The first window can start at `minWindowMs` and grows by one hop until `windowMs`.
 * A source gap restarts growth and marks the next window as discontinuous.
 */
export function audioWindows(shape: WindowShape): TransformStream<PcmBlock, AudioWindow> {
  validateShape(shape)
  const blocks: PcmBlock[] = []
  let firstFrame = 0
  let nextEnd: number | undefined
  let lastFrame: number | undefined
  let discontinuity = false

  return new TransformStream({
    transform(block, output) {
      if (lastFrame !== undefined && lastFrame !== block.range.startFrame) {
        blocks.length = 0
        nextEnd = undefined
        discontinuity = true
      }
      lastFrame = block.range.endFrame
      blocks.push(block)
      const frames = (ms: number) => Math.max(1, Math.round(ms * block.sampleRate / 1000))
      const length = frames(shape.windowMs)
      if (nextEnd === undefined) {
        firstFrame = block.range.startFrame
        nextEnd = firstFrame + frames(shape.minWindowMs ?? shape.windowMs)
      }

      for (; nextEnd <= block.range.endFrame; nextEnd += frames(shape.hopMs)) {
        const end = nextEnd
        const start = Math.max(firstFrame, end - length)
        const channels = block.channels.map(() => new Float32Array(end - start))
        for (const part of blocks) {
          const partStart = Math.max(start, part.range.startFrame)
          const partEnd = Math.min(end, part.range.endFrame)
          if (partEnd > partStart)
            part.channels.forEach((channel, index) => channels[index].set(channel.subarray(partStart - part.range.startFrame, partEnd - part.range.startFrame), partStart - start))
        }
        output.enqueue({ range: { sourceId: block.range.sourceId, startFrame: start, endFrame: end }, sampleRate: block.sampleRate, channels, discontinuity })
        discontinuity = false
      }

      while (blocks.length && blocks[0].range.endFrame <= Math.max(firstFrame, nextEnd - length))
        blocks.shift()
    },
  })
}

/**
 * Runs a detector over windows of a shared input.
 *
 * `ordered` processes every window in order. `latest` keeps the active inference and replaces
 * the pending window, while keeping any gap flag that the replaced windows carried.
 * With `preRollMs`, the input keeps history before the oldest window that is still in flight,
 * so a detection result can start a capture before that window.
 */
export function observe<T>(input: AudioInput, options: WindowOptions, detector: Detector<T>, onResult: (result: Observation<T>) => void): Observer {
  validateShape(options)
  if (options.preRollMs !== undefined && (!Number.isFinite(options.preRollMs) || options.preRollMs < 0))
    throw new Error('Pre-roll duration must be finite and nonnegative')
  const maxBufferedMs = options.maxBufferedMs ?? 60_000
  if (!Number.isFinite(maxBufferedMs) || maxBufferedMs <= 0)
    throw new Error('Observer buffer duration must be finite and positive')

  const scope = createScope(options.signal)
  const completion = Promise.withResolvers<Outcome>()
  const pending: AudioWindow[] = []
  let active: AudioWindow | undefined
  let latestWindow: AudioWindow | undefined
  let running = false
  let sourceEnded = false

  function settle(outcome: Outcome) {
    completion.resolve(outcome)
    void scope.close(outcome)
  }
  scope.defer(() => {
    pending.length = 0
    const reason = scope.signal.reason
    completion.resolve({ status: 'cancelled', reason: typeof reason === 'string' ? reason : 'Observer closed' })
  })

  // Blocks reach this observer asynchronously. Until its first window exists, the lease holds the
  // connection from its start. After that, it holds history before the oldest window in flight, or
  // before the latest window when idle.
  const lease = options.preRollMs === undefined ? undefined : input.retain(scope.signal)
  function holdPreRoll() {
    const oldest = active ?? pending[0] ?? latestWindow
    if (lease && oldest)
      lease.hold({ sourceId: oldest.range.sourceId, frame: oldest.range.startFrame - Math.round(options.preRollMs! * oldest.sampleRate / 1000) })
  }

  async function drain() {
    if (running)
      return

    running = true
    try {
      while (pending.length && !scope.signal.aborted) {
        active = pending.shift()!
        const value = await detector(active, scope.signal)
        if (!scope.signal.aborted)
          onResult({ range: active.range, discontinuity: active.discontinuity, value })
        active = undefined
        holdPreRoll()
      }
      if (sourceEnded && !scope.signal.aborted)
        settle({ status: 'finished', value: undefined })
    }
    catch (cause) {
      settle({ status: 'failed', error: cause instanceof Error ? cause : new Error('Audio detector failed', { cause }) })
    }
    finally {
      active = undefined
      running = false
    }
  }

  async function read() {
    const reader = input.subscribe({ signal: scope.signal }).pipeThrough(audioWindows(options)).getReader()
    try {
      while (!scope.signal.aborted) {
        const { done, value: window } = await reader.read()
        if (done)
          break

        latestWindow = window
        if (options.scheduling === 'ordered') {
          pending.push(window)
          // Pending windows overlap, so the backlog is the audio between the oldest pending start and the newest end.
          const backlogMs = (window.range.endFrame - pending[0].range.startFrame) * 1000 / window.sampleRate
          if (pending[0].range.sourceId === window.range.sourceId && backlogMs > maxBufferedMs)
            throw new Error('Audio detector fell behind')
        }
        else {
          // A replaced window can carry the only gap flag that inference has not seen yet.
          const gap = window.discontinuity || pending.some(item => item.discontinuity)
          pending.splice(0, pending.length, gap === window.discontinuity ? window : { ...window, discontinuity: gap })
        }
        holdPreRoll()
        void drain()
      }
      sourceEnded = true
      if (!running && !scope.signal.aborted)
        settle({ status: 'finished', value: undefined })
    }
    catch (cause) {
      settle({ status: 'failed', error: cause instanceof Error ? cause : new Error('Audio source failed', { cause }) })
    }
  }

  if (!scope.signal.aborted)
    void read()

  return { done: completion.promise, cancel: reason => void scope.close(reason) }
}
