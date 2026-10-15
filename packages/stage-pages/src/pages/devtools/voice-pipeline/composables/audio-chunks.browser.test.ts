import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { describe, expect, it, vi } from 'vitest'

import { microphoneChunks, stopMicrophoneRecordings } from './audio-chunks'

// A microphone that sends 100 ms of silence every 100 ms until its connection closes.
vi.mock('@proj-airi/audio/browser', () => ({
  microphoneSource: () => ({
    open: (signal: AbortSignal) => {
      let timer: ReturnType<typeof setInterval> | undefined
      let start = 0
      return new ReadableStream<PcmBlock>({
        start(controller) {
          timer = setInterval(() => {
            controller.enqueue({ range: { sourceId: 'microphone', startFrame: start, endFrame: start + 1600 }, sampleRate: 16000, channels: [new Float32Array(1600)] })
            start += 1600
          }, 100)
          signal.addEventListener('abort', () => clearInterval(timer), { once: true })
        },
        cancel: () => clearInterval(timer),
      })
    },
  }),
}))

describe('microphoneChunks', () => {
  // Codex review on PR #30: a synced input mode started continuous listening beside a running diagnostic recording.
  it('ends a recording with an error when the page stops all recordings', async () => {
    const recording = (async () => {
      let blocks = 0
      for await (const _ of microphoneChunks(16000, new AbortController().signal)) {
        blocks += 1
        if (blocks === 2)
          stopMicrophoneRecordings('The host listens now.')
      }
    })()

    await expect(recording).rejects.toThrow('The host listens now.')
  })

  it('ends a recording normally when its own signal aborts', async () => {
    const controller = new AbortController()
    let blocks = 0
    for await (const _ of microphoneChunks(16000, controller.signal)) {
      blocks += 1
      if (blocks === 2)
        controller.abort()
    }
    expect(blocks).toBe(2)
  })
})
