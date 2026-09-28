import type { AddressInfo } from 'node:net'

import type { WebSocket } from 'ws'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer } from 'ws'

import { createAliyunNlsSession } from './session'

interface MockAliyunUpstream {
  binaryFrames: Buffer[]
  closedConnections: number
  controlFrames: Array<{ header?: { name?: string } }>
  stop: () => Promise<void>
  url: string
}

async function startMockAliyunUpstream(onStart?: (socket: WebSocket) => void): Promise<MockAliyunUpstream> {
  const binaryFrames: Buffer[] = []
  const controlFrames: Array<{ header?: { name?: string } }> = []
  let closedConnections = 0
  const httpServer = createServer()
  const websocketServer = new WebSocketServer({ server: httpServer })

  websocketServer.on('connection', (socket) => {
    socket.on('close', () => {
      closedConnections += 1
    })
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        binaryFrames.push(Buffer.from(data as Buffer))
        return
      }

      const frame = JSON.parse(data.toString()) as { header?: { name?: string } }
      controlFrames.push(frame)
      if (frame.header?.name === 'StartTranscription') {
        if (onStart) {
          onStart(socket)
          return
        }
        socket.send(JSON.stringify({
          header: { name: 'TranscriptionStarted' },
          payload: { session_id: 'mock-session' },
        }))
      }
      if (frame.header?.name === 'StopTranscription') {
        socket.send(JSON.stringify({
          header: { name: 'SentenceEnd' },
          payload: { result: 'hello AIRI' },
        }))
        socket.send(JSON.stringify({ header: { name: 'TranscriptionCompleted' } }))
      }
    })
  })

  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
  const { port } = httpServer.address() as AddressInfo

  return {
    binaryFrames,
    get closedConnections() {
      return closedConnections
    },
    controlFrames,
    url: `ws://127.0.0.1:${port}`,
    async stop() {
      for (const socket of websocketServer.clients)
        socket.terminate()
      await new Promise<void>(resolve => websocketServer.close(() => resolve()))
      await new Promise<void>(resolve => httpServer.close(() => resolve()))
    },
  }
}

