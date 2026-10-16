import type { LiveAudioSource, PcmBlock } from '@proj-airi/pipelines-audio'

import { AudioInput, createPushStream } from '@proj-airi/pipelines-audio'
import { describe, expect, it } from 'vitest'

import { observeInputLevel } from './input-level'

function pushSource() {
  let pushed: ReturnType<typeof createPushStream<PcmBlock>> | undefined
  const source: LiveAudioSource = {
    live: true,
    open: () => {
      pushed = createPushStream<PcmBlock>()
      return pushed.stream
    },
  }
  let frame = 0
  return {
    input: new AudioInput(source),
    write(value: number, frames = 50) {
      pushed!.write({ range: { sourceId: 'mic', startFrame: frame, endFrame: frame + frames }, sampleRate: 1000, channels: [new Float32Array(frames).fill(value)] })
      frame += frames
    },
  }
}

describe('observeInputLevel', () => {
  it('maps silence to 0, -30 dBFS to 0.5, and full scale to 1', async () => {
    const mic = pushSource()
    const abort = new AbortController()
    const levels: number[] = []
    observeInputLevel(mic.input, abort.signal, level => levels.push(level))

    mic.write(0)
    mic.write(10 ** (-30 / 20))
    mic.write(1)

    await expect.poll(() => levels.length).toBe(3)
    expect(levels[0]).toBe(0)
    expect(levels[1]).toBeCloseTo(0.5)
    expect(levels[2]).toBe(1)
    abort.abort()
  })

  it('stops publishing after the signal aborts', async () => {
    const mic = pushSource()
    const abort = new AbortController()
    const levels: number[] = []
    const observer = observeInputLevel(mic.input, abort.signal, level => levels.push(level))
    mic.write(1)
    await expect.poll(() => levels.length).toBe(1)

    abort.abort()
    await observer.done

    expect(levels).toEqual([1])
  })
})
