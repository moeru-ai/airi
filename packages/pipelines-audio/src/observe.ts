import type { AudioInput, AudioRange, PcmBlock } from './audio-input'

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

  const scope = createScope(options.signal)
  const completion = Promise.withResolvers<Awaited<Observer['done']>>()
  const pending: AudioWindow[] = []
  let active: AudioWindow | undefined
  let latestWindow: AudioWindow | undefined
  let running = false

  function settle(outcome: Awaited<Observer['done']>) {
    completion.resolve(outcome)
    void scope.close(outcome)
  }
  scope.defer(() => {
    pending.length = 0
    completion.resolve({ status: 'cancelled' })
  })

  if (options.preRollMs !== undefined) {
    const preRollMs = options.preRollMs
    // Blocks reach this observer asynchronously. Until its first window exists, keep everything it has not seen.
    // After that, keep history before the oldest window in flight, or before the latest window when idle.
    input.retain(() => {
      const oldest = active ?? pending[0] ?? latestWindow
      return oldest ? oldest.range.startFrame - Math.round(preRollMs * oldest.sampleRate / 1000) : Number.NEGATIVE_INFINITY
    }, scope.signal)
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
      }
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
        }
        else {
          // A replaced window can carry the only gap flag that inference has not seen yet.
          const gap = window.discontinuity || pending.some(item => item.discontinuity)
          pending.splice(0, pending.length, gap === window.discontinuity ? window : { ...window, discontinuity: gap })
        }
        void drain()
      }
      settle({ status: 'cancelled' })
    }
    catch (cause) {
      settle({ status: 'failed', error: cause instanceof Error ? cause : new Error('Audio source failed', { cause }) })
    }
  }

  if (!scope.signal.aborted)
    void read()

  return { done: completion.promise, cancel: () => void scope.close('Observer cancelled') }
}
