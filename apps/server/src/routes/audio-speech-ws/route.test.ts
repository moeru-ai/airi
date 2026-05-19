import type { AddressInfo } from 'node:net'

import type { WSContext, WSEvents } from 'hono/ws'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'

import { createAudioSpeechWsHandlers } from './index'

interface MockUpstream {
  url: string
  /** Outgoing JSON frames the server should send after receiving `start`. */
  scriptedResponses: Array<
    | { kind: 'json', payload: Record<string, unknown> }
    | { kind: 'binary', bytes: Buffer }
  >
  /** Frames the upstream actually received from the proxy, in arrival order. */
  receivedFrames: Array<{ kind: 'text' | 'binary', data: string | Buffer }>
  /** Auth header observed during handshake. */
  observedAuth: string | undefined
  close: () => Promise<void>
}

async function startMockUpstream(scriptedResponses: MockUpstream['scriptedResponses']): Promise<MockUpstream> {
  const receivedFrames: MockUpstream['receivedFrames'] = []
  let observedAuth: string | undefined

  const httpServer = createServer()
  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws, req) => {
    observedAuth = req.headers.authorization
    let replayed = false
    ws.on('message', async (data, isBinary) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
      const decoded = isBinary ? buf : buf.toString('utf8')
      receivedFrames.push({
        kind: isBinary ? 'binary' : 'text',
        data: isBinary ? buf : decoded,
      })

      // Hold the scripted replay until we observe the client's `finish`
      // frame. Replaying earlier would let `session.finished` arrive at
      // the proxy before `finish` has been forwarded upstream, race
      // teardown, and drop the in-flight client frames — the proxy is
      // correct, the previous mock was the source of the race.
      if (replayed)
        return

      let triggerReplay = false
      if (isBinary) {
        // Streaming protocol's only legal client→server binary frames
        // would be raw audio (we never send any in tests).
      }
      else {
        try {
          const ev = JSON.parse(decoded as string) as { event?: string }
          if (ev.event === 'finish' || ev.event === 'cancel')
            triggerReplay = true
        }
        catch {}
      }

      // For tests that send NO frames (pre-flight rejection cases) the
      // upstream is never dialed; this handler is unreachable.
      if (!triggerReplay && scriptedResponses.length === 0)
        return
      if (!triggerReplay)
        return

      replayed = true
      for (const resp of scriptedResponses) {
        await new Promise(resolve => setTimeout(resolve, 5))

        if (resp.kind === 'json')
          ws.send(JSON.stringify(resp.payload), { binary: false })
        else
          ws.send(resp.bytes, { binary: true })
      }
    })
  })

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve)
  })

  const { port } = httpServer.address() as AddressInfo

  return {
    url: `ws://127.0.0.1:${port}`,
    scriptedResponses,
    receivedFrames,
    get observedAuth() {
      return observedAuth
    },
    async close() {
      wss.close()
      await new Promise<void>(resolve => httpServer.close(() => resolve()))
    },
  }
}

interface MockClientWs {
  ctx: WSContext
  sent: Array<{ kind: 'text' | 'binary', data: string | ArrayBuffer | Buffer }>
  closed: boolean
  closeCode?: number
  closeReason?: string
}

function makeMockClientWs(): MockClientWs {
  const sent: MockClientWs['sent'] = []
  const state = {
    closed: false as boolean,
    closeCode: undefined as number | undefined,
    closeReason: undefined as string | undefined,
  }
  const ctx = {
    send: (data: string | ArrayBuffer | Buffer) => {
      sent.push({
        kind: typeof data === 'string' ? 'text' : 'binary',
        data,
      })
    },
    close: (code?: number, reason?: string) => {
      state.closed = true
      state.closeCode = code
      state.closeReason = reason
    },
    readyState: 1,
    binaryType: 'arraybuffer',
    raw: {} as any,
    protocol: '',
    url: null,
  } as unknown as WSContext

  return {
    ctx,
    sent,
    get closed() { return state.closed },
    get closeCode() { return state.closeCode },
    get closeReason() { return state.closeReason },
  }
}

