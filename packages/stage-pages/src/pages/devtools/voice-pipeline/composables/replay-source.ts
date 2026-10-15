import type { LiveAudioSource, PcmBlock } from '@proj-airi/pipelines-audio'

/** One block each 100 ms, like a microphone that delivers audio in real time. */
const BLOCK_MS = 100

export interface ReplaySource extends LiveAudioSource {
  /**
   * Resolves when the last clip block was delivered. Silence follows until the reader leaves.
   * It also resolves when the reader leaves before the clip ends, because the clip does not play further then.
   */
  readonly clipEnded: Promise<void>
}

/**
 * Plays `samples` as a live microphone: one block of 100 ms each 100 ms, then silence until the reader leaves.
 *
 * The silence lets voice activity detection see the end of speech, as it does after a person stops talking.
 * Each open call is one connection with a new source ID. An abort of its signal closes the stream.
 */
export function createReplaySource(samples: Float32Array, sampleRate: number): ReplaySource {
  const clipEnded = Promise.withResolvers<void>()
  const blockFrames = Math.round(sampleRate * BLOCK_MS / 1000)

  function open(signal: AbortSignal): ReadableStream<PcmBlock> {
    const sourceId = `replay-${crypto.randomUUID()}`
    const startedAt = performance.now()
    let frame = 0

    return new ReadableStream<PcmBlock>({
      pull: async (controller) => {
        const dueAt = startedAt + frame / sampleRate * 1000
        await new Promise(resolve => setTimeout(resolve, Math.max(0, dueAt - performance.now())))
        if (signal.aborted) {
          controller.close()
          clipEnded.resolve()
          return
        }

        const block = frame < samples.length
          ? samples.slice(frame, frame + blockFrames)
          : new Float32Array(blockFrames)
        controller.enqueue({ range: { sourceId, startFrame: frame, endFrame: frame + block.length }, sampleRate, channels: [block] })
        frame += block.length
        if (frame >= samples.length)
          clipEnded.resolve()
      },
    })
  }

  return { live: true, open, clipEnded: clipEnded.promise }
}
