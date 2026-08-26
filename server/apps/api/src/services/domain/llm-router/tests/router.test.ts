import type { Buffer } from 'node:buffer'

import type { Counter } from '@opentelemetry/api'
import type Redis from 'ioredis'

import type { GatewayMetrics } from '../../../../otel'
import type { ConfigKVService } from '../../../adapters/config-kv'
import type { ConcurrencyLedger } from '../concurrency-ledger'
import type { LlmRouteContext, RouterConfig } from '../types'

import { randomBytes } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEnvelopeCrypto } from '../../../../utils/envelope-crypto'
import { ApiError } from '../../../../utils/error'
import { createLlmRouterService } from '../router'

function failResponse(status: number, body: object = { error: 'bad' }) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

function freshMasterKey(): Buffer {
  return randomBytes(32)
}

function happyResponse(bodyJson: object) {
  return new Response(JSON.stringify(bodyJson), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

function makeConfig(opts: {
  fallbackHttpCodes?: number[]
  upstreams?: Array<{ baseURL: string, keyIds: string[], overrideModel?: string, timeoutMs?: number }>
}): { ciphertextByKey: Map<string, string>, config: RouterConfig, crypto: ReturnType<typeof createEnvelopeCrypto> } {
  const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
  const modelName = 'openai/gpt-5-mini'
  const ciphertextByKey = new Map<string, string>()

  const upstreams = opts.upstreams ?? [{ baseURL: 'https://up-a.example/v1', keyIds: ['kA1'] }]
  const upstreamConfigs = upstreams.map(u => ({
    baseURL: u.baseURL,
    headerTemplate: 'Bearer {KEY}',
    keys: u.keyIds.map((id) => {
      const plaintext = `sk-${id}`
      const ct = crypto.encryptKey(plaintext, { keyEntryId: id, modelName })
      ciphertextByKey.set(id, ct)
      return { ciphertext: ct, id }
    }),
    overrideModel: u.overrideModel,
    timeoutMs: u.timeoutMs,
  }))

  const config: RouterConfig = {
    defaults: {
      fallbackHttpCodes: opts.fallbackHttpCodes ?? [401, 402, 403, 429, 500, 502, 503, 504],
      fullChainTimeoutMs: 60000,
      perAttemptTimeoutMs: 30000,
    },
    llm: {
      models: {
        [modelName]: {
          fallbackTriggers: {
            httpCodes: opts.fallbackHttpCodes ?? [401, 402, 403, 429, 500, 502, 503, 504],
            onTimeout: true,
          },
          upstreams: upstreamConfigs,
        },
      },
    },
    tts: { models: {} },
  } as RouterConfig

  return { ciphertextByKey, config, crypto }
}

function makeConfigKV(config: null | RouterConfig): ConfigKVService {
  return {
    get: vi.fn(),
    getOptional: vi.fn(async (key: string) => (key === 'LLM_ROUTER_CONFIG' ? config : null)),
    // routeTts resolves UNSPEECH_UPSTREAM lazily when the chosen adapter needs it.
    // LLM-side tests never invoke routeTts so the value is irrelevant; TTS
    // tests need a populated restBaseURL.
    getOrThrow: vi.fn(async (key: string) => {
      if (key === 'UNSPEECH_UPSTREAM')
        return { restBaseURL: 'http://unspeech.local:5933' }
      return undefined
    }),
    set: vi.fn(),
  } as unknown as ConfigKVService
}

function makeCounter(): Counter {
  return { add: vi.fn() } as unknown as Counter
}

/**
 * Stub concurrency ledger. Defaults model an always-free pool (tryAcquire grants,
 * nothing saturated) so the existing fixed-order LLM/TTS tests never engage the
 * pooling branch. Pooling tests pass `overrides` to drive capacity decisions.
 */
function makeLedger(overrides: Partial<ConcurrencyLedger> = {}): ConcurrencyLedger {
  return {
    currentInflight: vi.fn(async () => 0),
    isSaturated: vi.fn(async () => false),
    markSaturated: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    snapshot: vi.fn(async () => []),
    tryAcquire: vi.fn(async () => true),
    ...overrides,
  }
}

function makeMetrics(): GatewayMetrics {
  return {
    configInvalidHmac: makeCounter(),
    configReload: makeCounter(),
    decryptFailures: makeCounter(),
    fallbackCount: makeCounter(),
    keyExhaustedCount: makeCounter(),
    poolInflight: { addCallback: vi.fn(), removeCallback: vi.fn() },
    poolSaturationMarked: makeCounter(),
    poolSlotRejected: makeCounter(),
    sameStatusExhaustion: makeCounter(),
    subscriberState: makeCounter(),
    upstreamErrors: makeCounter(),
  } as unknown as GatewayMetrics
}

/**
 * Minimal redis stub shared across `createLlmRouterService` tests. The router
 * only touches redis through the TTS voice catalog cache, which the LLM-side
 * tests never exercise — every method here is a no-op vi.fn so the type
 * checker is happy without spinning a real client.
 */
function makeRedisStub(): Redis {
  async function* emptyScan(): AsyncGenerator<string[]> {}
  return {
    get: vi.fn(async () => null),
    pipeline: vi.fn(() => ({ del: vi.fn(), exec: vi.fn(async () => []) })),
    scanStream: vi.fn(() => emptyScan()),
    set: vi.fn(async () => 'OK'),
  } as unknown as Redis
}

describe('createLlmRouterService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * @example Happy path: one upstream, one key, returns Response
   */
  it('happy path: one upstream + one key + 200 → returns Response, no fallback', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1', keyIds: ['kA1'] }] })
    const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 }))
    const metrics = makeMetrics()

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: metrics,
      redis: makeRedisStub(),
    })

    const res = await router.route({ body: { messages: [] }, modelName: 'openai/gpt-5-mini' })
    expect(res.status).toBe(200)
    expect(fetchImpl.mock.calls.length).toBe(1)
    expect((metrics.fallbackCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
    expect((metrics.keyExhaustedCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it('reports the winning upstream via ctx.provider (happy path)', async () => {
    // ROOT CAUSE:
    //
    // The success-path gen_ai metrics (operation count/duration/tokens) were
    // labelled by model only, so a per-provider rollup in Grafana was
    // impossible — the route layer never learned which upstream served the
    // request. We thread an out-param `ctx` the router fills with the upstream
    // it used so those metrics can carry a `provider` label.
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1', keyIds: ['kA1'] }] })
    const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 }))
    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: null,
      redis: makeRedisStub(),
    })

    const ctx: LlmRouteContext = { lastStatus: null, provider: 'unknown', triedKeys: 0, triedUpstreams: 0 }
    const res = await router.route({ body: { messages: [] }, modelName: 'openai/gpt-5-mini' }, ctx)
    expect(res.status).toBe(200)
    // deriveProviderTag = URL hostname.
    expect(ctx.provider).toBe('up.example')
  })

  it('ctx.provider reflects the upstream that actually succeeded after fallback', async () => {
    // ROOT CAUSE:
    //
    // With a fallback chain the winning provider is whichever upstream finally
    // returned 200, not the first one tried. ctx.provider must be the winner
    // (up-b), else per-provider success metrics would mis-attribute the request
    // to the failing upstream.
    const { config, crypto } = makeConfig({
      upstreams: [
        { baseURL: 'https://up-a.example/v1', keyIds: ['kA1'] },
        { baseURL: 'https://up-b.example/v1', keyIds: ['kB1'] },
      ],
    })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failResponse(401))
      .mockResolvedValueOnce(happyResponse({ ok: 1 }))
    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: makeMetrics(),
      redis: makeRedisStub(),
    })

    const ctx: LlmRouteContext = { lastStatus: null, provider: 'unknown', triedKeys: 0, triedUpstreams: 0 }
    const res = await router.route({ body: {}, modelName: 'openai/gpt-5-mini' }, ctx)
    expect(res.status).toBe(200)
    expect(ctx.provider).toBe('up-b.example')
  })

  it('happy path injects Bearer + model + url correctly', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1/', keyIds: ['kA1'] }] })
    const fetchImpl: typeof fetch = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: null,
      redis: makeRedisStub(),
    })

    await router.route({ body: { messages: [{ content: 'hi', role: 'user' }] }, modelName: 'openai/gpt-5-mini' })

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][0]).toBe('https://up.example/v1/chat/completions')
    const init = calls[0][1] as Parameters<typeof fetch>[1] & { body: string, headers: Record<string, string>, method: string }
    expect(init.headers.authorization).toBe('Bearer sk-kA1')
    expect(init.headers['content-type']).toBe('application/json')
    expect(init.method).toBe('POST')
    const sent = JSON.parse(init.body) as { messages: unknown, model: string }
    expect(sent.model).toBe('openai/gpt-5-mini')
    expect(sent.messages).toEqual([{ content: 'hi', role: 'user' }])
  })

  it('uses upstream.overrideModel when set (so admin can rewrite the model id sent upstream)', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1', keyIds: ['kA1'], overrideModel: 'real/upstream-id' }] })
    const fetchImpl: typeof fetch = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: null,
      redis: makeRedisStub(),
    })

    const ctx: LlmRouteContext = { lastStatus: null, provider: 'unknown', triedKeys: 0, triedUpstreams: 0 }
    await router.route({ body: { messages: [] }, modelName: 'openai/gpt-5-mini' }, ctx)
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls
    const init = calls[0][1] as { body: string }
    expect((JSON.parse(init.body) as { model: string }).model).toBe('real/upstream-id')
    expect(ctx.upstreamModel).toBe('real/upstream-id')
  })

  it('multi-key fallback: k1=401 then k2=200 → returns 200 and records fallbackCount once', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up-a.example/v1', keyIds: ['k1', 'k2'] }] })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failResponse(401))
      .mockResolvedValueOnce(happyResponse({ ok: 1 }))
    const metrics = makeMetrics()

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: metrics,
      redis: makeRedisStub(),
    })

    const res = await router.route({ body: {}, modelName: 'openai/gpt-5-mini' })
    expect(res.status).toBe(200)
    expect(fetchImpl.mock.calls.length).toBe(2)

    expect((metrics.fallbackCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    const fbArgs = (metrics.fallbackCount.add as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fbArgs[0]).toBe(1)
    expect(fbArgs[1]).toMatchObject({ from_key: 'k1', reason: '401' })

    expect((metrics.upstreamErrors.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    expect((metrics.keyExhaustedCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it('cross-upstream fallback: upstream A keys all 401, upstream B[0] = 200 → returns 200 without terminal exhaustion', async () => {
    const { config, crypto } = makeConfig({
      upstreams: [
        { baseURL: 'https://up-a.example/v1', keyIds: ['kA1', 'kA2'] },
        { baseURL: 'https://up-b.example/v1', keyIds: ['kB1'] },
      ],
    })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failResponse(401))
      .mockResolvedValueOnce(failResponse(401))
      .mockResolvedValueOnce(happyResponse({ ok: 1 }))
    const metrics = makeMetrics()

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: metrics,
      redis: makeRedisStub(),
    })

    const res = await router.route({ body: {}, modelName: 'openai/gpt-5-mini' })
    expect(res.status).toBe(200)
    expect(fetchImpl.mock.calls.length).toBe(3)

    expect((metrics.keyExhaustedCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
    expect((metrics.fallbackCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  it('full exhaustion: every upstream + every key 401 → throws 502 BAD_GATEWAY (KTD-1 last-cause = 401 → 502)', async () => {
    const { config, crypto } = makeConfig({
      upstreams: [
        { baseURL: 'https://up-a.example/v1', keyIds: ['kA1'] },
        { baseURL: 'https://up-b.example/v1', keyIds: ['kB1'] },
      ],
    })
    const fetchImpl = vi.fn(async () => failResponse(401))
    const metrics = makeMetrics()

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: metrics,
      redis: makeRedisStub(),
    })

    try {
      await router.route({ body: {}, modelName: 'openai/gpt-5-mini' })
      throw new Error('expected throw')
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).statusCode).toBe(502)
      expect((err as ApiError).errorCode).toBe('BAD_GATEWAY')
      expect((err as ApiError).details).toMatchObject({ lastStatusCode: 401, triedKeys: 2, triedUpstreams: 2 })
    }

    const exhaustionCalls = (metrics.keyExhaustedCount.add as ReturnType<typeof vi.fn>).mock.calls
    expect(exhaustionCalls.length).toBe(1)
    expect(exhaustionCalls[0][0]).toBe(1)
    expect(exhaustionCalls[0][1]).toMatchObject({
      provider: 'up-b.example',
      status_code: 401,
      surface: 'chat',
    })
  })

  it('full exhaustion attaches per-attempt cause (bodySnippet for HTTP, errorMessage for network) so operators can debug 502s', async () => {
    // ROOT CAUSE:
    //
    // Before this regression, `mapUpstreamError` only put `lastStatusCode`
    // into ApiError.details — the upstream body (e.g. OpenRouter 403
    // "This model is not available in your region.") was cancelled on the
    // wire and never reached the logger. Operators saw the bare 502 and
    // had to re-probe the upstream by hand to find the real reason.
    //
    // We now snapshot up to 256 body bytes per failed HTTP attempt and
    // capture errorMessageFromUnknown(err) for network attempts, then
    // attach the full attempt list to ApiError.cause. SEC-5 keeps it out
    // of details/response body; the logger surfaces cause for diagnosis.
    const { config, crypto } = makeConfig({
      upstreams: [
        { baseURL: 'https://up-a.example/v1', keyIds: ['kA1'] },
        { baseURL: 'https://up-b.example/v1', keyIds: ['kB1'] },
      ],
    })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failResponse(401, { error: { code: 'AUTH', message: 'key disabled' } }))
      .mockImplementationOnce(async () => { throw new Error('ECONNRESET while reading response') })

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: null,
      redis: makeRedisStub(),
    })

    try {
      await router.route({ body: {}, modelName: 'openai/gpt-5-mini' })
      throw new Error('expected throw')
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      // Client-facing surface stays SEC-5 clean — no body content here.
      expect((err as ApiError).details).toMatchObject({ lastStatusCode: 'timeout', triedKeys: 2, triedUpstreams: 2 })
      expect(JSON.stringify((err as ApiError).details)).not.toContain('key disabled')

      // Server-side cause carries the actual diagnostics.
      const cause = (err as ApiError & { cause?: { attempts?: unknown[] } }).cause
      expect(cause).toBeDefined()
      expect(cause?.attempts).toHaveLength(2)

      const first = (cause!.attempts as Array<Record<string, unknown>>)[0]
      expect(first).toMatchObject({ keyId: 'kA1', status: 401 })
      expect(first.bodySnippet).toEqual(expect.stringContaining('key disabled'))
      expect(first.errorMessage).toBeUndefined()

      const second = (cause!.attempts as Array<Record<string, unknown>>)[1]
      expect(second).toMatchObject({ keyId: 'kB1', status: 'timeout' })
      expect(second.errorMessage).toEqual(expect.stringContaining('ECONNRESET'))
      expect(second.bodySnippet).toBeUndefined()
    }
  })

  it('same-status exhaustion: all keys 429 → throws 503 + sameStatusExhaustion incremented per provider', async () => {
    const { config, crypto } = makeConfig({
      upstreams: [
        { baseURL: 'https://up-a.example/v1', keyIds: ['kA1', 'kA2'] },
        { baseURL: 'https://up-b.example/v1', keyIds: ['kB1'] },
      ],
    })
    const fetchImpl = vi.fn(async () => failResponse(429))
    const metrics = makeMetrics()

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: metrics,
      redis: makeRedisStub(),
    })

    await expect(router.route({ body: {}, modelName: 'openai/gpt-5-mini' })).rejects.toMatchObject({ errorCode: 'SERVICE_UNAVAILABLE', statusCode: 503 })

    const calls = (metrics.sameStatusExhaustion.add as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBe(2)
    expect(calls[0][1]).toMatchObject({ status_code: 429 })
    expect(calls[1][1]).toMatchObject({ status_code: 429 })
  })

  it('mixed-cause exhaustion: 429 + 500 + timeout → last-cause wins (timeout → 504 GATEWAY_TIMEOUT)', async () => {
    const { config, crypto } = makeConfig({
      upstreams: [
        { baseURL: 'https://up-a.example/v1', keyIds: ['kA1', 'kA2'] },
        { baseURL: 'https://up-b.example/v1', keyIds: ['kB1'] },
      ],
    })
    // k1 → 429, k2 → 500, k3 → network/timeout-like error.
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failResponse(429))
      .mockResolvedValueOnce(failResponse(500))
      .mockImplementationOnce(async () => { throw new Error('ETIMEDOUT') })

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: null,
      redis: makeRedisStub(),
    })

    try {
      await router.route({ body: {}, modelName: 'openai/gpt-5-mini' })
      throw new Error('expected throw')
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).statusCode).toBe(504)
      expect((err as ApiError).errorCode).toBe('GATEWAY_TIMEOUT')
      expect((err as ApiError).details).toMatchObject({ lastStatusCode: 'timeout', triedKeys: 3, triedUpstreams: 2 })
    }
  })

  it('per-attempt timeout: upstream hangs longer than timeoutMs → router moves to next key', async () => {
    // ROOT CAUSE:
    //
    // Without the per-attempt AbortSignal.timeout wiring, one hung upstream
    // would block the entire full-chain budget. We assert the router treats
    // an AbortError as a timeout failure and continues to the next key.
    const { config, crypto } = makeConfig({
      upstreams: [{ baseURL: 'https://up-a.example/v1', keyIds: ['kA1', 'kA2'], timeoutMs: 25 }],
    })

    let firstCallSawAbort = false
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        await new Promise<void>((_resolve, reject) => {
          const sig = init?.signal
          if (sig != null) {
            sig.addEventListener('abort', () => {
              firstCallSawAbort = true
              reject(sig.reason ?? new Error('aborted'))
            }, { once: true })
          }
          // No resolve — wait for abort.
        })
      })
      .mockResolvedValueOnce(happyResponse({ ok: 1 }))

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: null,
      redis: makeRedisStub(),
    })

    const res = await router.route({ body: {}, modelName: 'openai/gpt-5-mini' })
    expect(res.status).toBe(200)
    expect(firstCallSawAbort).toBe(true)
    expect(fetchImpl.mock.calls.length).toBe(2)
  })

  it('full-chain timeout shape: every attempt is a timeout → throws 504 GATEWAY_TIMEOUT', async () => {
    // Surrogate for plan U3 scenario (7) — we exercise the policy that every
    // attempt timing out yields a 504, without trying to drive a real wall-
    // clock 60s test. The router's per-attempt timeout fires; mixed-cause
    // last-attempt-wins puts 'timeout' in the final mapping bucket.
    const { config, crypto } = makeConfig({
      upstreams: [{ baseURL: 'https://up-a.example/v1', keyIds: ['k1', 'k2', 'k3'], timeoutMs: 15 }],
    })

    const fetchImpl = vi.fn().mockImplementation(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      await new Promise<void>((_resolve, reject) => {
        const sig = init?.signal
        sig?.addEventListener('abort', () => reject(sig.reason ?? new Error('aborted')), { once: true })
      })
    })

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: null,
      redis: makeRedisStub(),
    })

    try {
      await router.route({ body: {}, modelName: 'openai/gpt-5-mini' })
      throw new Error('expected throw')
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).statusCode).toBe(504)
      expect((err as ApiError).errorCode).toBe('GATEWAY_TIMEOUT')
    }
    expect(fetchImpl.mock.calls.length).toBe(3)
  })

  it('pre-upstream validation: unknown model → throws 400, no fetch issued, no fallback metric', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1', keyIds: ['k1'] }] })
    const fetchImpl = vi.fn()
    const metrics = makeMetrics()

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: metrics,
      redis: makeRedisStub(),
    })

    try {
      await router.route({ body: {}, modelName: 'nope/unknown' })
      throw new Error('expected throw')
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).statusCode).toBe(400)
      expect((err as ApiError).errorCode).toBe('BAD_REQUEST')
    }

    expect(fetchImpl.mock.calls.length).toBe(0)
    expect((metrics.fallbackCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it('config not set → throws 503 CONFIG_NOT_SET (no fetch issued)', async () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const fetchImpl = vi.fn()
    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(null),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: null,
      redis: makeRedisStub(),
    })

    await expect(router.route({ body: {}, modelName: 'whatever' })).rejects.toMatchObject({ errorCode: 'CONFIG_NOT_SET', statusCode: 503 })
    expect(fetchImpl.mock.calls.length).toBe(0)
  })

  it('caller AbortSignal already-aborted → throws without dispatching any fetch', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1', keyIds: ['k1'] }] })
    const fetchImpl = vi.fn()
    const ctrl = new AbortController()
    ctrl.abort(new Error('client-disconnected'))

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: null,
      redis: makeRedisStub(),
    })

    await expect(router.route({ abortSignal: ctrl.signal, body: {}, modelName: 'openai/gpt-5-mini' })).rejects.toThrow(/client-disconnected/)
    expect(fetchImpl.mock.calls.length).toBe(0)
  })

  it('caller AbortSignal aborts mid-flight → propagates, no fallback to next key', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1', keyIds: ['k1', 'k2'] }] })

    const ctrl = new AbortController()
    const fetchImpl = vi.fn().mockImplementation(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      // Schedule caller-side abort on the next microtask so the router has a
      // chance to register its listener, then wait on the merged attempt
      // signal (which the router pre-wires from req.abortSignal).
      queueMicrotask(() => ctrl.abort(new Error('client-disconnected')))
      await new Promise<void>((_resolve, reject) => {
        const sig = init?.signal
        if (sig?.aborted) {
          reject(sig.reason ?? new Error('aborted'))
          return
        }
        sig?.addEventListener('abort', () => reject(sig.reason ?? new Error('aborted')), { once: true })
      })
    })

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: null,
      redis: makeRedisStub(),
    })

    await expect(router.route({ abortSignal: ctrl.signal, body: {}, modelName: 'openai/gpt-5-mini' })).rejects.toThrow(/client-disconnected/)
    // No fallback to k2: caller-abort short-circuits the loop.
    expect(fetchImpl.mock.calls.length).toBe(1)
  })

  it('config invalidate hook clears the cache (re-reads on next call)', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1', keyIds: ['k1'] }] })
    const configKV = makeConfigKV(config)
    const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 }))

    const router = createLlmRouterService({
      concurrencyLedger: makeLedger(),
      configKV,
      envelopeCrypto: crypto,
      fetchImpl,
      gatewayMetrics: null,
      redis: makeRedisStub(),
    })

    await router.route({ body: {}, modelName: 'openai/gpt-5-mini' })
    router.invalidateConfig()
    await router.route({ body: {}, modelName: 'openai/gpt-5-mini' })

    // 2 fetches + 2 configKV reads (because invalidate fired between them)
    expect(fetchImpl.mock.calls.length).toBe(2)
    expect((configKV.getOptional as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  describe('route LLM provider groups', () => {
    function makeGroupedLlmRouter(fetchImpl: typeof fetch) {
      const { config, crypto } = makeConfig({
        upstreams: [
          { baseURL: 'https://api.stepfun.com/step_plan/v1', keyIds: ['plan-a'] },
          { baseURL: 'https://api.stepfun.com/step_plan/v1', keyIds: ['plan-b'] },
          { baseURL: 'https://api.stepfun.com/v1', keyIds: ['paygo'] },
        ],
      })
      const model = config.llm.models['openai/gpt-5-mini']
      Object.assign(model.upstreams[0], { id: 'plan-a' })
      Object.assign(model.upstreams[1], { id: 'plan-b' })
      Object.assign(model.upstreams[2], { id: 'paygo' })
      Object.assign(model, {
        routing: {
          groups: [
            {
              continueOn: {
                httpCodes: [402],
                onTimeout: false,
              },
              id: 'plan',
              retryOn: {
                httpCodes: [402, 429, 500, 502, 503, 504],
                onTimeout: true,
              },
              upstreamIds: ['plan-a', 'plan-b'],
            },
            {
              id: 'paygo',
              retryOn: {
                httpCodes: [429, 500, 502, 503, 504],
                onTimeout: true,
              },
              upstreamIds: ['paygo'],
            },
          ],
        },
      })

      return createLlmRouterService({
        concurrencyLedger: makeLedger(),
        configKV: makeConfigKV(config),
        envelopeCrypto: crypto,
        fetchImpl,
        gatewayMetrics: makeMetrics(),
        redis: makeRedisStub(),
      })
    }

    it('uses the ordinary LLM API only after every Plan account returns 402', async () => {
      const calledURLs: string[] = []
      const fetchImpl = vi.fn(async (input: Request | string | URL) => {
        const url = String(input)
        calledURLs.push(url)
        if (url.includes('/step_plan/'))
          return failResponse(402, { error: { code: 'quota_exceeded' } })
        return happyResponse({ id: 'completion' })
      }) as unknown as typeof fetch

      const router = makeGroupedLlmRouter(fetchImpl)
      const response = await router.route({
        body: { messages: [] },
        modelName: 'openai/gpt-5-mini',
      })

      expect(response.status).toBe(200)
      expect(calledURLs).toEqual([
        'https://api.stepfun.com/step_plan/v1/chat/completions',
        'https://api.stepfun.com/step_plan/v1/chat/completions',
        'https://api.stepfun.com/v1/chat/completions',
      ])
    })

    it('does not spend ordinary LLM API balance when the Plan group is rate-limited', async () => {
      const calledURLs: string[] = []
      const fetchImpl = vi.fn(async (input: Request | string | URL) => {
        calledURLs.push(String(input))
        return failResponse(429)
      }) as unknown as typeof fetch

      const router = makeGroupedLlmRouter(fetchImpl)

      await expect(router.route({
        body: { messages: [] },
        modelName: 'openai/gpt-5-mini',
      })).rejects.toBeInstanceOf(ApiError)

      expect(calledURLs).toEqual([
        'https://api.stepfun.com/step_plan/v1/chat/completions',
        'https://api.stepfun.com/step_plan/v1/chat/completions',
      ])
      expect(calledURLs).not.toContain('https://api.stepfun.com/v1/chat/completions')
    })

    it('stops the LLM provider route immediately on Plan authentication failure', async () => {
      const calledURLs: string[] = []
      const fetchImpl = vi.fn(async (input: Request | string | URL) => {
        calledURLs.push(String(input))
        return failResponse(401)
      }) as unknown as typeof fetch

      const router = makeGroupedLlmRouter(fetchImpl)

      await expect(router.route({
        body: { messages: [] },
        modelName: 'openai/gpt-5-mini',
      })).rejects.toBeInstanceOf(ApiError)

      expect(calledURLs).toEqual([
        'https://api.stepfun.com/step_plan/v1/chat/completions',
      ])
    })
  })

  // --- routeTts adapter error contract -------------------------------------
  //
  // ROOT CAUSE:
  //
  // Before patch, `dispatchOneTtsUpstream` read `err.status` to decide
  // fallback, but `ApiError.statusCode` (not `.status`) is the canonical
  // field. Every adapter-internal `ApiError` (invalid voice, missing
  // adapter params, network wrap) was silently coerced to `'timeout'` and
  // walked every key + upstream before surfacing — wasting upstream quota
  // and hiding the actual user-facing 400 behind a 502 mapping.
  //
  // After patch: ApiError 4xx propagates immediately; ApiError 5xx folds
  // into the network-failure fallback path using `statusCode`; `Error &
  // { status }` stays on the existing fallback policy.
  describe('routeTts adapter error handling', () => {
    function makeTtsConfig(opts: {
      provider?: 'azure'
      upstreams?: Array<{ adapterParams?: Record<string, unknown>, baseURL: string, keyIds: string[] }>
    }): { config: RouterConfig, crypto: ReturnType<typeof createEnvelopeCrypto> } {
      const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
      const modelName = 'tts-test'
      const upstreams = opts.upstreams ?? [{ baseURL: 'https://up-a.example', keyIds: ['kA1'] }]
      const upstreamConfigs = upstreams.map(u => ({
        adapterParams: u.adapterParams ?? {},
        baseURL: u.baseURL,
        keys: u.keyIds.map((id) => {
          const plaintext = `sk-${id}`
          const ct = crypto.encryptKey(plaintext, { keyEntryId: id, modelName })
          return { ciphertext: ct, id }
        }),
      }))
      const config: RouterConfig = {
        defaults: {
          fallbackHttpCodes: [401, 429, 500, 502, 503, 504],
          fullChainTimeoutMs: 10000,
          perAttemptTimeoutMs: 5000,
        },
        llm: { models: {} },
        tts: {
          models: {
            [modelName]: {
              fallbackTriggers: { httpCodes: [401, 429, 500, 502, 503, 504], onTimeout: true },
              provider: opts.provider ?? 'azure',
              upstreams: upstreamConfigs,
            },
          },
        },
      } as RouterConfig
      return { config, crypto }
    }

    it('apiError 4xx (invalid voice) propagates without touching the second key', async () => {
      // azure adapter validates `voice` against AZURE_VOICE_ID before any
      // network call; an invalid voice throws createBadRequestError(400).
      // Two keys are configured: the second must NEVER be tried.
      const { config, crypto } = makeTtsConfig({ upstreams: [{ baseURL: 'https://az.example', keyIds: ['kA1', 'kA2'] }] })
      const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 }))
      const metrics = makeMetrics()

      const router = createLlmRouterService({
        concurrencyLedger: makeLedger(),
        configKV: makeConfigKV(config),
        envelopeCrypto: crypto,
        fetchImpl,
        gatewayMetrics: metrics,
        redis: makeRedisStub(),
      })

      let caught: unknown
      try {
        await router.routeTts({
          input: { text: 'hi', voice: 'bogus voice with spaces' },
          modelName: 'tts-test',
        })
      }
      catch (err) {
        caught = err
      }

      expect(caught).toBeInstanceOf(ApiError)
      expect((caught as ApiError).statusCode).toBe(400)
      // The adapter rejects before fetch; with the bug this would have walked
      // both keys (and pushed fallback counters). After the fix: zero fetch,
      // zero fallback bookkeeping.
      expect(fetchImpl).not.toHaveBeenCalled()
      expect((metrics.fallbackCount.add as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    })

    it('apiError 5xx (adapter-wrapped network failure) walks to the next key', async () => {
      // azure adapter wraps a fetch reject as createInternalError(500).
      // The router should treat that as a fallback-eligible network failure
      // and try the second key — not propagate the 500 as a final error.
      const { config, crypto } = makeTtsConfig({ upstreams: [{ adapterParams: { region: 'eastasia' }, baseURL: 'https://az.example', keyIds: ['kA1', 'kA2'] }] })

      let callIdx = 0
      const fetchImpl = vi.fn(async () => {
        callIdx += 1
        if (callIdx === 1)
          throw new TypeError('network unreachable')
        return new Response(new Uint8Array([0x01]), { headers: { 'content-type': 'audio/mpeg' }, status: 200 })
      })
      const metrics = makeMetrics()

      const router = createLlmRouterService({
        concurrencyLedger: makeLedger(),
        configKV: makeConfigKV(config),
        envelopeCrypto: crypto,
        fetchImpl,
        gatewayMetrics: metrics,
        redis: makeRedisStub(),
      })

      const res = await router.routeTts({
        input: { text: 'hi', voice: 'en-US-AvaMultilingualNeural' },
        modelName: 'tts-test',
      })

      expect(res.status).toBe(200)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      // Adapter-wrapped 500 is in the fallback list, so one fallback hop is
      // recorded between key 1 and key 2.
      expect((metrics.fallbackCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    })

    it('upstream `Error & { status: 401 }` folds into the existing fallback path', async () => {
      // azure adapter throws `Error & { status: number }` on upstream non-2xx
      // (see azure.ts:189-194). 401 is in fallbackHttpCodes so we must try
      // the next key.
      const { config, crypto } = makeTtsConfig({ upstreams: [{ adapterParams: { region: 'eastasia' }, baseURL: 'https://az.example', keyIds: ['kA1', 'kA2'] }] })

      let callIdx = 0
      const fetchImpl = vi.fn(async () => {
        callIdx += 1
        if (callIdx === 1)
          return failResponse(401)
        return new Response(new Uint8Array([0x01]), { headers: { 'content-type': 'audio/mpeg' }, status: 200 })
      })
      const metrics = makeMetrics()

      const router = createLlmRouterService({
        concurrencyLedger: makeLedger(),
        configKV: makeConfigKV(config),
        envelopeCrypto: crypto,
        fetchImpl,
        gatewayMetrics: metrics,
        redis: makeRedisStub(),
      })

      const res = await router.routeTts({
        input: { text: 'hi', voice: 'en-US-AvaMultilingualNeural' },
        modelName: 'tts-test',
      })

      expect(res.status).toBe(200)
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      const fallbackCalls = (metrics.fallbackCount.add as ReturnType<typeof vi.fn>).mock.calls
      expect(fallbackCalls.length).toBe(1)
      // Recorded reason matches the upstream status, not 'timeout' — that's
      // the regression: pre-fix this would have been 'timeout' because the
      // adapter's `Error & { status }` was read as undefined.
      expect(fallbackCalls[0][1]).toMatchObject({ reason: '401' })
    })

    it('records a terminal TTS exhaustion with its final status', async () => {
      const { config, crypto } = makeTtsConfig({
        upstreams: [{
          adapterParams: { region: 'eastasia' },
          baseURL: 'https://az.example',
          keyIds: ['kA1'],
        }],
      })
      const fetchImpl = vi.fn(async () => failResponse(451))
      const metrics = makeMetrics()

      const router = createLlmRouterService({
        concurrencyLedger: makeLedger(),
        configKV: makeConfigKV(config),
        envelopeCrypto: crypto,
        fetchImpl,
        gatewayMetrics: metrics,
        redis: makeRedisStub(),
      })

      await expect(router.routeTts({
        input: { text: 'hi', voice: 'en-US-AvaMultilingualNeural' },
        modelName: 'tts-test',
      })).rejects.toMatchObject({ statusCode: 502 })

      const exhaustionCalls = (metrics.keyExhaustedCount.add as ReturnType<typeof vi.fn>).mock.calls
      expect(exhaustionCalls.length).toBe(1)
      expect(exhaustionCalls[0][0]).toBe(1)
      expect(exhaustionCalls[0][1]).toMatchObject({
        provider: 'az.example',
        status_code: 451,
        surface: 'tts',
      })
    })

    it('listTtsVoices deduplicates concurrent cold-cache upstream fetches per model', async () => {
      // ROOT CAUSE:
      //
      // Azure voice catalogs are cached after a successful fetch, but concurrent
      // cold-cache requests used to miss Redis together and each hit unspeech's
      // microsoft voices endpoint. That can amplify one settings-page open into
      // several Azure voices/list calls and trigger upstream 429.
      //
      // We fixed this by sharing the in-flight catalog load for the same
      // provider/model cache key. Failures are still returned to every caller and
      // are not cached.
      const { config, crypto } = makeTtsConfig({
        upstreams: [{ adapterParams: { region: 'eastasia' }, baseURL: 'https://az.example', keyIds: ['kA1'] }],
      })

      let resolveFetch!: () => void
      const fetchImpl = vi.fn(() => new Promise<Response>((resolve) => {
        resolveFetch = () => resolve(happyResponse({
          voices: [{ id: 'en-US-AvaMultilingualNeural', name: 'Ava' }],
        }))
      }))

      const router = createLlmRouterService({
        concurrencyLedger: makeLedger(),
        configKV: makeConfigKV(config),
        envelopeCrypto: crypto,
        fetchImpl,
        gatewayMetrics: null,
        redis: makeRedisStub(),
      })

      const first = router.listTtsVoices('tts-test')
      const second = router.listTtsVoices('tts-test')

      await vi.waitFor(() => {
        expect(fetchImpl).toHaveBeenCalledTimes(1)
      })
      resolveFetch()

      const [firstVoices, secondVoices] = await Promise.all([first, second])
      expect(firstVoices.map(voice => voice.id)).toEqual(['en-US-AvaMultilingualNeural'])
      expect(secondVoices.map(voice => voice.id)).toEqual(['en-US-AvaMultilingualNeural'])
    })
  })

  describe('routeTts provider groups', () => {
    function endpointProfileFrom(init?: RequestInit): string {
      const body = JSON.parse(String(init?.body)) as {
        extra_body?: { endpoint_profile?: string }
      }
      return body.extra_body?.endpoint_profile ?? 'default'
    }

    function makeGroupedStepfunConfig(): { config: RouterConfig, crypto: ReturnType<typeof createEnvelopeCrypto> } {
      const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
      const modelName = 'stepfun/stepaudio-2.5-tts'
      const upstreams = [
        {
          baseURL: 'https://api.stepfun.com',
          endpointProfile: 'step-plan',
          id: 'plan-a',
          keyId: 'plan-key-a',
        },
        {
          baseURL: 'https://api.stepfun.com',
          endpointProfile: 'step-plan',
          id: 'plan-b',
          keyId: 'plan-key-b',
        },
        {
          baseURL: 'https://api.stepfun.com',
          endpointProfile: 'default',
          id: 'paygo',
          keyId: 'paygo-key',
        },
      ].map(upstream => ({
        adapterParams: {
          endpointProfile: upstream.endpointProfile,
          model: 'stepaudio-2.5-tts',
        },
        baseURL: upstream.baseURL,
        id: upstream.id,
        keys: [{
          ciphertext: crypto.encryptKey(`sk-${upstream.keyId}`, {
            keyEntryId: upstream.keyId,
            modelName,
          }),
          id: upstream.keyId,
        }],
      }))

      const config = {
        defaults: {
          fallbackHttpCodes: [401, 402, 429, 500, 502, 503, 504],
          fullChainTimeoutMs: 10000,
          perAttemptTimeoutMs: 5000,
        },
        llm: { models: {} },
        tts: {
          models: {
            [modelName]: {
              fallbackTriggers: {
                httpCodes: [401, 402, 429, 500, 502, 503, 504],
                onTimeout: true,
              },
              provider: 'stepfun',
              routing: {
                groups: [
                  {
                    continueOn: {
                      httpCodes: [402],
                      onTimeout: false,
                    },
                    id: 'plan',
                    retryOn: {
                      httpCodes: [402, 429, 500, 502, 503, 504],
                      onTimeout: true,
                    },
                    strategy: 'ordered',
                    upstreamIds: ['plan-a', 'plan-b'],
                  },
                  {
                    id: 'paygo',
                    retryOn: {
                      httpCodes: [429, 500, 502, 503, 504],
                      onTimeout: true,
                    },
                    strategy: 'ordered',
                    upstreamIds: ['paygo'],
                  },
                ],
              },
              upstreams,
            },
          },
        },
      } as unknown as RouterConfig

      return { config, crypto }
    }

    function makeGroupedStepfunRouter(
      fetchImpl: typeof fetch,
    ): ReturnType<typeof createLlmRouterService> {
      const { config, crypto } = makeGroupedStepfunConfig()
      return createLlmRouterService({
        concurrencyLedger: makeLedger(),
        configKV: makeConfigKV(config),
        envelopeCrypto: crypto,
        fetchImpl,
        gatewayMetrics: makeMetrics(),
        redis: makeRedisStub(),
      })
    }

    it('uses pay-as-you-go only after every Plan account reports quota exhaustion', async () => {
      const calledProfiles: string[] = []
      const fetchImpl = vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
        expect(String(input)).toBe('http://unspeech.local:5933/v1/audio/speech')
        const profile = endpointProfileFrom(init)
        calledProfiles.push(profile)
        if (profile === 'step-plan')
          return failResponse(402, { error: { code: 'quota_exceeded' } })
        return new Response(new Uint8Array([0x01]), {
          headers: { 'content-type': 'audio/mpeg' },
          status: 200,
        })
      }) as unknown as typeof fetch

      const router = makeGroupedStepfunRouter(fetchImpl)
      const response = await router.routeTts({
        input: { text: '你好' },
        modelName: 'stepfun/stepaudio-2.5-tts',
      })

      expect(response.status).toBe(200)
      expect(calledProfiles).toEqual(['step-plan', 'step-plan', 'default'])
    })

    it('stays inside the Plan group when a Plan account succeeds', async () => {
      const calledProfiles: string[] = []
      const fetchImpl = vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
        expect(String(input)).toBe('http://unspeech.local:5933/v1/audio/speech')
        calledProfiles.push(endpointProfileFrom(init))
        return new Response(new Uint8Array([0x01]), {
          headers: { 'content-type': 'audio/mpeg' },
          status: 200,
        })
      }) as unknown as typeof fetch

      const router = makeGroupedStepfunRouter(fetchImpl)
      const response = await router.routeTts({
        input: { text: '你好' },
        modelName: 'stepfun/stepaudio-2.5-tts',
      })

      expect(response.status).toBe(200)
      expect(calledProfiles).toEqual(['step-plan'])
    })

    it('requires UNSPEECH_UPSTREAM for an endpoint-profile request', async () => {
      const { config, crypto } = makeGroupedStepfunConfig()
      const configKV = makeConfigKV(config)
      const getOrThrow = vi.fn(async () => {
        throw new Error('UNSPEECH_UPSTREAM not configured')
      })
      Object.assign(configKV, { getOrThrow })
      const fetchImpl = vi.fn(async () => new Response(new Uint8Array([0x01]), {
        headers: { 'content-type': 'audio/mpeg' },
        status: 200,
      })) as unknown as typeof fetch
      const router = createLlmRouterService({
        concurrencyLedger: makeLedger(),
        configKV,
        envelopeCrypto: crypto,
        fetchImpl,
        gatewayMetrics: makeMetrics(),
        redis: makeRedisStub(),
      })

      await expect(router.routeTts({
        input: { text: '你好' },
        modelName: 'stepfun/stepaudio-2.5-tts',
      })).rejects.toThrow('UNSPEECH_UPSTREAM not configured')

      expect(fetchImpl).not.toHaveBeenCalled()
      expect(getOrThrow).toHaveBeenCalledWith('UNSPEECH_UPSTREAM')
    })

    it('requires UNSPEECH_UPSTREAM for the StepFun voice catalog', async () => {
      const { config, crypto } = makeGroupedStepfunConfig()
      const configKV = makeConfigKV(config)
      const getOrThrow = vi.fn(async () => {
        throw new Error('UNSPEECH_UPSTREAM not configured')
      })
      Object.assign(configKV, { getOrThrow })
      const fetchImpl = vi.fn() as unknown as typeof fetch
      const router = createLlmRouterService({
        concurrencyLedger: makeLedger(),
        configKV,
        envelopeCrypto: crypto,
        fetchImpl,
        gatewayMetrics: makeMetrics(),
        redis: makeRedisStub(),
      })

      await expect(
        router.listTtsVoices('stepfun/stepaudio-2.5-tts'),
      ).rejects.toThrow('UNSPEECH_UPSTREAM not configured')

      expect(fetchImpl).not.toHaveBeenCalled()
      expect(getOrThrow).toHaveBeenCalledWith('UNSPEECH_UPSTREAM')
    })

    it('keeps a Step Plan attempt timeout distinct from HTTP 500 at the paid boundary', async () => {
      const { config, crypto } = makeGroupedStepfunConfig()
      config.defaults!.perAttemptTimeoutMs = 10
      const model = config.tts.models['stepfun/stepaudio-2.5-tts']
      model.routing!.groups[0].continueOn = {
        httpCodes: [500],
        onTimeout: false,
      }
      const calledProfiles: string[] = []
      const fetchImpl = vi.fn((input: Request | string | URL, init?: RequestInit) => {
        expect(String(input)).toBe('http://unspeech.local:5933/v1/audio/speech')
        const profile = endpointProfileFrom(init)
        calledProfiles.push(profile)
        if (profile !== 'step-plan') {
          return Promise.resolve(new Response(new Uint8Array([0x01]), {
            headers: { 'content-type': 'audio/mpeg' },
            status: 200,
          }))
        }

        return new Promise<Response>((_, reject) => {
          const rejectAbort = () => reject(init?.signal?.reason ?? new Error('aborted'))
          if (init?.signal?.aborted)
            rejectAbort()
          else
            init?.signal?.addEventListener('abort', rejectAbort, { once: true })
        })
      }) as unknown as typeof fetch
      const router = createLlmRouterService({
        concurrencyLedger: makeLedger(),
        configKV: makeConfigKV(config),
        envelopeCrypto: crypto,
        fetchImpl,
        gatewayMetrics: makeMetrics(),
        redis: makeRedisStub(),
      })

      await expect(router.routeTts({
        input: { text: '你好' },
        modelName: 'stepfun/stepaudio-2.5-tts',
      })).rejects.toMatchObject({
        details: expect.objectContaining({ lastStatusCode: 'timeout' }),
        statusCode: 504,
      })

      expect(calledProfiles).toEqual(['step-plan', 'step-plan'])
      expect(calledProfiles).not.toContain('default')
    })

    it('does not cross the paid boundary when the Plan group is rate-limited', async () => {
      const calledProfiles: string[] = []
      const fetchImpl = vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
        expect(String(input)).toBe('http://unspeech.local:5933/v1/audio/speech')
        calledProfiles.push(endpointProfileFrom(init))
        return failResponse(429)
      }) as unknown as typeof fetch

      const router = makeGroupedStepfunRouter(fetchImpl)

      await expect(router.routeTts({
        input: { text: '你好' },
        modelName: 'stepfun/stepaudio-2.5-tts',
      })).rejects.toBeInstanceOf(ApiError)

      expect(calledProfiles).toEqual(['step-plan', 'step-plan'])
      expect(calledProfiles).not.toContain('default')
    })

    it('stops the provider route immediately on a Plan authentication failure', async () => {
      const calledProfiles: string[] = []
      const fetchImpl = vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
        expect(String(input)).toBe('http://unspeech.local:5933/v1/audio/speech')
        calledProfiles.push(endpointProfileFrom(init))
        return failResponse(401)
      }) as unknown as typeof fetch

      const router = makeGroupedStepfunRouter(fetchImpl)

      await expect(router.routeTts({
        input: { text: '你好' },
        modelName: 'stepfun/stepaudio-2.5-tts',
      })).rejects.toBeInstanceOf(ApiError)

      expect(calledProfiles).toEqual(['step-plan'])
    })
  })

  describe('routeTtspool capacity-aware routing', () => {
    // One app_id == one upstream (Volcengine `adapterParams.appid`), each capped
    // at `maxConcurrency`. The router spreads load least-inflight-first across pools
    // and circuit-breaks a pool on 429 (app_id concurrency exceeded upstream-side).
    function makePoolConfig(
      upstreams: Array<{ appid: string, baseURL: string, maxConcurrency?: number }>,
    ): { config: RouterConfig, crypto: ReturnType<typeof createEnvelopeCrypto> } {
      const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
      const modelName = 'tts-pool'
      const upstreamConfigs = upstreams.map((u, i) => {
        const id = `k${i}`
        const ct = crypto.encryptKey(`sk-${id}`, { keyEntryId: id, modelName })
        return {
          adapterParams: { appid: u.appid },
          baseURL: u.baseURL,
          keys: [{ ciphertext: ct, id }],
          ...(u.maxConcurrency != null ? { maxConcurrency: u.maxConcurrency } : {}),
        }
      })
      const config = {
        defaults: { fallbackHttpCodes: [401, 429, 500, 502, 503, 504], fullChainTimeoutMs: 10000, perAttemptTimeoutMs: 5000 },
        llm: { models: {} },
        tts: {
          models: {
            [modelName]: {
              fallbackTriggers: { httpCodes: [401, 429, 500, 502, 503, 504], onTimeout: true },
              provider: 'volcengine',
              upstreams: upstreamConfigs,
            },
          },
        },
      } as RouterConfig
      return { config, crypto }
    }

    // Stateful in-memory ledger so least-inflight ordering and capacity gating are
    // observable. `seed` pre-loads inflight counts to drive deterministic ranking.
    function makeStatefulLedger(seed: Record<string, number> = {}, saturatedSeed: string[] = []) {
      const inflight = new Map<string, number>(Object.entries(seed))
      const saturated = new Set<string>(saturatedSeed)
      const tryAcquire = vi.fn(async (poolId: string, max: number) => {
        const cur = inflight.get(poolId) ?? 0
        if (saturated.has(poolId) || cur >= max)
          return false
        inflight.set(poolId, cur + 1)
        return true
      })
      const release = vi.fn(async (poolId: string) => {
        inflight.set(poolId, Math.max(0, (inflight.get(poolId) ?? 0) - 1))
      })
      const markSaturated = vi.fn(async (poolId: string) => {
        saturated.add(poolId)
      })
      const ledger: ConcurrencyLedger = {
        currentInflight: vi.fn(async (poolId: string) => inflight.get(poolId) ?? 0),
        isSaturated: vi.fn(async (poolId: string) => saturated.has(poolId)),
        markSaturated,
        release,
        snapshot: vi.fn(async () => [...inflight].map(([poolId, n]) => ({ inflight: n, poolId }))),
        tryAcquire,
      }
      return { inflight, ledger, markSaturated, release, saturated, tryAcquire }
    }

    function makePoolRouter(config: RouterConfig, crypto: ReturnType<typeof createEnvelopeCrypto>, ledger: ConcurrencyLedger, fetchImpl: typeof fetch) {
      return createLlmRouterService({
        concurrencyLedger: ledger,
        configKV: makeConfigKV(config),
        envelopeCrypto: crypto,
        fetchImpl,
        gatewayMetrics: makeMetrics(),
        redis: makeRedisStub(),
      })
    }

    it('routes to the least-inflight pool (covers AE1 — load spread, not first-fill)', async () => {
      // @example two app_ids cap 10, seeded 8 vs 2 in-flight -> the new request
      // goes to the freer pool (app-2), not the config-first pool (app-1).
      const { config, crypto } = makePoolConfig([
        { appid: 'app-1', baseURL: 'https://up-a.example', maxConcurrency: 10 },
        { appid: 'app-2', baseURL: 'https://up-b.example', maxConcurrency: 10 },
      ])
      const { ledger, tryAcquire } = makeStatefulLedger({ 'app-1': 8, 'app-2': 2 })
      const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      const res = await router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })

      expect(res.status).toBe(200)
      expect(tryAcquire).toHaveBeenCalledTimes(1)
      expect(tryAcquire.mock.calls[0][0]).toBe('app-2')
    })

    it('ranks least-inflight accounts by current usage when concurrency caps differ', async () => {
      const { config, crypto } = makePoolConfig([
        { appid: 'app-1', baseURL: 'https://up-a.example', maxConcurrency: 100 },
        { appid: 'app-2', baseURL: 'https://up-b.example', maxConcurrency: 10 },
      ])
      const { ledger, tryAcquire } = makeStatefulLedger({ 'app-1': 50, 'app-2': 0 })
      const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      const response = await router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })

      expect(response.status).toBe(200)
      expect(tryAcquire).toHaveBeenCalledTimes(1)
      expect(tryAcquire).toHaveBeenCalledWith('app-2', 10)
    })

    it('namespaces a non-appid pool by model and upstream id', async () => {
      const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
      const modelName = 'stepfun/stepaudio-2.5-tts'
      const keyEntryId = 'plan-key'
      const config = {
        defaults: {
          fallbackHttpCodes: [402, 429, 500, 502, 503, 504],
          fullChainTimeoutMs: 10000,
          perAttemptTimeoutMs: 5000,
        },
        llm: { models: {} },
        tts: {
          models: {
            [modelName]: {
              fallbackTriggers: { httpCodes: [402, 429, 500, 502, 503, 504], onTimeout: true },
              provider: 'stepfun',
              routing: {
                groups: [{
                  id: 'plan',
                  retryOn: { httpCodes: [402, 429, 500, 502, 503, 504], onTimeout: true },
                  strategy: 'least-inflight',
                  upstreamIds: ['plan'],
                }],
              },
              upstreams: [{
                adapterParams: {
                  endpointProfile: 'step-plan',
                  model: 'stepaudio-2.5-tts',
                },
                baseURL: 'https://api.stepfun.com',
                id: 'plan',
                keys: [{
                  ciphertext: crypto.encryptKey('sk-plan', { keyEntryId, modelName }),
                  id: keyEntryId,
                }],
                maxConcurrency: 1,
              }],
            },
          },
        },
      } as RouterConfig
      const { ledger, tryAcquire } = makeStatefulLedger()
      const fetchImpl = vi.fn(async () => new Response(new Uint8Array([0x01]), {
        headers: { 'content-type': 'audio/mpeg' },
        status: 200,
      })) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      const response = await router.routeTts({ input: { text: 'hi' }, modelName })

      expect(response.status).toBe(200)
      expect(tryAcquire).toHaveBeenCalledWith(
        'model:["stepfun/stepaudio-2.5-tts","id","plan"]',
        1,
      )
    })

    it('enforces maxConcurrency for an ordered provider group', async () => {
      const { config, crypto } = makePoolConfig([
        { appid: 'app-1', baseURL: 'https://up-a.example', maxConcurrency: 10 },
      ])
      const model = config.tts.models['tts-pool']
      Object.assign(model.upstreams[0], { id: 'primary' })
      Object.assign(model, {
        routing: {
          groups: [{
            id: 'primary',
            retryOn: { httpCodes: [429, 500, 502, 503, 504], onTimeout: true },
            strategy: 'ordered',
            upstreamIds: ['primary'],
          }],
        },
      })
      const { ledger, release, tryAcquire } = makeStatefulLedger()
      const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      const response = await router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })

      expect(response.status).toBe(200)
      expect(tryAcquire).toHaveBeenCalledWith('app-1', 10)
      expect(release).toHaveBeenCalledWith('app-1')
    })

    it('keeps least-inflight selection inside the active group before considering pay-as-you-go', async () => {
      const { config, crypto } = makePoolConfig([
        { appid: 'plan-a', baseURL: 'https://plan-a.example', maxConcurrency: 10 },
        { appid: 'plan-b', baseURL: 'https://plan-b.example', maxConcurrency: 10 },
        { appid: 'paygo', baseURL: 'https://paygo.example' },
      ])
      const model = config.tts.models['tts-pool']
      Object.assign(model.upstreams[0], { id: 'plan-a' })
      Object.assign(model.upstreams[1], { id: 'plan-b' })
      Object.assign(model.upstreams[2], { id: 'paygo' })
      Object.assign(model, {
        routing: {
          groups: [
            {
              continueOn: { httpCodes: [402], onTimeout: false },
              id: 'plan',
              retryOn: { httpCodes: [429, 500, 502, 503, 504], onTimeout: true },
              strategy: 'least-inflight',
              upstreamIds: ['plan-a', 'plan-b'],
            },
            {
              id: 'paygo',
              retryOn: { httpCodes: [429, 500, 502, 503, 504], onTimeout: true },
              strategy: 'ordered',
              upstreamIds: ['paygo'],
            },
          ],
        },
      })
      const { ledger, tryAcquire } = makeStatefulLedger({ 'plan-a': 8, 'plan-b': 2 })
      const selectedAppIds: string[] = []
      const fetchImpl = vi.fn(async (_input: Request | string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { extra_body?: { app?: { appid?: string } } }
        selectedAppIds.push(body.extra_body?.app?.appid ?? 'unknown')
        return new Response(new Uint8Array([0x01]), {
          headers: { 'content-type': 'audio/mpeg' },
          status: 200,
        })
      }) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      const response = await router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })

      expect(response.status).toBe(200)
      expect(selectedAppIds).toEqual(['plan-b'])
      expect(tryAcquire).toHaveBeenCalledTimes(1)
      expect(tryAcquire).toHaveBeenCalledWith('plan-b', 10)
    })

    it('does not cross groups when a Plan account was skipped at its concurrency limit', async () => {
      const { config, crypto } = makePoolConfig([
        { appid: 'plan-a', baseURL: 'https://plan-a.example', maxConcurrency: 10 },
        { appid: 'plan-b', baseURL: 'https://plan-b.example', maxConcurrency: 10 },
        { appid: 'paygo', baseURL: 'https://paygo.example' },
      ])
      const model = config.tts.models['tts-pool']
      Object.assign(model.upstreams[0], { id: 'plan-a' })
      Object.assign(model.upstreams[1], { id: 'plan-b' })
      Object.assign(model.upstreams[2], { id: 'paygo' })
      Object.assign(model, {
        routing: {
          groups: [
            {
              continueOn: { httpCodes: [402], onTimeout: false },
              id: 'plan',
              retryOn: { httpCodes: [402, 429, 500, 502, 503, 504], onTimeout: true },
              strategy: 'least-inflight',
              upstreamIds: ['plan-a', 'plan-b'],
            },
            {
              id: 'paygo',
              retryOn: { httpCodes: [429, 500, 502, 503, 504], onTimeout: true },
              strategy: 'ordered',
              upstreamIds: ['paygo'],
            },
          ],
        },
      })
      const { ledger } = makeStatefulLedger({ 'plan-a': 10, 'plan-b': 0 })
      const selectedAppIds: string[] = []
      const fetchImpl = vi.fn(async (_input: Request | string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { extra_body?: { app?: { appid?: string } } }
        const appid = body.extra_body?.app?.appid ?? 'unknown'
        selectedAppIds.push(appid)
        if (appid === 'plan-b')
          return failResponse(402, { error: { code: 'quota_exceeded' } })
        return new Response(new Uint8Array([0x01]), {
          headers: { 'content-type': 'audio/mpeg' },
          status: 200,
        })
      }) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)

      await expect(router.routeTts({
        input: { text: 'hi' },
        modelName: 'tts-pool',
      })).rejects.toBeInstanceOf(ApiError)

      expect(selectedAppIds).toEqual(['plan-b'])
    })

    it('skips a fullpool and dispatches to one with capacity', async () => {
      // @example app-1 at cap (10/10) -> filtered out; app-2 (0/10) serves.
      const { config, crypto } = makePoolConfig([
        { appid: 'app-1', baseURL: 'https://up-a.example', maxConcurrency: 10 },
        { appid: 'app-2', baseURL: 'https://up-b.example', maxConcurrency: 10 },
      ])
      const { ledger, tryAcquire } = makeStatefulLedger({ 'app-1': 10, 'app-2': 0 })
      const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      const res = await router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })

      expect(res.status).toBe(200)
      expect(tryAcquire.mock.calls.every(([poolId]) => poolId !== 'app-1')).toBe(true)
      expect(tryAcquire.mock.calls.some(([poolId]) => poolId === 'app-2')).toBe(true)
    })

    it('fails fast with 503 TTS_POOL_SATURATED when everypool is full (covers AE2 — no silent stall)', async () => {
      // @example both app_ids at cap -> 503, upstream is never dispatched.
      const { config, crypto } = makePoolConfig([
        { appid: 'app-1', baseURL: 'https://up-a.example', maxConcurrency: 10 },
        { appid: 'app-2', baseURL: 'https://up-b.example', maxConcurrency: 10 },
      ])
      const { ledger } = makeStatefulLedger({ 'app-1': 10, 'app-2': 10 })
      const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      let caught: unknown
      try {
        await router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })
      }
      catch (err) {
        caught = err
      }

      expect(caught).toBeInstanceOf(ApiError)
      expect((caught as ApiError).statusCode).toBe(503)
      expect((caught as ApiError).errorCode).toBe('TTS_POOL_SATURATED')
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('releases the slot after a successful dispatch', async () => {
      // @example acquire then release leaves the pool's inflight back at baseline.
      const { config, crypto } = makePoolConfig([
        { appid: 'app-1', baseURL: 'https://up-a.example', maxConcurrency: 10 },
      ])
      const { inflight, ledger, release } = makeStatefulLedger({ 'app-1': 3 })
      const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      await router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })

      expect(release).toHaveBeenCalledWith('app-1')
      expect(inflight.get('app-1')).toBe(3)
    })

    it('makes zero ledger calls when no upstream declares maxConcurrency (no regression)', async () => {
      // @example a model without any concurrency cap keeps the original
      // fixed-order path and never touches Redis.
      const { config, crypto } = makePoolConfig([
        { appid: 'app-1', baseURL: 'https://up-a.example' },
      ])
      const { ledger, tryAcquire } = makeStatefulLedger()
      const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      const res = await router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })

      expect(res.status).toBe(200)
      expect(tryAcquire).not.toHaveBeenCalled()
    })

    it('marks a pool saturated when it exhausts with a 429 (covers AE3 — bad-pool circuit break)', async () => {
      // @example single pool returns 429 (app_id concurrency exceeded) -> the
      // pool is circuit-broken so later requests skip it during the cool-down.
      const { config, crypto } = makePoolConfig([
        { appid: 'app-1', baseURL: 'https://up-a.example', maxConcurrency: 10 },
      ])
      const { ledger, markSaturated } = makeStatefulLedger()
      const fetchImpl = vi.fn(async () => failResponse(429)) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      await expect(router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })).rejects.toBeInstanceOf(ApiError)

      expect(markSaturated).toHaveBeenCalledWith('app-1', expect.any(Number))
    })

    it('does NOT mark saturated when a pool exhausts with a non-429 status', async () => {
      // @example a 500 is a server error, not a concurrency signal — the pool
      // must stay eligible rather than being circuit-broken.
      const { config, crypto } = makePoolConfig([
        { appid: 'app-1', baseURL: 'https://up-a.example', maxConcurrency: 10 },
      ])
      const { ledger, markSaturated } = makeStatefulLedger()
      const fetchImpl = vi.fn(async () => failResponse(500)) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      await expect(router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })).rejects.toBeInstanceOf(ApiError)

      expect(markSaturated).not.toHaveBeenCalled()
    })

    it('skips a pool already in a saturation cool-down', async () => {
      // @example app-1 flagged saturated -> filtered out; app-2 serves.
      const { config, crypto } = makePoolConfig([
        { appid: 'app-1', baseURL: 'https://up-a.example', maxConcurrency: 10 },
        { appid: 'app-2', baseURL: 'https://up-b.example', maxConcurrency: 10 },
      ])
      const { ledger, tryAcquire } = makeStatefulLedger({}, ['app-1'])
      const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      const res = await router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })

      expect(res.status).toBe(200)
      expect(tryAcquire.mock.calls.every(([poolId]) => poolId !== 'app-1')).toBe(true)
      expect(tryAcquire.mock.calls.some(([poolId]) => poolId === 'app-2')).toBe(true)
    })

    it('skips an uncapped pool already in a saturation cool-down when another pool is capped', async () => {
      // ROOT CAUSE:
      //
      // Before the fix, the capacity-aware branch returned uncapped pools as
      // always eligible without reading the saturation flag. In mixed configs
      // (`app-1` uncapped, `app-2` capped), a 429-saturated uncapped app stayed
      // first because it had infinite remaining capacity.
      //
      // We fixed this by checking cooldown state before the capped/uncapped
      // branch so both pool shapes honor the same circuit breaker.
      const { config, crypto } = makePoolConfig([
        { appid: 'app-1', baseURL: 'https://up-a.example' },
        { appid: 'app-2', baseURL: 'https://up-b.example', maxConcurrency: 10 },
      ])
      const { ledger, tryAcquire } = makeStatefulLedger({}, ['app-1'])
      const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

      const router = makePoolRouter(config, crypto, ledger, fetchImpl)
      const res = await router.routeTts({ input: { text: 'hi' }, modelName: 'tts-pool' })

      expect(res.status).toBe(200)
      expect(tryAcquire).toHaveBeenCalledTimes(1)
      expect(tryAcquire).toHaveBeenCalledWith('app-2', 10)
    })
  })
})
