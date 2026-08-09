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
})
