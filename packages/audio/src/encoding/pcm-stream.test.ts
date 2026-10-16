import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { createPushStream } from '@proj-airi/pipelines-audio'
import { expect, it, vi } from 'vitest'

import { Pcm16Encoder } from './pcm-stream'

it('converts stereo PCM incrementally and drains the resampler tail at source completion', async () => {
  const source = createPushStream<PcmBlock>()
  const encoder = new Pcm16Encoder(source.stream, { sampleRate: 16000 })
  const reader = encoder.stream.getReader()
  source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4800 }, sampleRate: 48000, channels: [new Float32Array(4800).fill(0.5), new Float32Array(4800).fill(0.5)] })
  const first = await reader.read()
  expect(first.value!.byteLength).toBeGreaterThan(0)
  let bytes = first.value!.byteLength
  source.close()
  while (true) {
    const result = await reader.read()
    if (result.done)
      break
    bytes += result.value.byteLength
  }
  expect(bytes).toBe(3200)
  const middle = new DataView(first.value!.buffer).getInt16(400, true)
  expect(middle).toBeGreaterThan(16000)
  expect(middle).toBeLessThan(17000)
})

it('cancels only its input stream when the encoded output is cancelled', async () => {
  const cancel = vi.fn()
  const encoder = new Pcm16Encoder(new ReadableStream<PcmBlock>({ cancel }), { sampleRate: 16000 })
  await encoder.stream.cancel('request cancelled')
  expect(cancel).toHaveBeenCalledWith('request cancelled')
})
