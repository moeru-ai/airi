import type { AddressInfo } from 'node:net'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'

import { createStreamingTtsPipeline } from './streaming-pipeline'

vi.mock('../auth', () => ({
  getAuthToken: () => 'test-jwt',
}))
vi.mock('../server', () => ({
  SERVER_URL: 'http://placeholder',
}))

interface MockServer {
  url: string
  receivedFrames: Array<{ kind: 'text' | 'binary', data: string | Buffer }>
  observedVoiceTypes: string[]
  /** Resolves when the server has observed a `start` frame from the client. */
  startObserved: Promise<void>
  stop: () => Promise<void>
}

async function startMockServer(handler: (ws: import('ws').WebSocket) => void): Promise<MockServer> {
  const receivedFrames: MockServer['receivedFrames'] = []
  const observedVoiceTypes: string[] = []
  const httpServer = createServer()
  const wss = new WebSocketServer({ server: httpServer })

  let resolveStartObserved!: () => void
  const startObserved = new Promise<void>((res) => {
    resolveStartObserved = res
  })

  wss.on('connection', (ws, req) => {
    const u = new URL(req.url!, 'http://localhost')
    const voiceType = u.searchParams.get('tts_voice_type')
    if (voiceType != null)
      observedVoiceTypes.push(voiceType)

    ws.on('message', (data, isBinary) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
      const decoded = isBinary ? buf : buf.toString('utf8')
      receivedFrames.push({ kind: isBinary ? 'binary' : 'text', data: isBinary ? buf : (decoded as string) })
      if (!isBinary) {
        try {
          const ev = JSON.parse(decoded as string) as { event?: string }
          if (ev.event === 'start')
            resolveStartObserved()
        }
        catch {}
      }
    })
    handler(ws)
  })

  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
  const { port } = httpServer.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    receivedFrames,
    observedVoiceTypes,
    startObserved,
    async stop() {
      wss.close()
      await new Promise<void>(r => httpServer.close(() => r()))
    },
  }
}

// jsdom-friendly stub AudioContext for `decodeAudioData`. The pipeline does
// not introspect the AudioBuffer beyond passing it to consumers, so any
// shape with the expected fields is fine.
function makeStubAudioContext(): BaseAudioContext {
  let counter = 0
  const ctx = {
    sampleRate: 24000,
    decodeAudioData: vi.fn(async (buf: ArrayBuffer) => {
      // Return a fake AudioBuffer-like object identifiable by index/byteLength.
      counter += 1
      return {
        duration: buf.byteLength / 24000,
        length: buf.byteLength,
        numberOfChannels: 1,
        sampleRate: 24000,
        __index: counter,
        __byteLength: buf.byteLength,
      } as unknown as AudioBuffer
    }),
  }
  return ctx as unknown as BaseAudioContext
}

