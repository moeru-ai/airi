import type { LiveAudioSource, PcmBlock } from '@proj-airi/pipelines-audio'

import { VoiceController } from '@proj-airi/core-agent'
import { Playback } from '@proj-airi/pipelines-audio'
import { createPushStream } from '@proj-airi/stream-kit'
import { describe, expect, it } from 'vitest'

import { createSpeechOutputLevelPlugin } from './speech-output-level-plugin'

describe('createSpeechOutputLevelPlugin', () => {
  it('observes the played speech only while a response voices, then publishes 0', async () => {
    let opened = 0
    let pushed: ReturnType<typeof createPushStream<PcmBlock>> | undefined
    const output: LiveAudioSource = {
      live: true,
      open: (signal) => {
        opened += 1
        pushed = createPushStream<PcmBlock>()
        signal.addEventListener('abort', () => pushed?.close(), { once: true })
        return pushed.stream
      },
    }
    const played = Promise.withResolvers<{ throughMs: number }>()
    const playback = new Playback({
      nowMs: () => 0,
      play: (clip) => {
        clip.onStart?.()
        return { done: played.promise, stop: async () => ({ throughMs: 0 }) }
      },
      output,
    })
    const controller = new VoiceController({ playback, speech: () => ({ playback, synthesize: async () => new Blob(['speech']) }) })
    const levels: number[] = []
    controller.use(createSpeechOutputLevelPlugin({ onLevel: level => levels.push(level) }))

    const response = controller.openResponse({ sessionId: 'alice', turnId: 'level' })
    expect(opened).toBe(0)

    const speech = response.openSpeech({ purpose: 'answer' })
    speech.write('Hello.')
    speech.end()
    await expect.poll(() => opened).toBe(1)
    pushed!.write({ range: { sourceId: 'speech', startFrame: 0, endFrame: 50 }, sampleRate: 1000, channels: [new Float32Array(50).fill(1)] })
    await expect.poll(() => levels).toEqual([1])

    played.resolve({ throughMs: 1 })
    await response.finish()
    await expect.poll(() => levels).toEqual([1, 0])
    await controller.close()
  })
})
