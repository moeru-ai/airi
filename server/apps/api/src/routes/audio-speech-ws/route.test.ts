import type { AddressInfo } from 'node:net'

import type { WSContext, WSEvents } from 'hono/ws'

import type { AudioSpeechWsHandlersOptions } from './types'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketServer } from 'ws'

import { createAudioSpeechWsHandlers } from './index'

interface MockUpstream {
  url: string
  restBaseURL: string
  /** Outgoing JSON frames the server should send after receiving `start`. */
  scriptedResponses: Array<
    | { kind: 'json', payload: Record<string, unknown> }
    | { kind: 'binary', bytes: Buffer }
  >
  /** Frames the upstream actually received from the proxy, in arrival order. */
  receivedFrames: Array<{ kind: 'text' | 'binary', data: string | Buffer }>
  /** Auth header observed during handshake. */
  observedAuth: string | undefined
  disconnectedClients: number
  close: () => Promise<void>
}

async function startMockUpstream(
  scriptedResponses: MockUpstream['scriptedResponses'],
  voices: Array<{ id: string, name?: string }> = [{ id: 'mock', name: 'Mock Voice' }],
  protocol: 'unspeech' | 'stepfun' = 'unspeech',
  options: {
    stepfunCreatedDelayMs?: number
    suppressStepfunConnectionDone?: boolean
    suppressStepfunCreated?: boolean
    scriptedResponseDelayMs?: number
  } = {},
): Promise<MockUpstream> {
  const receivedFrames: MockUpstream['receivedFrames'] = []
  let observedAuth: string | undefined
  let disconnectedClients = 0

  const httpServer = createServer((req, res) => {
    if (req.url?.startsWith('/api/voices')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ voices }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not_found' }))
  })
  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws, req) => {
    observedAuth = req.headers.authorization
    if (protocol === 'stepfun' && !options.suppressStepfunConnectionDone) {
      ws.send(JSON.stringify({
        type: 'tts.connection.done',
        data: { session_id: 'stepfun-session' },
      }))
    }
    let replayed = false
    ws.on('close', () => {
      disconnectedClients += 1
    })
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
      if (protocol === 'stepfun') {
        if (!isBinary) {
          const event = JSON.parse(decoded as string) as { type?: string }
          if (event.type === 'tts.create') {
            if (options.suppressStepfunCreated)
              return
            if (options.stepfunCreatedDelayMs)
              await new Promise(resolve => setTimeout(resolve, options.stepfunCreatedDelayMs))
            if (ws.readyState === 1)
              ws.send(JSON.stringify({ type: 'tts.response.created', data: { session_id: 'stepfun-session' } }))
            return
          }
          if (event.type === 'tts.text.done')
            triggerReplay = true
        }
      }

      if (isBinary) {
        // Streaming protocol's only legal client→server binary frames
        // would be raw audio (we never send any in tests).
      }
      else if (protocol === 'unspeech') {
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
        await new Promise(resolve => setTimeout(resolve, options.scriptedResponseDelayMs ?? 5))

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
    restBaseURL: `http://127.0.0.1:${port}`,
    scriptedResponses,
    receivedFrames,
    get observedAuth() {
      return observedAuth
    },
    get disconnectedClients() {
      return disconnectedClients
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
    raw: {},
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
  restBaseURL?: string
  fluxBalance: number
  decryptedKey?: string
  streamingModels?: Array<{ id: string, name?: string, description?: string }>
  stepfunStreaming?: {
    rollout: 'disabled' | 'available' | 'default'
    baseURL: string
    models: Array<{ id: string, name?: string, description?: string }>
    defaultModel: string
    voices: Array<{ id: string, name?: string }>
  }
  streamingTtsTimeouts?: { handshakeMs?: number, completionMs?: number }
}) {
  const ttsMeter = {
    assertCanAfford: vi.fn(async (_userId: string, _newUnits: number, currentBalance: number) => {
      if (currentBalance <= 0)
        throw Object.assign(new Error('Insufficient flux'), { statusCode: 402 })
    }),
    accumulate: vi.fn(async (_input: Parameters<AudioSpeechWsHandlersOptions['ttsMeter']['accumulate']>[0]) => ({
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
    logRequest: vi.fn(async (_input: Parameters<AudioSpeechWsHandlersOptions['requestLogService']['logRequest']>[0]) => undefined),
  }
  const productEventService = {
    track: vi.fn(async () => undefined),
    trackGeneration: vi.fn(async () => undefined),
    countDistinctUsersByFeature: vi.fn(async () => []),
  }
  const configKV = {
    getOptional: vi.fn(async (key: string) => {
      if (key === 'UNSPEECH_UPSTREAM') {
        return {
          restBaseURL: overrides.restBaseURL ?? 'http://unspeech.local:5933',
          streaming: {
            baseURL: overrides.upstreamURL,
            keys: [{ id: 'test-key-1', ciphertext: 'ENCRYPTED_PLACEHOLDER' }],
            adapterParams: {},
            models: overrides.streamingModels ?? [
              { id: 'volcengine/seed-tts-1.0', name: 'Seed-TTS 1.0' },
              { id: 'volcengine/seed-tts-2.0', name: 'Seed-TTS 2.0' },
            ],
          },
        }
      }
      if (key === 'STEPFUN_STREAMING_TTS_UPSTREAM') {
        const config = overrides.stepfunStreaming
        return config
          ? {
              ...config,
              keys: [{ id: 'test-key-1', ciphertext: 'ENCRYPTED_PLACEHOLDER' }],
              voices: config.voices.map(voice => ({ ...voice, labels: {}, languages: [] })),
            }
          : null
      }
      return null
    }),
  }
  const envelopeCrypto = {
    decryptKey: vi.fn(() => Buffer.from(overrides.decryptedKey ?? 'mock-upstream-token', 'utf8')),
  }

  return {
    configKV,
    envelopeCrypto,
    fluxService,
    ttsMeter,
    requestLogService,
    productEventService,
    streamingTtsTimeouts: overrides.streamingTtsTimeouts,
  }
}

function createTestHandlers(deps: ReturnType<typeof makeFakeDeps>) {
  // The fixture intentionally implements only the service methods exercised by
  // this route. Keep the partial-service adaptation at this single test boundary.
  return createAudioSpeechWsHandlers(deps as unknown as AudioSpeechWsHandlersOptions)
}

/** Drives the WSEvents lifecycle as if a real client had connected. */
async function driveClientSession(events: WSEvents, client: MockClientWs, clientFrames: Array<string | Buffer>) {
  // onOpen handles the initial dial. The route fires `void dialUpstream()`
  // which is async, so we await a microtask tick to let the upstream
  // dialing kick off.
  events.onOpen?.(new Event('open'), client.ctx)
  await new Promise(r => setTimeout(r, 50))

  for (const frame of clientFrames) {
    const isBinary = Buffer.isBuffer(frame)
    const data = isBinary ? frame : String(frame)
    events.onMessage?.(new MessageEvent('message', { data }), client.ctx)
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

    const deps = makeFakeDeps({ upstreamURL: upstream.url, restBaseURL: upstream.restBaseURL, fluxBalance: 100 })
    const handlers = createTestHandlers(deps)
    const events = handlers('user-123', { voiceType: 'official_selected' })
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
    expect(deps.ttsMeter.accumulate.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-123',
      units: 42,
      metadata: { model: 'volcengine/seed-tts-2.0' },
    })

    // Request log gets the model label from the start frame, not the
    // hardcoded fallback.
    expect(deps.requestLogService.logRequest).toHaveBeenCalledTimes(1)
    expect(deps.requestLogService.logRequest.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-123',
      model: 'volcengine/seed-tts-2.0',
      status: 200,
      fluxConsumed: 1,
    })
    expect(deps.productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-123',
      feature: 'tts',
      action: 'speech_succeeded',
      status: 'succeeded',
      model: 'volcengine/seed-tts-2.0',
      metadata: expect.objectContaining({
        voice_id: 'mock',
        voice_type: 'official_selected',
      }),
    }))
  })

  it('translates the AIRI stream protocol to native StepFun websocket events', async () => {
    const audioPayload = Buffer.from('STEPFUN_AUDIO', 'utf8').toString('base64')
    const text = 'x'.repeat(2001)
    upstream = await startMockUpstream([
      { kind: 'json', payload: { type: 'tts.response.sentence.start', data: { session_id: 'stepfun-session', text: 'hello' } } },
      { kind: 'json', payload: { type: 'tts.response.audio.delta', data: { session_id: 'stepfun-session', audio: audioPayload } } },
      { kind: 'json', payload: { type: 'tts.response.sentence.end', data: { session_id: 'stepfun-session', text: 'hello' } } },
      { kind: 'json', payload: { type: 'tts.response.audio.done', data: { session_id: 'stepfun-session', audio: '' } } },
    ], [{ id: 'lively-girl', name: 'Lively Girl' }], 'stepfun')

    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      restBaseURL: upstream.restBaseURL,
      fluxBalance: 100,
      stepfunStreaming: {
        rollout: 'default',
        baseURL: upstream.url,
        models: [{ id: 'stepfun/step-tts-2', name: 'Step TTS 2' }],
        defaultModel: 'stepfun/step-tts-2',
        voices: [{ id: 'lively-girl', name: 'Lively Girl' }],
      },
    })
    const handlers = createTestHandlers(deps)
    const events = handlers('user-stepfun')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'stepfun/step-tts-2', voice: 'lively-girl' }),
      JSON.stringify({ event: 'text', text }),
      JSON.stringify({ event: 'finish' }),
    ])
    await new Promise(r => setTimeout(r, 200))

    const upstreamFrames = upstream.receivedFrames.map(frame => JSON.parse(frame.data as string))
    expect(upstreamFrames.map(frame => frame.type)).toEqual(['tts.create', 'tts.text.delta', 'tts.text.delta', 'tts.text.delta', 'tts.text.done'])
    expect(upstreamFrames[0].data).toMatchObject({
      session_id: 'stepfun-session',
      voice_id: 'lively-girl',
      mode: 'default',
      response_format: 'mp3_stream',
    })
    expect(upstreamFrames.slice(1, 4).map(frame => frame.data.text.length)).toEqual([1000, 1000, 1])

    const clientTextFrames = client.sent.filter(s => s.kind === 'text').map(s => JSON.parse(s.data as string))
    expect(clientTextFrames.map(frame => frame.event)).toEqual(['session.started', 'sentence.start', 'sentence.end', 'session.finished'])
    expect(client.sent.filter(s => s.kind === 'binary')).toHaveLength(1)
    expect(deps.ttsMeter.accumulate).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-stepfun', units: 2001 }))
  })

  it('closes StepFun immediately and records cancellation separately from billing', async () => {
    upstream = await startMockUpstream([], [{ id: 'lively-girl', name: 'Lively Girl' }], 'stepfun')
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      restBaseURL: upstream.restBaseURL,
      fluxBalance: 100,
      stepfunStreaming: {
        rollout: 'default',
        baseURL: upstream.url,
        models: [{ id: 'stepfun/step-tts-2', name: 'Step TTS 2' }],
        defaultModel: 'stepfun/step-tts-2',
        voices: [{ id: 'lively-girl', name: 'Lively Girl' }],
      },
    })
    const events = createTestHandlers(deps)('user-stepfun-cancel')
    const client = makeMockClientWs()
    let releaseBilling: (() => void) | undefined
    deps.ttsMeter.accumulate.mockImplementation(async () => new Promise((resolve) => {
      releaseBilling = () => resolve({
        fluxDebited: 1,
        debtAfter: 0,
        balanceAfter: 99,
        unbilledFlux: 0,
      })
    }))

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'stepfun/step-tts-2', voice: 'lively-girl' }),
      JSON.stringify({ event: 'text', text: 'paid text' }),
    ])
    events.onClose?.(new CloseEvent('close'), client.ctx)
    await new Promise(r => setTimeout(r, 30))

    expect(upstream.disconnectedClients).toBe(1)
    expect(deps.ttsMeter.accumulate).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-stepfun-cancel',
      units: 9,
    }))
    expect(deps.requestLogService.logRequest).not.toHaveBeenCalled()

    releaseBilling?.()
    await new Promise(r => setTimeout(r, 30))
    expect(deps.requestLogService.logRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 499 }))
    expect(deps.productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
      action: 'speech_cancelled',
      status: 'cancelled',
      reason: 'client_disconnected',
    }))
    expect(deps.productEventService.track).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'speech_succeeded' }))
  })

  it('cancels immediately while start configuration is still pending', async () => {
    upstream = await startMockUpstream([], [{ id: 'lively-girl' }], 'stepfun')
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      fluxBalance: 100,
      stepfunStreaming: {
        rollout: 'available',
        baseURL: upstream.url,
        models: [{ id: 'stepfun/step-tts-2' }],
        defaultModel: 'stepfun/step-tts-2',
        voices: [{ id: 'lively-girl' }],
      },
    })
    const readConfig = deps.configKV.getOptional.getMockImplementation()
    let releaseConfig: (() => void) | undefined
    const configGate = new Promise<void>((resolve) => {
      releaseConfig = resolve
    })
    deps.configKV.getOptional.mockImplementation(async (key) => {
      await configGate
      return readConfig?.(key) ?? null
    })
    const events = createTestHandlers(deps)('user-stepfun-explicit-cancel')
    const client = makeMockClientWs()

    events.onOpen?.(new Event('open'), client.ctx)
    events.onMessage?.(new MessageEvent('message', {
      data: JSON.stringify({ event: 'start', model: 'stepfun/step-tts-2', voice: 'lively-girl' }),
    }), client.ctx)
    await new Promise(resolve => setTimeout(resolve, 10))
    events.onMessage?.(new MessageEvent('message', {
      data: JSON.stringify({ event: 'cancel' }),
    }), client.ctx)
    await new Promise(resolve => setTimeout(resolve, 30))

    expect(client.closed).toBe(true)
    expect(upstream.observedAuth).toBeUndefined()
    expect(deps.requestLogService.logRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 499 }))
    expect(deps.productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
      action: 'speech_cancelled',
      status: 'cancelled',
      reason: 'client_cancelled',
    }))

    releaseConfig?.()
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(upstream.observedAuth).toBeUndefined()
  })

  it('fails and releases a StepFun connection that never completes its handshake', async () => {
    upstream = await startMockUpstream([], [{ id: 'lively-girl' }], 'stepfun', { suppressStepfunConnectionDone: true })
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      fluxBalance: 100,
      streamingTtsTimeouts: { handshakeMs: 25, completionMs: 100 },
      stepfunStreaming: {
        rollout: 'available',
        baseURL: upstream.url,
        models: [{ id: 'stepfun/step-tts-2' }],
        defaultModel: 'stepfun/step-tts-2',
        voices: [{ id: 'lively-girl' }],
      },
    })
    const events = createTestHandlers(deps)('user-stepfun-timeout')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'stepfun/step-tts-2', voice: 'lively-girl' }),
    ])
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(client.sent.filter(frame => frame.kind === 'text').map(frame => JSON.parse(frame.data as string))).toContainEqual(
      expect.objectContaining({ event: 'error', code: 'stepfun_handshake_timeout' }),
    )
    expect(upstream.disconnectedClients).toBe(1)
    expect(deps.requestLogService.logRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 502 }))
  })

  it('fails and releases an unSpeech connection that never completes after finish', async () => {
    upstream = await startMockUpstream([
      { kind: 'json', payload: { event: 'session.started' } },
    ])
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      restBaseURL: upstream.restBaseURL,
      fluxBalance: 100,
      streamingTtsTimeouts: { handshakeMs: 100, completionMs: 25 },
    })
    const events = createTestHandlers(deps)('user-unspeech-timeout')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'volcengine/seed-tts-2.0', voice: 'mock' }),
      JSON.stringify({ event: 'text', text: 'timeout input' }),
      JSON.stringify({ event: 'finish' }),
    ])
    await new Promise(resolve => setTimeout(resolve, 80))

    expect(client.sent.filter(frame => frame.kind === 'text').map(frame => JSON.parse(frame.data as string))).toContainEqual(
      expect.objectContaining({ event: 'error', code: 'unspeech_completion_timeout' }),
    )
    expect(upstream.disconnectedClients).toBe(1)
    expect(deps.ttsMeter.accumulate).toHaveBeenCalledWith(expect.objectContaining({ units: 13 }))
  })

  it('keeps a long StepFun completion alive while audio progress continues', async () => {
    const audio = Buffer.from('progress').toString('base64')
    upstream = await startMockUpstream([
      { kind: 'json', payload: { type: 'tts.response.audio.delta', data: { session_id: 'stepfun-session', audio } } },
      { kind: 'json', payload: { type: 'tts.response.audio.delta', data: { session_id: 'stepfun-session', audio } } },
      { kind: 'json', payload: { type: 'tts.response.audio.delta', data: { session_id: 'stepfun-session', audio } } },
      { kind: 'json', payload: { type: 'tts.response.audio.done', data: { session_id: 'stepfun-session' } } },
    ], [{ id: 'lively-girl' }], 'stepfun', { scriptedResponseDelayMs: 15 })
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      fluxBalance: 100,
      streamingTtsTimeouts: { handshakeMs: 100, completionMs: 25 },
      stepfunStreaming: {
        rollout: 'available',
        baseURL: upstream.url,
        models: [{ id: 'stepfun/step-tts-2' }],
        defaultModel: 'stepfun/step-tts-2',
        voices: [{ id: 'lively-girl' }],
      },
    })
    const events = createTestHandlers(deps)('user-stepfun-progress')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'stepfun/step-tts-2', voice: 'lively-girl' }),
      JSON.stringify({ event: 'text', text: 'long healthy output' }),
      JSON.stringify({ event: 'finish' }),
    ])
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(client.sent.filter(frame => frame.kind === 'binary')).toHaveLength(3)
    expect(deps.requestLogService.logRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }))
    expect(deps.productEventService.track).not.toHaveBeenCalledWith(expect.objectContaining({ reason: 'stepfun_completion_timeout' }))
  })

  it('never bills less than text accepted by unSpeech when upstream usage under-reports', async () => {
    upstream = await startMockUpstream([
      { kind: 'json', payload: { event: 'session.started' } },
      { kind: 'json', payload: { event: 'session.finished', payload: { usage: { text_words: 0 } } } },
    ])
    const deps = makeFakeDeps({ upstreamURL: upstream.url, restBaseURL: upstream.restBaseURL, fluxBalance: 100 })
    const events = createTestHandlers(deps)('user-unspeech-under-report')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'volcengine/seed-tts-2.0', voice: 'mock' }),
      JSON.stringify({ event: 'text', text: 'accepted text' }),
      JSON.stringify({ event: 'finish' }),
    ])
    await new Promise(resolve => setTimeout(resolve, 80))

    expect(deps.ttsMeter.accumulate).toHaveBeenCalledWith(expect.objectContaining({ units: 13 }))
  })

  it('allows unSpeech to validate the model when the curated model list is empty', async () => {
    upstream = await startMockUpstream([
      { kind: 'json', payload: { event: 'session.started' } },
      { kind: 'json', payload: { event: 'session.finished', payload: {} } },
    ])
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      restBaseURL: upstream.restBaseURL,
      fluxBalance: 100,
      streamingModels: [],
    })
    const events = createTestHandlers(deps)('user-unspeech-upstream-policy')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'volcengine/upstream-model', voice: 'mock' }),
      JSON.stringify({ event: 'text', text: 'hello' }),
      JSON.stringify({ event: 'finish' }),
    ])
    await new Promise(resolve => setTimeout(resolve, 80))

    expect(upstream.observedAuth).toBe('Bearer mock-upstream-token')
    expect(deps.requestLogService.logRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }))
  })

  it('does not bill text that never reached a created StepFun session', async () => {
    upstream = await startMockUpstream([], [{ id: 'lively-girl' }], 'stepfun', { stepfunCreatedDelayMs: 200 })
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      fluxBalance: 100,
      stepfunStreaming: {
        rollout: 'available',
        baseURL: upstream.url,
        models: [{ id: 'stepfun/step-tts-2' }],
        defaultModel: 'stepfun/step-tts-2',
        voices: [{ id: 'lively-girl' }],
      },
    })
    const events = createTestHandlers(deps)('user-stepfun-unaccepted')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'stepfun/step-tts-2', voice: 'lively-girl' }),
      JSON.stringify({ event: 'text', text: 'not accepted' }),
    ])
    events.onClose?.(new CloseEvent('close'), client.ctx)
    await new Promise(r => setTimeout(r, 30))

    expect(deps.ttsMeter.accumulate).not.toHaveBeenCalled()
    expect(upstream.receivedFrames.map(frame => JSON.parse(frame.data as string).type)).toEqual(['tts.create'])
  })

  it('records a StepFun response error as failure while charging only accepted text', async () => {
    upstream = await startMockUpstream([
      { kind: 'json', payload: { type: 'tts.response.error', data: { session_id: 'stepfun-session', code: 'provider_busy', message: 'busy' } } },
    ], [{ id: 'lively-girl' }], 'stepfun')
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      fluxBalance: 100,
      stepfunStreaming: {
        rollout: 'available',
        baseURL: upstream.url,
        models: [{ id: 'stepfun/step-tts-2' }],
        defaultModel: 'stepfun/step-tts-2',
        voices: [{ id: 'lively-girl' }],
      },
    })
    const events = createTestHandlers(deps)('user-stepfun-error')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'stepfun/step-tts-2', voice: 'lively-girl' }),
      JSON.stringify({ event: 'text', text: 'bill accepted text' }),
      JSON.stringify({ event: 'finish' }),
    ])
    await new Promise(r => setTimeout(r, 80))

    expect(deps.ttsMeter.accumulate).toHaveBeenCalledWith(expect.objectContaining({ units: 18 }))
    expect(deps.requestLogService.logRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 502 }))
    expect(deps.productEventService.track).toHaveBeenCalledWith(expect.objectContaining({ action: 'speech_failed', reason: 'provider_busy' }))
    expect(deps.productEventService.track).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'speech_succeeded' }))
  })

  it('rejects StepFun events that do not belong to the active session', async () => {
    upstream = await startMockUpstream([
      {
        kind: 'json',
        payload: {
          type: 'tts.response.audio.delta',
          data: { session_id: 'another-session', audio: Buffer.from('wrong-session').toString('base64') },
        },
      },
    ], [{ id: 'lively-girl' }], 'stepfun')
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      fluxBalance: 100,
      stepfunStreaming: {
        rollout: 'available',
        baseURL: upstream.url,
        models: [{ id: 'stepfun/step-tts-2' }],
        defaultModel: 'stepfun/step-tts-2',
        voices: [{ id: 'lively-girl' }],
      },
    })
    const events = createTestHandlers(deps)('user-stepfun-correlation')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'stepfun/step-tts-2', voice: 'lively-girl' }),
      JSON.stringify({ event: 'text', text: 'hello' }),
      JSON.stringify({ event: 'finish' }),
    ])
    await new Promise(r => setTimeout(r, 80))

    const controlFrames = client.sent.filter(frame => frame.kind === 'text').map(frame => JSON.parse(frame.data as string))
    expect(controlFrames).toContainEqual(expect.objectContaining({ event: 'error', code: 'stepfun_session_mismatch' }))
    expect(client.sent.filter(frame => frame.kind === 'binary')).toHaveLength(0)
    expect(deps.requestLogService.logRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 502 }))
  })

  it('rejects an oversized streaming session before forwarding text upstream', async () => {
    upstream = await startMockUpstream([], [{ id: 'lively-girl' }], 'stepfun')
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      fluxBalance: 100,
      stepfunStreaming: {
        rollout: 'available',
        baseURL: upstream.url,
        models: [{ id: 'stepfun/step-tts-2' }],
        defaultModel: 'stepfun/step-tts-2',
        voices: [{ id: 'lively-girl' }],
      },
    })
    const events = createTestHandlers(deps)('user-stepfun-limit')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'stepfun/step-tts-2', voice: 'lively-girl' }),
      JSON.stringify({ event: 'text', text: 'x'.repeat(20001) }),
    ])
    await new Promise(r => setTimeout(r, 30))

    expect(client.closeCode).toBe(1009)
    expect(upstream.receivedFrames.map(frame => JSON.parse(frame.data as string).type)).toEqual(['tts.create'])
    expect(deps.ttsMeter.accumulate).not.toHaveBeenCalled()
  })

  it('rejects a StepFun response format that cannot preserve the client contract', async () => {
    upstream = await startMockUpstream([], [{ id: 'lively-girl' }], 'stepfun')
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      fluxBalance: 100,
      stepfunStreaming: {
        rollout: 'available',
        baseURL: upstream.url,
        models: [{ id: 'stepfun/step-tts-2' }],
        defaultModel: 'stepfun/step-tts-2',
        voices: [{ id: 'lively-girl' }],
      },
    })
    const events = createTestHandlers(deps)('user-stepfun-format')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'stepfun/step-tts-2', voice: 'lively-girl', response_format: 'aac' }),
    ])

    expect(upstream.observedAuth).toBeUndefined()
    expect(client.sent.filter(frame => frame.kind === 'text').map(frame => JSON.parse(frame.data as string))).toContainEqual(
      expect.objectContaining({ event: 'error', code: 'streaming_tts_response_format_not_supported' }),
    )
  })

  it('bills accepted text when a later affordability window is blocked', async () => {
    upstream = await startMockUpstream([], [{ id: 'lively-girl' }], 'stepfun')
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      fluxBalance: 100,
      stepfunStreaming: {
        rollout: 'available',
        baseURL: upstream.url,
        models: [{ id: 'stepfun/step-tts-2' }],
        defaultModel: 'stepfun/step-tts-2',
        voices: [{ id: 'lively-girl' }],
      },
    })
    deps.ttsMeter.assertCanAfford.mockImplementation(async (_userId, units) => {
      if (units > 2000)
        throw Object.assign(new Error('Insufficient flux'), { statusCode: 402 })
    })
    const events = createTestHandlers(deps)('user-stepfun-window')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'stepfun/step-tts-2', voice: 'lively-girl' }),
      JSON.stringify({ event: 'text', text: 'x'.repeat(2000) }),
      JSON.stringify({ event: 'text', text: 'x' }),
    ])
    await new Promise(r => setTimeout(r, 50))

    expect(client.closeCode).toBe(1008)
    expect(deps.ttsMeter.accumulate).toHaveBeenCalledWith(expect.objectContaining({ units: 2000 }))
    expect(deps.requestLogService.logRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 402 }))
    expect(deps.productEventService.track).toHaveBeenCalledWith(expect.objectContaining({ action: 'speech_blocked' }))
  })

  it('refuses the session with insufficient_flux when the user is broke', async () => {
    upstream = await startMockUpstream([])
    const deps = makeFakeDeps({ upstreamURL: upstream.url, restBaseURL: upstream.restBaseURL, fluxBalance: 0 })
    const handlers = createTestHandlers(deps)
    const events = handlers('user-broke', { trigger: 'auto', source: 'chat_auto_tts' })
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'volcengine/seed-tts-2.0', voice: 'mock' }),
    ])

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
    expect(deps.productEventService.track).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-broke',
      feature: 'tts',
      action: 'speech_blocked',
      status: 'blocked',
      source: 'chat_auto_tts',
      reason: 'insufficient_balance',
      metadata: expect.objectContaining({
        trigger: 'auto',
        block_reason: 'insufficient_balance',
        balance_state: 'insufficient',
        flux_balance_bucket: 'zero',
      }),
    }))
  })

  it('refuses with streaming_tts_not_configured when UNSPEECH_UPSTREAM.streaming is empty', async () => {
    const deps = makeFakeDeps({ upstreamURL: 'ws://unused', fluxBalance: 100 })
    deps.configKV.getOptional.mockImplementation(async () => null)

    const handlers = createTestHandlers(deps)
    const events = handlers('user-noconf')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'volcengine/seed-tts-2.0', voice: 'mock' }),
    ])

    const errorFrame = client.sent.find(s => s.kind === 'text')
    expect(errorFrame).toBeDefined()
    expect(JSON.parse(errorFrame!.data as string)).toMatchObject({
      event: 'error',
      code: 'streaming_tts_not_configured',
    })
    expect(client.closed).toBe(true)
  })

  it('refuses an unconfigured streaming model before dialing upstream', async () => {
    upstream = await startMockUpstream([])
    const deps = makeFakeDeps({
      upstreamURL: upstream.url,
      restBaseURL: upstream.restBaseURL,
      fluxBalance: 100,
      streamingModels: [{ id: 'volcengine/seed-tts-2.0', name: 'Seed-TTS 2.0' }],
    })
    const handlers = createTestHandlers(deps)
    const events = handlers('user-disabled-model')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'volcengine/seed-tts-disabled', voice: 'mock' }),
      JSON.stringify({ event: 'text', text: 'must not leak upstream' }),
      JSON.stringify({ event: 'finish' }),
    ])
    await new Promise(r => setTimeout(r, 100))

    expect(upstream.observedAuth).toBeUndefined()
    expect(upstream.receivedFrames).toHaveLength(0)
    const errorFrame = client.sent.find(s => s.kind === 'text')
    expect(errorFrame).toBeDefined()
    expect(JSON.parse(errorFrame!.data as string)).toMatchObject({
      event: 'error',
      code: 'streaming_tts_model_not_enabled',
    })
    expect(client.closed).toBe(true)
    expect(client.closeCode).toBe(1008)
  })

  it('refuses an unknown streaming voice before dialing upstream', async () => {
    upstream = await startMockUpstream([], [{ id: 'enabled-voice', name: 'Enabled Voice' }])
    const deps = makeFakeDeps({ upstreamURL: upstream.url, restBaseURL: upstream.restBaseURL, fluxBalance: 100 })
    const handlers = createTestHandlers(deps)
    const events = handlers('user-disabled-voice')
    const client = makeMockClientWs()

    await driveClientSession(events, client, [
      JSON.stringify({ event: 'start', model: 'volcengine/seed-tts-2.0', voice: 'disabled-voice' }),
      JSON.stringify({ event: 'text', text: 'must not leak upstream' }),
      JSON.stringify({ event: 'finish' }),
    ])
    await new Promise(r => setTimeout(r, 100))

    expect(upstream.observedAuth).toBeUndefined()
    expect(upstream.receivedFrames).toHaveLength(0)
    const errorFrame = client.sent.find(s => s.kind === 'text')
    expect(errorFrame).toBeDefined()
    expect(JSON.parse(errorFrame!.data as string)).toMatchObject({
      event: 'error',
      code: 'streaming_tts_voice_not_enabled',
    })
    expect(client.closed).toBe(true)
    expect(client.closeCode).toBe(1008)
  })

  it('falls back to input-char count for billing when upstream omits usage', async () => {
    // No usage in session.finished — proxy must bill the cumulative
    // length of every `text` frame's `text` field instead.
    upstream = await startMockUpstream([
      { kind: 'json', payload: { event: 'session.started' } },
      { kind: 'binary', bytes: Buffer.from('audio', 'utf8') },
      { kind: 'json', payload: { event: 'session.finished', payload: {} } },
    ])

    const deps = makeFakeDeps({ upstreamURL: upstream.url, restBaseURL: upstream.restBaseURL, fluxBalance: 100 })
    const handlers = createTestHandlers(deps)
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
    expect(deps.ttsMeter.accumulate.mock.calls[0]?.[0]).toMatchObject({
      userId: 'user-no-usage',
      units: 10, // "hello" + "world" = 10 chars
    })
  })
})
