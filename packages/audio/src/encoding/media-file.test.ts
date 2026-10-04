import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { expect, it } from 'vitest'

import { encodeWav, fileSource } from './media-file'

function stereoBlock(startFrame: number, frames: number): PcmBlock {
  return { range: { sourceId: 'mic', startFrame, endFrame: startFrame + frames }, sampleRate: 48000, channels: [new Float32Array(frames).fill(0.5), new Float32Array(frames).fill(0.5)] }
}

it('encodes streamed stereo PCM as 16 kHz mono WAV and decodes it back as a source', async () => {
  const wav = await encodeWav(new ReadableStream({
    start(output) {
      output.enqueue(stereoBlock(0, 2400))
      output.enqueue(stereoBlock(2400, 2400))
      output.close()
    },
  }), { sampleRate: 16000, channels: 1 })

  const samples: number[] = []
  let sampleRate: number | undefined
  let nextFrame = 0
  for await (const block of fileSource(wav).open(new AbortController().signal)) {
    expect(block.range.startFrame).toBe(nextFrame)
    nextFrame = block.range.endFrame
    sampleRate = block.sampleRate
    samples.push(...block.channels[0])
  }

  expect(wav.type).toBe('audio/wav')
  expect(sampleRate).toBe(16000)
  expect(samples).toHaveLength(1600)
  expect(samples[800]).toBeCloseTo(0.5, 3)
})

it('cancels the input stream when encoding is aborted', async () => {
  const controller = new AbortController()
  let cancelled: unknown
  const encoding = encodeWav(new ReadableStream<PcmBlock>({ cancel: reason => void (cancelled = reason) }), { sampleRate: 16000, channels: 1 }, controller.signal)
  controller.abort('Recording discarded')

  await expect(encoding).rejects.toBe('Recording discarded')
  expect(cancelled).toBe('Recording discarded')
})

it('releases the decoder and errors the stream when the connection aborts before a read', async () => {
  const wav = await encodeWav(new ReadableStream({
    start(output) {
      output.enqueue(stereoBlock(0, 2400))
      output.close()
    },
  }), { sampleRate: 16000, channels: 1 })
  const connection = new AbortController()
  const reader = fileSource(wav).open(connection.signal).getReader()
  connection.abort('Device switched')

  await expect(reader.read()).rejects.toBe('Device switched')
})
