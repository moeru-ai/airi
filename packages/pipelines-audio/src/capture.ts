import type { AudioInput, AudioRange, Outcome, PcmBlock, Position } from './audio-input'

import { createPushStream } from './stream'

/** One captured interval. Its owner reads `stream` and decides when the interval ends. */
export interface Capture {
  /** Blocks from the start position until finish, cancellation, or source completion. */
  readonly stream: ReadableStream<PcmBlock>
  /** Resolves when the first block arrives. It never resolves for a capture that ends before audio starts. */
  readonly started: Promise<void>
  /** Settles once. Finished captures report the accepted interval. */
  readonly done: Promise<Outcome<void>>
  /** Seals accepted audio now and closes `stream`. Other subscribers of the input continue. */
  finish: () => Promise<Outcome<void>>
  /** Discards the capture and errors `stream`. */
  cancel: (reason: string) => void
}

/**
 * Captures one interval from a shared input.
 *
 * `from` replays retained history, so speech that started before detection is included.
 * Source completion finishes the capture. A gap inside the interval fails it, because consumers
 * such as transcription providers treat the stream as continuous audio.
 */
export function capture(input: AudioInput, options: { from?: Position, signal?: AbortSignal } = {}): Capture {
  const lifetime = new AbortController()
  const completion = Promise.withResolvers<Outcome<void>>()
  const started = Promise.withResolvers<void>()
  const output = createPushStream<PcmBlock>(reason => settle({ status: 'cancelled', reason: typeof reason === 'string' ? reason : 'Capture output cancelled' }))
  let range: AudioRange | undefined = options.from && { sourceId: options.from.sourceId, startFrame: options.from.frame, endFrame: options.from.frame }
  let settled = false

  function settle(outcome: Outcome<void>) {
    if (settled)
      return

    settled = true
    lifetime.abort(outcome.status === 'finished' ? 'Capture finished' : outcome)
    if (outcome.status === 'finished')
      output.close()
    else
      output.error(outcome.status === 'failed' ? outcome.error : new Error(outcome.reason))
    completion.resolve(outcome)
  }

  function finish() {
    const accepted = range ?? { sourceId: input.position?.sourceId ?? '', startFrame: input.position?.frame ?? 0, endFrame: input.position?.frame ?? 0 }
    settle({ status: 'finished', value: undefined, range: accepted })
    return completion.promise
  }

  options.signal?.addEventListener('abort', () => settle({ status: 'cancelled', reason: 'Capture aborted' }), { once: true, signal: lifetime.signal })
  if (options.signal?.aborted)
    settle({ status: 'cancelled', reason: 'Capture aborted' })

  /** Triggering workflow: input subscription → continuity check → capture output. */
  async function pump() {
    const reader = input.subscribe({ from: options.from, signal: lifetime.signal }).getReader()
    try {
      // Settlement aborts the lifetime, which also ends the subscription.
      while (!lifetime.signal.aborted) {
        const { done, value: block } = await reader.read()
        if (done || lifetime.signal.aborted)
          break

        if (range && (block.range.sourceId !== range.sourceId || block.range.startFrame !== range.endFrame))
          throw new Error('Audio source has a gap')

        range = { sourceId: block.range.sourceId, startFrame: range?.startFrame ?? block.range.startFrame, endFrame: block.range.endFrame }
        started.resolve()
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
