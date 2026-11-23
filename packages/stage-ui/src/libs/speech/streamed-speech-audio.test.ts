import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { toWavFromPCM16 } from '@proj-airi/audio/encoding'
import { describe, expect, it, vi } from 'vitest'

import { requestStreamedSpeechAudio } from './streamed-speech-audio'

function streamedWav(values: number[]): Uint8Array {
  const pcm = new Uint8Array(values.length * 2)
  const view = new DataView(pcm.buffer)
  values.forEach((value, index) => view.setInt16(index * 2, value, true))
  const wav = new Uint8Array(toWavFromPCM16(pcm, 24000, 1))
  // Providers stream WAV with placeholder sizes.
  new DataView(wav.buffer).setUint32(40, 0xFF_FF_FF_FF, true)
  return wav
}

function bodyOf(parts: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      parts.forEach(part => controller.enqueue(part))
      controller.close()
    },
  })
}

function request(fetchImpl: typeof fetch) {
  return requestStreamedSpeechAudio({ baseURL: 'https://api.example.com/api/v1/', apiKey: 'token', fetch: fetchImpl, model: 'auto', input: '你好', voice: 'voice-1' })
}

describe('requestStreamedSpeechAudio', () => {
  /**
   * @example
   * await requestStreamedSpeechAudio({ ...provider.speech(model, settings), input, voice }) // ReadableStream<PcmBlock>
   */
  it('asks for WAV and returns a PCM stream when the server answers with WAV', async () => {
    const wav = streamedWav([0, 16384, -16384])
    const fetchImpl = vi.fn(async () => new Response(bodyOf([wav.slice(0, 20), wav.slice(20)]), { status: 200, headers: { 'content-type': 'audio/wav' } })) as unknown as typeof fetch

    const audio = await request(fetchImpl)

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [URL, RequestInit][] } }).mock.calls[0]
    expect(String(url)).toBe('https://api.example.com/api/v1/audio/speech')
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'auto', input: '你好', voice: 'voice-1', response_format: 'wav' })
    expect(audio).toBeInstanceOf(ReadableStream)
    const blocks: PcmBlock[] = []
    const reader = (audio as ReadableStream<PcmBlock>).getReader()
    for (let result = await reader.read(); !result.done; result = await reader.read())
      blocks.push(result.value)
    const samples = blocks.flatMap(block => [...block.channels[0]!])
    expect(samples).toHaveLength(3)
    expect(samples[1]).toBeCloseTo(0.5, 3)
    expect(samples[2]).toBeCloseTo(-0.5, 3)
    expect(blocks[0]!.sampleRate).toBe(24000)
  })

  it('returns the whole body as a Blob for another content type', async () => {
    const mp3 = new TextEncoder().encode('ID3 mp3 frames')
    const fetchImpl = vi.fn(async () => new Response(bodyOf([mp3.slice(0, 4), mp3.slice(4)]), { status: 200, headers: { 'content-type': 'audio/mpeg' } })) as unknown as typeof fetch

    const audio = await request(fetchImpl)

    expect(audio).toBeInstanceOf(Blob)
    expect(new TextDecoder().decode(await (audio as Blob).arrayBuffer())).toBe('ID3 mp3 frames')
  })

  it('returns no audio when the server answers 204', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch

    await expect(request(fetchImpl)).resolves.toBeNull()
  })

  it('rejects with the server error for a failed request', async () => {
    const fetchImpl = vi.fn(async () => new Response('Insufficient flux', { status: 402 })) as unknown as typeof fetch

    await expect(request(fetchImpl)).rejects.toThrow('402')
  })
})
