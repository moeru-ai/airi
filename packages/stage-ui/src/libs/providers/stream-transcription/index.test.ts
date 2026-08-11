import { describe, expect, it } from 'vitest'

import { streamTranscription } from './index'

describe('streamTranscription', () => {
  it('parses split SSE chunks and joins transcription deltas', async () => {
    const encoder = new TextEncoder()
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"transcript.text.delta","delta":"Hello"}\n'))
        controller.enqueue(encoder.encode('\ndata: {"type":"transcript.text.delta","delta":" AIRI"}\n\n'))
        controller.close()
      },
    })
    const audioStream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.close()
      },
    })

    const result = streamTranscription({
      baseURL: 'https://example.invalid/transcription',
      fetch: async () => new Response(responseBody),
      inputAudioStream: audioStream,
    })

    expect(await result.text).toBe('Hello AIRI')
    await expect(result.textStream.getReader().read()).resolves.toEqual({ done: false, value: 'Hello' })
  })

  it('rejects requests without an audio input', () => {
    expect(() => streamTranscription({})).toThrow('Audio stream or file is required')
  })

  it('replaces volatile transcript snapshots instead of appending corrections', async () => {
    // ROOT CAUSE:
    //
    // The adapter only accumulated `transcript.text.delta` events. Providers
    // that emit complete volatile hypotheses could not replace incorrect text.
    const encoder = new TextEncoder()
    const responseBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"transcript.text.snapshot","text":"今天天气很号","isFinal":false,"locale":"zh-CN","startMilliseconds":0,"durationMilliseconds":1000}\n\n'))
        controller.enqueue(encoder.encode('data: {"type":"transcript.text.snapshot","text":"今天天气很好","isFinal":true,"locale":"zh-CN","startMilliseconds":0,"durationMilliseconds":1200}\n\n'))
        controller.close()
      },
    })
    const audioStream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.close()
      },
    })

    const result = streamTranscription({
      baseURL: 'https://example.invalid/transcription',
      fetch: async () => new Response(responseBody),
      inputAudioStream: audioStream,
    })
    const updates = []
    for await (const update of result.fullStream)
      updates.push(update)

    expect(updates).toHaveLength(2)
    expect(await result.text).toBe('今天天气很好')
  })
})
