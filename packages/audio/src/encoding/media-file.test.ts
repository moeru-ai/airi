import type { AudioInput, PcmBlock } from '@proj-airi/pipelines-audio'

import { AudioSample, AudioSampleSource } from 'mediabunny'
import { expect, expectTypeOf, it, vi } from 'vitest'

import { encodeWav, fileSource, streamSource } from './media-file'
import { toWavFromPCM16 } from './wav'

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

// https://github.com/moeru-ai/airi/pull/2769#discussion_r4180881988
it('cannot be shared through AudioInput, because its reader sets the decode speed', () => {
  expectTypeOf(fileSource).returns.not.toExtend<ConstructorParameters<typeof AudioInput>[0]>()
})

// Mediabunny closes a sample only when it resamples. Input at the output rate kept its samples open until garbage
// collection, and the browser logged "An AudioSample was garbage collected without first being closed".
it('closes each audio sample when the input already has the output sample rate', async () => {
  const close = vi.spyOn(AudioSample.prototype, 'close')
  const add = vi.spyOn(AudioSampleSource.prototype, 'add')
  try {
    const block = (startFrame: number): PcmBlock => ({ range: { sourceId: 'mic', startFrame, endFrame: startFrame + 1600 }, sampleRate: 16000, channels: [new Float32Array(1600).fill(0.5)] })
    await encodeWav(new ReadableStream({
      start(output) {
        output.enqueue(block(0))
        output.enqueue(block(1600))
        output.close()
      },
    }), { sampleRate: 16000, channels: 1 })

    const added = add.mock.calls.map(([sample]) => sample)
    expect(added).toHaveLength(2)
    expect(added.every(sample => close.mock.contexts.includes(sample))).toBe(true)
  }
  finally {
    close.mockRestore()
    add.mockRestore()
  }
})

/** A WAV as speech providers stream it: the RIFF and data sizes are placeholders, and bytes arrive in small chunks. */
function streamedWavBody(samples: number[], sampleRate: number, chunkBytes: number): ReadableStream<Uint8Array> {
  const pcm = new Uint8Array(samples.length * 2)
  const pcmView = new DataView(pcm.buffer)
  samples.forEach((value, index) => pcmView.setInt16(index * 2, value, true))
  const wav = new Uint8Array(toWavFromPCM16(pcm, sampleRate, 1))
  new DataView(wav.buffer).setUint32(4, 0xFF_FF_FF_FF, true)
  new DataView(wav.buffer).setUint32(40, 0xFF_FF_FF_FF, true)
  return new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < wav.length; offset += chunkBytes)
        controller.enqueue(wav.slice(offset, offset + chunkBytes))
      controller.close()
    },
  })
}

it('decodes a streamed WAV body with placeholder sizes into continuous PCM blocks', async () => {
  const values = Array.from({ length: 4800 }, (_, index) => (index % 2 === 0 ? 16384 : -16384))

  const samples: number[] = []
  let nextFrame = 0
  let sampleRate: number | undefined
  for await (const block of streamSource(streamedWavBody(values, 24000, 333)).open(new AbortController().signal)) {
    expect(block.range.startFrame).toBe(nextFrame)
    nextFrame = block.range.endFrame
    sampleRate = block.sampleRate
    samples.push(...block.channels[0])
  }

  expect(sampleRate).toBe(24000)
  expect(samples).toHaveLength(4800)
  expect(samples[0]).toBeCloseTo(0.5, 3)
  expect(samples[1]).toBeCloseTo(-0.5, 3)
})

it('cancels the body when the decoded stream is cancelled', async () => {
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({ pull() {}, cancel })

  const stream = streamSource(body).open(new AbortController().signal)
  await stream.cancel('playback stopped')

  await vi.waitFor(() => expect(cancel).toHaveBeenCalled())
})