describe('createStreamingTtsPipeline', () => {
  let server: MockServer | undefined

  beforeEach(() => {
    server = undefined
  })
  afterEach(async () => {
    await server?.stop()
  })

  it('forwards appendText / finish frames and chunks audio per sentence.end', async () => {
    const chunks = [Buffer.from([1, 2, 3, 4]), Buffer.from([5, 6, 7, 8]), Buffer.from([9, 10, 11, 12])]
    server = await startMockServer((ws) => {
      ws.on('message', async (data, isBinary) => {
        if (isBinary)
          return
        const ev = JSON.parse(data.toString()) as { event?: string }
        if (ev.event === 'finish') {
          // First sentence: chunk1 + chunk2 → sentence.end
          ws.send(JSON.stringify({ event: 'sentence.start', payload: { text: 'first one.' } }))
          ws.send(chunks[0], { binary: true })
          ws.send(chunks[1], { binary: true })
          ws.send(JSON.stringify({ event: 'sentence.end', payload: { text: 'first one.' } }))
          // Second sentence: chunk3 → sentence.end
          ws.send(JSON.stringify({ event: 'sentence.start', payload: { text: 'second sentence.' } }))
          ws.send(chunks[2], { binary: true })
          ws.send(JSON.stringify({ event: 'sentence.end', payload: { text: 'second sentence.' } }))
          ws.send(JSON.stringify({ event: 'session.finished', payload: { usage: { text_words: 4 } } }))
        }
      })
    })

    const onSentence = vi.fn()
    const onError = vi.fn()
    const onDone = vi.fn()

    const handle = createStreamingTtsPipeline({
      serverUrl: server.url,
      model: 'volcengine/seed-tts-1.0',
      voice: 'mock',
      ttsVoiceType: 'official_selected',
      audioContext: makeStubAudioContext(),
      onSentence,
      onError,
      onDone,
    })

    handle.appendText('hi ')
    handle.appendText('there')
    handle.finish()

    // Wait for done.
    await new Promise<void>((resolve) => {
      onDone.mockImplementation(() => resolve())
      setTimeout(resolve, 1500)
    })

    await server.startObserved
    const textFrames = server.receivedFrames.filter(f => f.kind === 'text').map(f => JSON.parse(f.data as string))
    expect(textFrames.map(f => f.event)).toEqual(['start', 'text', 'text', 'finish'])
    expect(server.observedVoiceTypes).toEqual(['official_selected'])
    expect(textFrames[1]).toMatchObject({ event: 'text', text: 'hi ' })
    expect(textFrames[2]).toMatchObject({ event: 'text', text: 'there' })

    expect(onError).not.toHaveBeenCalled()
    // Two `sentence.end` events → two AudioBuffers.
    expect(onSentence).toHaveBeenCalledTimes(2)
    const calls = onSentence.mock.calls.map(([s]) => s as { index: number, text: string, audio: { __byteLength: number } })
    expect(calls[0]).toMatchObject({ index: 0, text: 'first one.' })
    expect(calls[0].audio.__byteLength).toBe(chunks[0].length + chunks[1].length)
    expect(calls[1]).toMatchObject({ index: 1, text: 'second sentence.' })
    expect(calls[1].audio.__byteLength).toBe(chunks[2].length)
  })

  it('buffers entire session when bufferEntireSession is true', async () => {
    const chunks = [Buffer.from([1, 2, 3, 4]), Buffer.from([5, 6, 7, 8])]
    server = await startMockServer((ws) => {
      ws.on('message', (data, isBinary) => {
        if (isBinary)
          return
        const ev = JSON.parse(data.toString()) as { event?: string }
        if (ev.event === 'finish') {
          // Two sentences with sentence.end events — but the pipeline should
          // IGNORE them in buffered mode (TTS 2.0 ships subtitles async).
          ws.send(chunks[0], { binary: true })
          ws.send(JSON.stringify({ event: 'sentence.end', payload: { text: 'sentence 1' } }))
          ws.send(chunks[1], { binary: true })
          ws.send(JSON.stringify({ event: 'sentence.end', payload: { text: 'sentence 2' } }))
          ws.send(JSON.stringify({ event: 'session.finished', payload: {} }))
        }
      })
    })

    const onSentence = vi.fn()
    const handle = createStreamingTtsPipeline({
      serverUrl: server.url,
      model: 'volcengine/seed-tts-2.0',
      voice: 'mock',
      audioContext: makeStubAudioContext(),
      bufferEntireSession: true,
      onSentence,
    })

    handle.finish()

    await new Promise<void>(resolve => setTimeout(resolve, 800))

    expect(onSentence).toHaveBeenCalledTimes(1)
    const [sentence] = onSentence.mock.calls[0] as [{ index: number, audio: { __byteLength: number } }]
    expect(sentence.index).toBe(0)
    expect(sentence.audio.__byteLength).toBe(chunks[0].length + chunks[1].length)
  })

  it('surfaces upstream error event then closes', async () => {
    server = await startMockServer((ws) => {
      ws.on('message', (data, isBinary) => {
        if (isBinary)
          return
        const ev = JSON.parse(data.toString()) as { event?: string }
        if (ev.event === 'start') {
          ws.send(JSON.stringify({ event: 'error', code: 'insufficient_flux', message: 'top up' }))
        }
      })
    })

    const onError = vi.fn()
    const onDone = vi.fn()
    createStreamingTtsPipeline({
      serverUrl: server.url,
      model: 'volcengine/seed-tts-1.0',
      voice: 'mock',
      audioContext: makeStubAudioContext(),
      onError,
      onDone,
    })

    await new Promise<void>((resolve) => {
      onDone.mockImplementation(() => resolve())
      setTimeout(resolve, 1500)
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0][0] as Error).message).toMatch(/insufficient_flux.*top up/)
  })

  it('surfaces close-before-finished as error', async () => {
    server = await startMockServer((ws) => {
      ws.on('message', (data, isBinary) => {
        if (isBinary)
          return
        const ev = JSON.parse(data.toString()) as { event?: string }
        if (ev.event === 'start') {
          // Drop ws without sending session.finished.
          setTimeout(() => ws.close(1011, 'simulated_truncation'), 10)
        }
      })
    })

    const onError = vi.fn()
    const onDone = vi.fn()
    createStreamingTtsPipeline({
      serverUrl: server.url,
      model: 'volcengine/seed-tts-1.0',
      voice: 'mock',
      audioContext: makeStubAudioContext(),
      onError,
      onDone,
    })

    await new Promise<void>((resolve) => {
      onDone.mockImplementation(() => resolve())
      setTimeout(resolve, 1500)
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect((onError.mock.calls[0][0] as Error).message).toMatch(/streaming_tts_closed/)
  })

  it('cancel() sends cancel frame and terminates', async () => {
    let cancelObserved = false
    server = await startMockServer((ws) => {
      ws.on('message', (data, isBinary) => {
        if (isBinary)
          return
        const ev = JSON.parse(data.toString()) as { event?: string }
        if (ev.event === 'cancel')
          cancelObserved = true
      })
    })

    const onDone = vi.fn()
    const handle = createStreamingTtsPipeline({
      serverUrl: server.url,
      model: 'volcengine/seed-tts-1.0',
      voice: 'mock',
      audioContext: makeStubAudioContext(),
      onDone,
    })

    await server.startObserved
    handle.cancel()

    // ROOT CAUSE:
    //
    // This test was flaky on CI: asserting `cancelObserved` right after `onDone`
    // resolved raced the mock server's `message` event.
    // `cancel()` queues the cancel frame in the ws write buffer, then `terminate()`
    // defers `ws.close()` + `onDone()` by one macrotask (streaming-pipeline.ts) —
    // but the frame still has to cross a real loopback socket and be dispatched to
    // the server's `message` listener, which on a loaded runner can happen AFTER
    // the client-side `onDone` fired.
    //
    // We fixed this by polling for both observations instead of asserting
    // immediately after `onDone`.
    await vi.waitFor(() => {
      expect(cancelObserved).toBe(true)
      expect(onDone).toHaveBeenCalledTimes(1)
    }, { interval: 10, timeout: 1500 })
  })
})
