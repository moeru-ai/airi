import type { AudioInput, AudioRange, Outcome, PcmBlock, Position } from './audio-input'

import { createPushStream } from './stream'

/** One captured interval. Its owner reads `stream` and decides when the interval ends. */
export interface Capture {
  /** Blocks from the start position until finish, cancellation, or source completion. */
  readonly stream: ReadableStream<PcmBlock>
  /** Resolves true when the first block arrives, or false when the capture ends before any audio. */
  readonly started: Promise<boolean>
  /**
   * Settles once. A finished capture reports the accepted interval.
   * The interval is undefined only when no block arrived and no `from` position fixed its start.
   */
  readonly done: Promise<Outcome<AudioRange | undefined>>
  /** Seals accepted audio now and closes `stream`. Other subscribers of the input continue. */
  finish: () => Promise<Outcome<AudioRange | undefined>>
  /** Discards the capture and errors `stream`. */
  cancel: (reason: string) => void
}

/**
 * Captures one interval from a shared input.
 *
 * `from` replays retained history, so speech that started before detection is included.
 * Source completion finishes the capture. A gap inside the interval fails it, because consumers
 * such as transcription providers treat the stream as continuous audio.
 * When `stream` has more than `maxBufferedMs` of unread audio, the capture fails instead of growing without limit.
 */
export function capture(input: AudioInput, options: {
  from?: Position
  signal?: AbortSignal
  /** @default 60000. Unread audio that `stream` can queue before the capture fails. */
  maxBufferedMs?: number
} = {}): Capture {
  const maxBufferedMs = options.maxBufferedMs ?? 60_000
  if (!Number.isFinite(maxBufferedMs) || maxBufferedMs <= 0)
    throw new Error('Capture buffer duration must be finite and positive')

  const lifetime = new AbortController()
  const completion = Promise.withResolvers<Outcome<AudioRange | undefined>>()
  const started = Promise.withResolvers<boolean>()
  const output = createPushStream<PcmBlock>(
    reason => settle({ status: 'cancelled', reason: typeof reason === 'string' ? reason : 'Capture output cancelled' }),
    { highWaterMark: maxBufferedMs, size: block => (block.range.endFrame - block.range.startFrame) * 1000 / block.sampleRate },
  )
  let range: AudioRange | undefined = options.from && { sourceId: options.from.sourceId, startFrame: options.from.frame, endFrame: options.from.frame }
  let settled = false

  function settle(outcome: Outcome<AudioRange | undefined>) {
    if (settled)
      return

    settled = true
    lifetime.abort(outcome.status === 'finished' ? 'Capture finished' : outcome)
    if (outcome.status === 'finished')
      output.close()
    else
      output.error(outcome.status === 'failed' ? outcome.error : new Error(outcome.reason))
    started.resolve(false)
    completion.resolve(outcome)
  }

  function finish() {
    settle({ status: 'finished', value: range })
    return completion.promise
  }

  options.signal?.addEventListener('abort', () => settle({ status: 'cancelled', reason: 'Capture aborted' }), { once: true, signal: lifetime.signal })
  if (options.signal?.aborted)
    settle({ status: 'cancelled', reason: 'Capture aborted' })

  /** Triggering workflow: input subscription → continuity check → capture output. */
  async function pump() {
    // This loop drains the subscription eagerly, so the capture output is the only queue to bound.
    const reader = input.subscribe({ from: options.from, signal: lifetime.signal }).getReader()
    try {
      // Settlement aborts the lifetime, which also ends the subscription.
      while (!lifetime.signal.aborted) {
        const { done, value: block } = await reader.read()
        if (done || lifetime.signal.aborted)
          break

        if (range && (block.range.sourceId !== range.sourceId || block.range.startFrame !== range.endFrame))
          throw new Error('Audio source has a gap')
        if ((output.desiredSize() ?? 0) < 0)
          throw new Error('Capture reader fell behind')

        range = { sourceId: block.range.sourceId, startFrame: range?.startFrame ?? block.range.startFrame, endFrame: block.range.endFrame }
        started.resolve(true)
        output.write(block)
      }
      void finish()
    }
    catch (cause) {
      settle({ status: 'failed', error: cause instanceof Error ? cause : new Error('Audio capture failed', { cause }) })
    }
    finally {
      reader.releaseLock()
    }
  }

  if (!settled)
    void pump()

  return {
    stream: output.stream,
    started: started.promise,
    done: completion.promise,
    finish,
    cancel: reason => settle({ status: 'cancelled', reason }),
  }
}
