import { describe, expect, it } from 'vitest'

import { streamTranscription } from './index'

describe('streamTranscription', () => {
  it('sets half-duplex transport for the browser audio upload', async () => {
    // ROOT CAUSE:
    //
    // Browser fetch requires `duplex: 'half'` when the request body is a
    // ReadableStream. The official provider set this in its fetch wrapper,
    // but that wrapper does not own this adapter's stream transport.
    //
    // Report: T-3, Official provider transcription does not work reliably.
    let requestInit: RequestInit | undefined
    const audioStream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.close()
      },
    })

    const result = streamTranscription({
      baseURL: 'https://example.invalid/transcription',
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestInit = init
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close()
          },
        }))
      },
      inputAudioStream: audioStream,
    })

    await expect(result.text).resolves.toBe('')
    expect((requestInit as RequestInit & { duplex?: string }).duplex).toBe('half')
  })

  it('normalizes T-3 ArrayBuffer audio chunks before browser fetch', async () => {
    // ROOT CAUSE:
    //
    // The VAD audio stream emits ArrayBuffer chunks. Chromium rejects these
    // chunks in a streaming request body and reports `TypeError: Failed to fetch`.
    // Fetch requires each request stream chunk to be a Uint8Array.
    let uploadedChunk: unknown
    const audioStream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3, 4]).buffer)
        controller.close()
      },
    })

    const result = streamTranscription({
      baseURL: 'https://example.invalid/transcription',
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!(init?.body instanceof ReadableStream))
          throw new TypeError('Expected a readable request body.')

        const reader = init.body.getReader()
        uploadedChunk = (await reader.read()).value
        return new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.close()
          },
        }))
      },
      inputAudioStream: audioStream,
    })

    await expect(result.text).resolves.toBe('')
    expect(uploadedChunk).toBeInstanceOf(Uint8Array)
    expect(uploadedChunk).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

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
