import type { AddressInfo } from 'node:net'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'

import { streamingSynthesize } from './streaming-session'

vi.mock('../auth', () => ({
  getAuthToken: () => 'test-jwt',
}))

vi.mock('../server', () => ({
  SERVER_URL: 'http://placeholder',
}))

interface MockServer {
  url: string
  observedTokens: string[]
  observedVoiceTypes: string[]
  closeUnexpectedly: () => void
  stop: () => Promise<void>
}

async function startMockServer(handler: (ws: import('ws').WebSocket) => void): Promise<MockServer> {
  const observedTokens: string[] = []
  const observedVoiceTypes: string[] = []
  const httpServer = createServer()
  const wss = new WebSocketServer({ server: httpServer })

  let activeWs: import('ws').WebSocket | undefined

  wss.on('connection', (ws, req) => {
    activeWs = ws
    const u = new URL(req.url!, 'http://localhost')
    const token = u.searchParams.get('token')
    if (token != null)
      observedTokens.push(token)
    const voiceType = u.searchParams.get('tts_voice_type')
    if (voiceType != null)
      observedVoiceTypes.push(voiceType)

    handler(ws)
  })

  await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
  const { port } = httpServer.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    observedTokens,
    observedVoiceTypes,
    closeUnexpectedly: () => {
      activeWs?.close(1011, 'simulated_truncation')
    },
    async stop() {
      wss.close()
      await new Promise<void>(r => httpServer.close(() => r()))
    },
  }
}

describe('streamingSynthesize', () => {
  let server: MockServer | undefined

  beforeEach(() => {
    server = undefined
  })
  afterEach(async () => {
    await server?.stop()
  })

  it('resolves with concatenated audio when session.finished arrives', async () => {
    const chunkA = Buffer.from('AAAA', 'utf8')
    const chunkB = Buffer.from('BBBB', 'utf8')

    server = await startMockServer((ws) => {
      ws.on('message', async (data, isBinary) => {
        // Only respond to the first client message (start). The
        // subsequent text/finish frames are also sent by the streaming
        // session, but for this test we just want to flush the response
        // pipeline immediately.
        if (isBinary)
          return
        const parsed = JSON.parse(data.toString()) as { event?: string }
        if (parsed.event !== 'start')
          return

        await new Promise(r => setTimeout(r, 5))
        ws.send(JSON.stringify({ event: 'session.started' }))
        await new Promise(r => setTimeout(r, 5))
        ws.send(chunkA, { binary: true })
        ws.send(chunkB, { binary: true })
        await new Promise(r => setTimeout(r, 5))
        ws.send(JSON.stringify({
          event: 'sentence.end',
          payload: { text: 'hello', words: [{ word: 'hello', startTime: 0, endTime: 0.5 }] },
        }))
        ws.send(JSON.stringify({
          event: 'session.finished',
          payload: { usage: { text_words: 5 } },
        }))
      })
    })

    const result = await streamingSynthesize({
      serverUrl: server.url,
      model: 'volcengine/seed-tts-2.0',
      voice: 'mock',
      ttsVoiceType: 'official_selected',
      input: 'hello',
    })

    expect(new Uint8Array(result.audio)).toEqual(new Uint8Array([
      ...chunkA,
      ...chunkB,
    ]))
    expect(result.byteLength).toBe(8)
    expect(result.sentences).toHaveLength(1)
    expect(result.sentences[0]).toMatchObject({ kind: 'end' })
    expect(server.observedTokens).toEqual(['test-jwt'])
    expect(server.observedVoiceTypes).toEqual(['official_selected'])
  })

  it('rejects when the ws closes before session.finished (codex HIGH #2)', async () => {
    // Server sends some audio chunks then closes the ws WITHOUT emitting
    // session.finished. Pre-fix behavior: streamingSynthesize would
    // resolve with the partial audio, and Stage.vue would play a
    // truncated segment as if it were complete. Post-fix: must reject.
    server = await startMockServer((ws) => {
      ws.on('message', async (data, isBinary) => {
        if (isBinary)
          return
        const parsed = JSON.parse(data.toString()) as { event?: string }
        if (parsed.event !== 'start')
          return

        await new Promise(r => setTimeout(r, 5))
        ws.send(JSON.stringify({ event: 'session.started' }))
        ws.send(Buffer.from('PARTIAL_AUDIO', 'utf8'), { binary: true })
        // Drop the connection without session.finished. Code 1011 is a
        // valid server-side close indicating "server encountered an
        // error"; we cannot use 1006 because that's reserved for the
        // implicit abnormal-closure code (not legal in a close frame).
        await new Promise(r => setTimeout(r, 5))
        ws.close(1011, 'simulated_truncation')
      })
    })

    await expect(streamingSynthesize({
      serverUrl: server.url,
      model: 'volcengine/seed-tts-2.0',
      voice: 'mock',
      input: 'hello',
    })).rejects.toThrow(/streaming_tts_closed/)
  })

  it('rejects with the upstream code/message on an error event', async () => {
    server = await startMockServer((ws) => {
      ws.on('message', async (data, isBinary) => {
        if (isBinary)
          return
        const parsed = JSON.parse(data.toString()) as { event?: string }
        if (parsed.event !== 'start')
          return

        await new Promise(r => setTimeout(r, 5))
        ws.send(JSON.stringify({
          event: 'error',
          code: 'insufficient_flux',
          message: 'go top up',
        }))
      })
    })

    await expect(streamingSynthesize({
      serverUrl: server.url,
      model: 'volcengine/seed-tts-2.0',
      voice: 'mock',
      input: 'hello',
    })).rejects.toThrow(/insufficient_flux.*go top up/)
  })

  it('aborts the session and rejects with AbortError on signal abort', async () => {
    let cancelObserved = false
    server = await startMockServer((ws) => {
      ws.on('message', (data, isBinary) => {
        if (isBinary)
          return
        const parsed = JSON.parse(data.toString()) as { event?: string }
        if (parsed.event === 'cancel')
          cancelObserved = true
      })
    })

    const ctrl = new AbortController()
    const promise = streamingSynthesize({
      serverUrl: server.url,
      model: 'volcengine/seed-tts-2.0',
      voice: 'mock',
      input: 'hello',
      signal: ctrl.signal,
    })

    // Fire abort after the ws is open and `start` was sent.
    await new Promise(r => setTimeout(r, 50))
    ctrl.abort()

    await expect(promise).rejects.toThrow(/aborted|AbortError|undefined/) // DOMException

    // Give the mock a tick to log the `cancel` frame.
    await new Promise(r => setTimeout(r, 50))
    expect(cancelObserved).toBe(true)
  })
})