function makeFakeDeps(overrides: {
  upstreamURL: string
  fluxBalance: number
  decryptedKey?: string
}) {
  const ttsMeter = {
    assertCanAfford: vi.fn(async () => undefined),
    accumulate: vi.fn(async () => ({
      fluxDebited: 1,
      debtAfter: 0,
      balanceAfter: overrides.fluxBalance - 1,
      unbilledFlux: 0,
    })),
  }
  const fluxService = {
    getFlux: vi.fn(async () => ({ flux: overrides.fluxBalance })),
  }
  const requestLogService = {
    logRequest: vi.fn(async () => undefined),
  }
  const configKV = {
    getOptional: vi.fn(async (key: string) => {
      if (key === 'STREAMING_TTS_UPSTREAM') {
        return {
          baseURL: overrides.upstreamURL,
          keys: [{ id: 'test-key-1', ciphertext: 'ENCRYPTED_PLACEHOLDER' }],
          adapterParams: {},
        }
      }
      return null
    }),
  }
  const envelopeCrypto = {
    decryptKey: vi.fn(() => Buffer.from(overrides.decryptedKey ?? 'mock-upstream-token', 'utf8')),
  }

  return { configKV, envelopeCrypto, fluxService, ttsMeter, requestLogService }
}

/** Drives the WSEvents lifecycle as if a real client had connected. */
async function driveClientSession(events: WSEvents, client: MockClientWs, clientFrames: Array<string | Buffer>) {
  // onOpen handles the initial dial. The route fires `void dialUpstream()`
  // which is async, so we await a microtask tick to let the upstream
  // dialing kick off.
  events.onOpen?.(new Event('open') as any, client.ctx)
  await new Promise(r => setTimeout(r, 50))

  for (const frame of clientFrames) {
    const isBinary = Buffer.isBuffer(frame)
    const data = isBinary ? frame : String(frame)
    events.onMessage?.({ data } as any, client.ctx)
    await new Promise(r => setTimeout(r, 20))
  }
}

