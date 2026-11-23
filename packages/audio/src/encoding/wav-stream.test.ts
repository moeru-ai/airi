import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { describe, expect, it } from 'vitest'

import { toWavFromPCM16 } from './wav'
import { decodeWavStream, readWavHeader } from './wav-stream'

function pcm16(values: number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2)
  const view = new DataView(bytes.buffer)
  values.forEach((value, index) => view.setInt16(index * 2, value, true))
  return bytes
}

function chunksOf(bytes: Uint8Array, sizes: number[]): ReadableStream<Uint8Array> {
  const parts: Uint8Array[] = []
  let at = 0
  for (const size of sizes) {
    parts.push(bytes.slice(at, at + size))
    at += size
  }
  if (at < bytes.length)
    parts.push(bytes.slice(at))
  return new ReadableStream({
    start(controller) {
      parts.forEach(part => controller.enqueue(part))
      controller.close()
    },
  })
}

async function readAll(stream: ReadableStream<PcmBlock>): Promise<PcmBlock[]> {
  const blocks: PcmBlock[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      return blocks
    blocks.push(value)
  }
}

/** A streamed WAV whose RIFF and data sizes are placeholders, as providers send them. */
function streamedWav(samples: Uint8Array, sampleRate: number, channels: number): Uint8Array {
  const wav = new Uint8Array(toWavFromPCM16(samples, sampleRate, channels))
  const view = new DataView(wav.buffer)
  view.setUint32(4, 0xFF_FF_FF_FF, true)
  view.setUint32(40, 0xFF_FF_FF_FF, true)
  return wav
}

describe('readWavHeader', () => {
  /**
   * @example
   * readWavHeader(firstBytes) // { format: { channels: 1, sampleRate: 44100 }, dataOffset: 44 }
   */
  it('reads the format and the data offset of a streamed WAV', () => {
    const wav = streamedWav(pcm16([1, 2]), 44100, 1)

    expect(readWavHeader(wav)).toEqual({ format: { channels: 1, sampleRate: 44100 }, dataOffset: 44 })
    expect(readWavHeader(wav.subarray(0, 30))).toBeUndefined()
  })

  it('rejects audio that is not WAV', () => {
    expect(readWavHeader(new TextEncoder().encode('ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000'))).toBeNull()
  })
})

describe('decodeWavStream', () => {
  it('decodes chunks split inside the header and inside samples into continuous blocks', async () => {
    const samples = pcm16([0, 16384, -16384, 32767, -32768, 8192])
    const wav = streamedWav(samples, 24000, 1)

    const blocks = await readAll(decodeWavStream(chunksOf(wav, [10, 33, 3, 1, 4]), { sourceId: 'tts', minBlockFrames: 2 }))

    expect(blocks.map(block => [block.range.startFrame, block.range.endFrame])).toEqual([[0, 3], [3, 6]])
    expect(blocks.every(block => block.sampleRate === 24000 && block.range.sourceId === 'tts')).toBe(true)
    expect(blocks.flatMap(block => [...block.channels[0]!])).toEqual([0, 0.5, -0.5, 32767 / 32768, -1, 0.25])
  })

  it('splits interleaved stereo samples into planar channels', async () => {
    const wav = streamedWav(pcm16([16384, -16384, 8192, -8192]), 48000, 2)

    const [block] = await readAll(decodeWavStream(chunksOf(wav, []), { sourceId: 'tts' }))

    expect(block!.channels.map(channel => [...channel])).toEqual([[0.5, 0.25], [-0.5, -0.25]])
    expect(block!.range).toEqual({ sourceId: 'tts', startFrame: 0, endFrame: 2 })
  })

  it('errors when the body is not WAV', async () => {
    const body = chunksOf(new TextEncoder().encode('ID3 not a wav file'), [])

    await expect(readAll(decodeWavStream(body, { sourceId: 'tts' }))).rejects.toThrow('not a 16-bit PCM WAV stream')
  })
})