describe('createAliyunNlsSession', () => {
  let upstream: MockAliyunUpstream | undefined

  afterEach(async () => {
    await upstream?.stop()
    upstream = undefined
  })

  it('forwards PCM and emits transcript lifecycle events', async () => {
    upstream = await startMockAliyunUpstream()
    const events: string[] = []
    const transcript: string[] = []

    const session = createAliyunNlsSession({
      credentials: {
        accessKeyId: 'ak',
        accessKeySecret: 'secret',
        appKey: 'app',
        region: 'cn-shanghai',
      },
      createToken: async () => ({ token: 'mock-token', expiresAt: Date.now() + 3600_000 }),
      websocketBaseURL: upstream.url,
      onStarted() {
        events.push('started')
        session.sendAudio(Uint8Array.from([1, 2]))
        session.stop()
      },
      onTranscriptSnapshot(text) {
        transcript.push(text)
      },
      onTranscriptDone() {
        events.push('transcript.done')
      },
      onFinished() {
        events.push('finished')
      },
      onError(error) {
        throw error
      },
    })

    await session.start()
    await expect.poll(() => events).toEqual(['started', 'transcript.done', 'finished'])
    expect(transcript).toEqual(['hello AIRI\n'])
    expect(upstream.binaryFrames).toEqual([Buffer.from([1, 2])])
    expect(upstream.controlFrames.map(frame => frame.header?.name)).toEqual([
      'StartTranscription',
      'StopTranscription',
    ])
  })

  it('emits interim text before speech ends and replaces it with the final sentence', async () => {
    upstream = await startMockAliyunUpstream((socket) => {
      socket.send(JSON.stringify({ header: { name: 'TranscriptionStarted' } }))
      socket.send(JSON.stringify({ header: { name: 'SentenceBegin' }, payload: { index: 1, time: 0 } }))
      socket.send(JSON.stringify({ header: { name: 'TranscriptionResultChanged' }, payload: { result: 'hel' } }))
      socket.send(JSON.stringify({ header: { name: 'TranscriptionResultChanged' }, payload: { result: 'hello' } }))
      socket.send(JSON.stringify({ header: { name: 'SentenceEnd' }, payload: { result: 'hello!' } }))
      socket.send(JSON.stringify({ header: { name: 'TranscriptionCompleted' } }))
    })
    const snapshots: string[] = []
    const session = createAliyunNlsSession({
      credentials: { accessKeyId: 'ak', accessKeySecret: 'secret', appKey: 'app', region: 'cn-shanghai' },
      createToken: async () => ({ token: 'mock-token', expiresAt: Date.now() + 3600_000 }),
      websocketBaseURL: upstream.url,
      onStarted() {},
      onTranscriptSnapshot(text) { snapshots.push(text) },
      onTranscriptDone() {},
      onFinished() {},
      onError(error) { throw error },
    })

    await session.start()
    await expect.poll(() => snapshots).toEqual(['hel', 'hello', 'hello!\n'])
  })

  it('reports invalid upstream frames and closes the task', async () => {
    upstream = await startMockAliyunUpstream((socket) => {
      socket.send('{invalid-json')
    })
    const errors: Error[] = []
    const session = createAliyunNlsSession({
      credentials: {
        accessKeyId: 'ak',
        accessKeySecret: 'secret',
        appKey: 'app',
        region: 'cn-shanghai',
      },
      createToken: async () => ({ token: 'mock-token', expiresAt: Date.now() + 3600_000 }),
      websocketBaseURL: upstream.url,
      onStarted() {},
      onTranscriptSnapshot() {},
      onTranscriptDone() {},
      onFinished() {},
      onError(error) {
        errors.push(error)
      },
    })

    await session.start()

    await expect.poll(() => errors.map(error => error.message)).toEqual([
      'Aliyun NLS returned an invalid JSON frame.',
    ])
  })

  // https://github.com/moeru-ai/airi/pull/2290#discussion_r4087049692
  // ROOT CAUSE:
  // Valid JSON with a non-string transcript bypassed the old type cast and
  // corrupted the text sent to the client. Reject the frame at the boundary.
  it('rejects an Aliyun frame with a non-string transcript', async () => {
    upstream = await startMockAliyunUpstream((socket) => {
      socket.send(JSON.stringify({ header: { name: 'TranscriptionStarted' } }))
      socket.send(JSON.stringify({ header: { name: 'TranscriptionResultChanged' }, payload: { result: 42 } }))
    })
    const errors: Error[] = []
    const snapshots: string[] = []
    const session = createAliyunNlsSession({
      credentials: { accessKeyId: 'ak', accessKeySecret: 'secret', appKey: 'app', region: 'cn-shanghai' },
      createToken: async () => ({ token: 'mock-token', expiresAt: Date.now() + 3600_000 }),
      websocketBaseURL: upstream.url,
      onStarted() {},
      onTranscriptSnapshot(text) { snapshots.push(text) },
      onTranscriptDone() {},
      onFinished() {},
      onError(error) { errors.push(error) },
    })

    await session.start()
    await expect.poll(() => errors.map(error => error.message)).toEqual(['Aliyun NLS returned an invalid frame.'])
    expect(snapshots).toEqual([])
  })

  it('fails if the upstream never confirms that transcription started', async () => {
    upstream = await startMockAliyunUpstream(() => {})
    const errors: Error[] = []
    const session = createAliyunNlsSession({
      credentials: { accessKeyId: 'ak', accessKeySecret: 'secret', appKey: 'app', region: 'cn-shanghai' },
      createToken: async () => ({ token: 'mock-token', expiresAt: Date.now() + 3600_000 }),
      websocketBaseURL: upstream.url,
      startupTimeoutMs: 20,
      onStarted() {},
      onTranscriptSnapshot() {},
      onTranscriptDone() {},
      onFinished() {},
      onError(error) { errors.push(error) },
    })

    await session.start()
    await expect.poll(() => errors.map(error => error.message)).toEqual(['Aliyun NLS did not start in time.'])
    await expect.poll(() => upstream?.closedConnections).toBe(1)
  })

  it('reports an upstream close before completion', async () => {
    upstream = await startMockAliyunUpstream((socket) => {
      socket.close(1011, 'mock_failure')
    })
    const errors: Error[] = []
    const session = createAliyunNlsSession({
      credentials: {
        accessKeyId: 'ak',
        accessKeySecret: 'secret',
        appKey: 'app',
        region: 'cn-shanghai',
      },
      createToken: async () => ({ token: 'mock-token', expiresAt: Date.now() + 3600_000 }),
      websocketBaseURL: upstream.url,
      onStarted() {},
      onTranscriptSnapshot() {},
      onTranscriptDone() {},
      onFinished() {},
      onError(error) {
        errors.push(error)
      },
    })

    await session.start()

    await expect.poll(() => errors.map(error => error.message)).toEqual([
      'Aliyun NLS closed before completion: 1011 mock_failure',
    ])
  })

  it('closes the upstream task when the session is cancelled', async () => {
    upstream = await startMockAliyunUpstream()
    const errors: Error[] = []
    const session = createAliyunNlsSession({
      credentials: {
        accessKeyId: 'ak',
        accessKeySecret: 'secret',
        appKey: 'app',
        region: 'cn-shanghai',
      },
      createToken: async () => ({ token: 'mock-token', expiresAt: Date.now() + 3600_000 }),
      websocketBaseURL: upstream.url,
      onStarted() {
        session.cancel()
      },
      onTranscriptSnapshot() {},
      onTranscriptDone() {},
      onFinished() {},
      onError(error) {
        errors.push(error)
      },
    })

    await session.start()

    await expect.poll(() => upstream?.closedConnections).toBe(1)
    expect(errors).toEqual([])
  })

  it('does not open the upstream after cancellation during token creation', async () => {
    upstream = await startMockAliyunUpstream()
    let resolveToken!: (token: { token: string, expiresAt: number }) => void
    const tokenPromise = new Promise<{ token: string, expiresAt: number }>((resolve) => {
      resolveToken = resolve
    })
    const session = createAliyunNlsSession({
      credentials: {
        accessKeyId: 'ak',
        accessKeySecret: 'secret',
        appKey: 'app',
        region: 'cn-shanghai',
      },
      createToken: async () => tokenPromise,
      websocketBaseURL: upstream.url,
      onStarted() {},
      onTranscriptSnapshot() {},
      onTranscriptDone() {},
      onFinished() {},
      onError(error) {
        throw error
      },
    })

    const startPromise = session.start()
    session.cancel()
    resolveToken({ token: 'mock-token', expiresAt: Date.now() + 3600_000 })
    await startPromise
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(upstream.controlFrames).toEqual([])
    expect(upstream.closedConnections).toBe(0)
  })
})
