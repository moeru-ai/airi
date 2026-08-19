import type { AddressInfo } from 'node:net'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'

import { streamOfficialTranscription } from './stream-transcription'

vi.mock('../../../auth', () => ({
  getAuthToken: () => 'test-jwt',
}))

interface MockServer {
  binaryFrames: Buffer[]
  controlFrames: Array<{ event?: string }>
  requestURL: string | undefined
  stop: () => Promise<void>
  url: string
}

type MockBehavior = 'normal' | 'error' | 'early-close'

async function startMockServer(behavior: MockBehavior = 'normal'): Promise<MockServer> {
  const binaryFrames: Buffer[] = []
  const controlFrames: Array<{ event?: string }> = []
  let requestURL: string | undefined
  const httpServer = createServer()
  const websocketServer = new WebSocketServer({ server: httpServer })

  websocketServer.on('connection', (socket, request) => {
    requestURL = request.url
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        binaryFrames.push(Buffer.from(data as Buffer))
        return
      }

      const frame = JSON.parse(data.toString()) as { event?: string }
      controlFrames.push(frame)
      if (frame.event === 'start') {
        if (behavior === 'error') {
          socket.send(JSON.stringify({ event: 'error', code: 'upstream_error', message: 'mock failure' }))
          return
        }
        socket.send(JSON.stringify({ event: 'session.started' }))
        if (behavior === 'early-close')
          socket.close(1011, 'mock_failure')
      }
      if (frame.event === 'stop') {
        socket.send(JSON.stringify({ event: 'transcript.text.delta', delta: 'hello AIRI\n' }))
        socket.send(JSON.stringify({ event: 'transcript.text.done' }))
        socket.send(JSON.stringify({ event: 'session.finished' }))
      }
    })
  })

  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
  const { port } = httpServer.address() as AddressInfo

  return {
    binaryFrames,
    controlFrames,
    get requestURL() {
      return requestURL
    },
    url: `http://127.0.0.1:${port}/api/v1/audio/transcriptions/ws`,
    async stop() {
      websocketServer.close()
      await new Promise<void>(resolve => httpServer.close(() => resolve()))
    },
  }
}

describe('streamOfficialTranscription', () => {
  let server: MockServer | undefined

  afterEach(async () => {
    await server?.stop()
    server = undefined
  })

  it('streams PCM frames and returns the final transcript over WebSocket', async () => {
    server = await startMockServer()
    const audioStream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.enqueue(Uint8Array.from([1, 2]).buffer)
        controller.enqueue(Uint8Array.from([3, 4]).buffer)
        controller.close()
      },
    })

    const result = streamOfficialTranscription({
      baseURL: new URL(server.url),
      inputAudioStream: audioStream,
      model: 'auto',
    })

    await expect(result.text).resolves.toBe('hello AIRI\n')
    expect(server.requestURL).toBe('/api/v1/audio/transcriptions/ws?token=test-jwt')
    expect(server.binaryFrames).toEqual([
      Buffer.from([1, 2]),
      Buffer.from([3, 4]),
    ])
    expect(server.controlFrames.map(frame => frame.event)).toEqual(['start', 'stop'])
  })

  it('sends cancel and rejects when the caller aborts', async () => {
    server = await startMockServer()
    const abortController = new AbortController()
    const audioStream = new ReadableStream<ArrayBuffer>({
      start(controller) {
        controller.enqueue(Uint8Array.from([1, 2]).buffer)
      },
    })
    const result = streamOfficialTranscription({
      abortSignal: abortController.signal,
      baseURL: new URL(server.url),
      inputAudioStream: audioStream,
      model: 'auto',
    })

    await expect.poll(() => server?.binaryFrames.length).toBe(1)
    abortController.abort(new DOMException('test abort', 'AbortError'))

    await expect(result.text).rejects.toMatchObject({ name: 'AbortError' })
    await expect.poll(() => server?.controlFrames.map(frame => frame.event)).toEqual(['start', 'cancel'])
  })

  it('rejects server error events', async () => {
    server = await startMockServer('error')
    const result = streamOfficialTranscription({
      baseURL: new URL(server.url),
      inputAudioStream: new ReadableStream<ArrayBuffer>(),
      model: 'auto',
    })

    await expect(result.text).rejects.toThrow('upstream_error: mock failure')
  })

  it('rejects a close before session.finished', async () => {
    server = await startMockServer('early-close')
    const result = streamOfficialTranscription({
      baseURL: new URL(server.url),
      inputAudioStream: new ReadableStream<ArrayBuffer>(),
      model: 'auto',
    })

    await expect(result.text).rejects.toThrow('Official ASR WebSocket closed before session.finished: mock_failure')
  })
})