describe('audio-speech-ws route', () => {
  let upstream: MockUpstream

  beforeEach(() => {})
  afterEach(async () => {
    if (upstream)
      await upstream.close()
  })

  it('forwards start/text/finish to upstream, streams binary back, and bills on session.finished', async () => {
    const audioPayload = Buffer.from('FAKE_AUDIO_BYTES_AAAAAAAAAA', 'utf8')
    upstream = await startMockUpstream([
      { kind: 'json', payload: { event: 'session.started' } },
      { kind: 'binary', bytes: audioPayload },
      { kind: 'json', payload: { event: 'session.finished', payload: { usage: { text_words: 42 } } } },
    ])

    const deps = makeFakeDeps({ upstreamURL: upstream.url, fluxBalance: 100 })
    const handlers = createAudioSpeechWsHandlers(deps as any)
    const events = handlers('user-123')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'volcengine/seed-tts-2.0', voice: 'mock' }),
      JSON.stringify({ event: 'text', text: 'hello streaming tts' }),
      JSON.stringify({ event: 'finish' }),
    ])

    // Allow the upstream replay + billing pipeline to drain.
    await new Promise(r => setTimeout(r, 200))

    // Upstream got a properly authenticated handshake.
    expect(upstream.observedAuth).toBe('Bearer mock-upstream-token')

    // Upstream got all three text frames in order.
    expect(upstream.receivedFrames).toHaveLength(3)
    expect(upstream.receivedFrames[0]).toMatchObject({ kind: 'text' })
    expect(JSON.parse(upstream.receivedFrames[0].data as string)).toMatchObject({ event: 'start' })
    expect(JSON.parse(upstream.receivedFrames[1].data as string)).toMatchObject({ event: 'text', text: 'hello streaming tts' })
    expect(JSON.parse(upstream.receivedFrames[2].data as string)).toMatchObject({ event: 'finish' })

    // Client received the scripted control + audio frames in order.
    const clientTextFrames = client.sent.filter(s => s.kind === 'text').map(s => JSON.parse(s.data as string))
    const clientBinaryFrames = client.sent.filter(s => s.kind === 'binary')

    expect(clientTextFrames.map(f => f.event)).toEqual(['session.started', 'session.finished'])
    expect(clientBinaryFrames).toHaveLength(1)

    // Billing was triggered from session.finished.usage.text_words. The
    // `units` argument MUST be the upstream-reported text_words, not the
    // sniff-from-text-frame fallback (which would be the input string
    // length of "hello streaming tts" = 19).
    expect(deps.ttsMeter.accumulate).toHaveBeenCalledTimes(1)
    expect((deps.ttsMeter.accumulate.mock.calls[0] as any[])[0]).toMatchObject({
      userId: 'user-123',
      units: 42,
      metadata: { model: 'volcengine/seed-tts-2.0' },
    })

    // Request log gets the model label from the start frame, not the
    // hardcoded fallback.
    expect(deps.requestLogService.logRequest).toHaveBeenCalledTimes(1)
    expect((deps.requestLogService.logRequest.mock.calls[0] as any[])[0]).toMatchObject({
      userId: 'user-123',
      model: 'volcengine/seed-tts-2.0',
      status: 200,
      fluxConsumed: 1,
    })
  })

  it('refuses the session with insufficient_flux when the user is broke', async () => {
    upstream = await startMockUpstream([])
    const deps = makeFakeDeps({ upstreamURL: upstream.url, fluxBalance: 0 })
    const handlers = createAudioSpeechWsHandlers(deps as any)
    const events = handlers('user-broke')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [])

    // Upstream should never have been dialed — pre-flight fails first.
    expect(upstream.receivedFrames).toHaveLength(0)

    // Client got the error event and a clean close.
    const errorFrame = client.sent.find(s => s.kind === 'text')
    expect(errorFrame).toBeDefined()
    expect(JSON.parse(errorFrame!.data as string)).toMatchObject({
      event: 'error',
      code: 'insufficient_flux',
    })
    expect(client.closed).toBe(true)
    expect(client.closeCode).toBe(1008)
  })

  it('refuses with streaming_tts_not_configured when STREAMING_TTS_UPSTREAM is empty', async () => {
    const deps = makeFakeDeps({ upstreamURL: 'ws://unused', fluxBalance: 100 })
    deps.configKV.getOptional = vi.fn(async () => null) as any

    const handlers = createAudioSpeechWsHandlers(deps as any)
    const events = handlers('user-noconf')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [])

    const errorFrame = client.sent.find(s => s.kind === 'text')
    expect(errorFrame).toBeDefined()
    expect(JSON.parse(errorFrame!.data as string)).toMatchObject({
      event: 'error',
      code: 'streaming_tts_not_configured',
    })
    expect(client.closed).toBe(true)
  })

  it('falls back to input-char count for billing when upstream omits usage', async () => {
    // No usage in session.finished — proxy must bill the cumulative
    // length of every `text` frame's `text` field instead.
    upstream = await startMockUpstream([
      { kind: 'json', payload: { event: 'session.started' } },
      { kind: 'binary', bytes: Buffer.from('audio', 'utf8') },
      { kind: 'json', payload: { event: 'session.finished', payload: {} } },
    ])

    const deps = makeFakeDeps({ upstreamURL: upstream.url, fluxBalance: 100 })
    const handlers = createAudioSpeechWsHandlers(deps as any)
    const events = handlers('user-no-usage')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'volcengine/seed-tts-1.0', voice: 'mock' }),
      JSON.stringify({ event: 'text', text: 'hello' }),
      JSON.stringify({ event: 'text', text: 'world' }),
      JSON.stringify({ event: 'finish' }),
    ])
    await new Promise(r => setTimeout(r, 200))

    expect(deps.ttsMeter.accumulate).toHaveBeenCalledTimes(1)
    expect((deps.ttsMeter.accumulate.mock.calls[0] as any[])[0]).toMatchObject({
      userId: 'user-no-usage',
      units: 10, // "hello" + "world" = 10 chars
    })
  })
})
