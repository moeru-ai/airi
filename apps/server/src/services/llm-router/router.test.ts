import type { Buffer } from 'node:buffer'

import type { Counter } from '@opentelemetry/api'

import type { GatewayMetrics } from '../../otel'
import type { ConfigKVService } from '../config-kv'
import type { RouterConfig } from './types'

import { randomBytes } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEnvelopeCrypto } from '../../utils/envelope-crypto'
import { ApiError } from '../../utils/error'
import { createLlmRouterService } from './router'

function freshMasterKey(): Buffer {
  return randomBytes(32)
}

function makeCounter(): Counter {
  return { add: vi.fn() } as unknown as Counter
}

function makeMetrics(): GatewayMetrics {
  return {
    fallbackCount: makeCounter(),
    upstreamErrors: makeCounter(),
    keyExhaustedCount: makeCounter(),
    sameStatusExhaustion: makeCounter(),
    configReload: makeCounter(),
    decryptFailures: makeCounter(),
    subscriberState: makeCounter(),
    configWrite: makeCounter(),
    configInvalidHmac: makeCounter(),
  } as GatewayMetrics
}

function makeConfigKV(config: RouterConfig | null): ConfigKVService {
  return {
    getOptional: vi.fn(async (key: string) => (key === 'LLM_ROUTER_CONFIG' ? config : null)),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  } as unknown as ConfigKVService
}

function makeConfig(opts: {
  upstreams?: Array<{ baseURL: string, keyIds: string[], overrideModel?: string, timeoutMs?: number }>
  fallbackHttpCodes?: number[]
}): { config: RouterConfig, ciphertextByKey: Map<string, string>, crypto: ReturnType<typeof createEnvelopeCrypto> } {
  const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
  const modelName = 'openai/gpt-5-mini'
  const ciphertextByKey = new Map<string, string>()

  const upstreams = opts.upstreams ?? [{ baseURL: 'https://up-a.example/v1', keyIds: ['kA1'] }]
  const upstreamConfigs = upstreams.map(u => ({
    baseURL: u.baseURL,
    overrideModel: u.overrideModel,
    headerTemplate: 'Bearer {KEY}',
    timeoutMs: u.timeoutMs,
    keys: u.keyIds.map((id) => {
      const plaintext = `sk-${id}`
      const ct = crypto.encryptKey(plaintext, { modelName, keyEntryId: id })
      ciphertextByKey.set(id, ct)
      return { id, ciphertext: ct }
    }),
  }))

  const config: RouterConfig = {
    llm: {
      models: {
        [modelName]: {
          upstreams: upstreamConfigs,
          fallbackTriggers: {
            httpCodes: opts.fallbackHttpCodes ?? [401, 402, 403, 429, 500, 502, 503, 504],
            onTimeout: true,
          },
        },
      },
    },
    tts: { models: {} },
    defaults: {
      perAttemptTimeoutMs: 30000,
      fullChainTimeoutMs: 60000,
      fallbackHttpCodes: opts.fallbackHttpCodes ?? [401, 402, 403, 429, 500, 502, 503, 504],
    },
  } as RouterConfig

  return { config, ciphertextByKey, crypto }
}

function happyResponse(bodyJson: object) {
  return new Response(JSON.stringify(bodyJson), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function failResponse(status: number) {
  return new Response(JSON.stringify({ error: 'bad' }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
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
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: metrics,
      fetchImpl,
    })

    const res = await router.route({ modelName: 'openai/gpt-5-mini', body: { messages: [] } })
    expect(res.status).toBe(200)
    expect(fetchImpl.mock.calls.length).toBe(1)
    expect((metrics.fallbackCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
    expect((metrics.keyExhaustedCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it('happy path injects Bearer + model + url correctly', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1/', keyIds: ['kA1'] }] })
    const fetchImpl: typeof fetch = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

    const router = createLlmRouterService({
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: null,
      fetchImpl,
    })

    await router.route({ modelName: 'openai/gpt-5-mini', body: { messages: [{ role: 'user', content: 'hi' }] } })

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls[0][0]).toBe('https://up.example/v1/chat/completions')
    const init = calls[0][1] as Parameters<typeof fetch>[1] & { headers: Record<string, string>, body: string, method: string }
    expect(init.headers.authorization).toBe('Bearer sk-kA1')
    expect(init.headers['content-type']).toBe('application/json')
    expect(init.method).toBe('POST')
    const sent = JSON.parse(init.body) as { model: string, messages: unknown }
    expect(sent.model).toBe('openai/gpt-5-mini')
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('uses upstream.overrideModel when set (so admin can rewrite the model id sent upstream)', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1', keyIds: ['kA1'], overrideModel: 'real/upstream-id' }] })
    const fetchImpl: typeof fetch = vi.fn(async () => happyResponse({ ok: 1 })) as unknown as typeof fetch

    const router = createLlmRouterService({
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: null,
      fetchImpl,
    })

    await router.route({ modelName: 'openai/gpt-5-mini', body: { messages: [] } })
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls
    const init = calls[0][1] as { body: string }
    expect((JSON.parse(init.body) as { model: string }).model).toBe('real/upstream-id')
  })

  it('multi-key fallback: k1=401 then k2=200 → returns 200 and records fallbackCount once', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up-a.example/v1', keyIds: ['k1', 'k2'] }] })
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failResponse(401))
      .mockResolvedValueOnce(happyResponse({ ok: 1 }))
    const metrics = makeMetrics()

    const router = createLlmRouterService({
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: metrics,
      fetchImpl,
    })

    const res = await router.route({ modelName: 'openai/gpt-5-mini', body: {} })
    expect(res.status).toBe(200)
    expect(fetchImpl.mock.calls.length).toBe(2)

    expect((metrics.fallbackCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    const fbArgs = (metrics.fallbackCount.add as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(fbArgs[0]).toBe(1)
    expect(fbArgs[1]).toMatchObject({ from_key: 'k1', reason: '401' })

    expect((metrics.upstreamErrors.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    expect((metrics.keyExhaustedCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it('cross-upstream fallback: upstream A keys all 401, upstream B[0] = 200 → returns 200, A exhaustion counted', async () => {
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
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: metrics,
      fetchImpl,
    })

    const res = await router.route({ modelName: 'openai/gpt-5-mini', body: {} })
    expect(res.status).toBe(200)
    expect(fetchImpl.mock.calls.length).toBe(3)

    expect((metrics.keyExhaustedCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
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
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: metrics,
      fetchImpl,
    })

    try {
      await router.route({ modelName: 'openai/gpt-5-mini', body: {} })
      throw new Error('expected throw')
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).statusCode).toBe(502)
      expect((err as ApiError).errorCode).toBe('BAD_GATEWAY')
      expect((err as ApiError).details).toMatchObject({ triedKeys: 2, triedUpstreams: 2, lastStatusCode: 401 })
    }

    expect((metrics.keyExhaustedCount.add as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
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
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: metrics,
      fetchImpl,
    })

    await expect(router.route({ modelName: 'openai/gpt-5-mini', body: {} })).rejects.toMatchObject({ statusCode: 503, errorCode: 'SERVICE_UNAVAILABLE' })

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
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: null,
      fetchImpl,
    })

    try {
      await router.route({ modelName: 'openai/gpt-5-mini', body: {} })
      throw new Error('expected throw')
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).statusCode).toBe(504)
      expect((err as ApiError).errorCode).toBe('GATEWAY_TIMEOUT')
      expect((err as ApiError).details).toMatchObject({ triedKeys: 3, triedUpstreams: 2, lastStatusCode: 'timeout' })
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
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: null,
      fetchImpl,
    })

    const res = await router.route({ modelName: 'openai/gpt-5-mini', body: {} })
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
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: null,
      fetchImpl,
    })

    try {
      await router.route({ modelName: 'openai/gpt-5-mini', body: {} })
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
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: metrics,
      fetchImpl,
    })

    try {
      await router.route({ modelName: 'nope/unknown', body: {} })
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
      configKV: makeConfigKV(null),
      envelopeCrypto: crypto,
      gatewayMetrics: null,
      fetchImpl,
    })

    await expect(router.route({ modelName: 'whatever', body: {} })).rejects.toMatchObject({ statusCode: 503, errorCode: 'CONFIG_NOT_SET' })
    expect(fetchImpl.mock.calls.length).toBe(0)
  })

  it('caller AbortSignal already-aborted → throws without dispatching any fetch', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1', keyIds: ['k1'] }] })
    const fetchImpl = vi.fn()
    const ctrl = new AbortController()
    ctrl.abort(new Error('client-disconnected'))

    const router = createLlmRouterService({
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: null,
      fetchImpl,
    })

    await expect(router.route({ modelName: 'openai/gpt-5-mini', body: {}, abortSignal: ctrl.signal })).rejects.toThrow(/client-disconnected/)
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
      configKV: makeConfigKV(config),
      envelopeCrypto: crypto,
      gatewayMetrics: null,
      fetchImpl,
    })

    await expect(router.route({ modelName: 'openai/gpt-5-mini', body: {}, abortSignal: ctrl.signal })).rejects.toThrow(/client-disconnected/)
    // No fallback to k2: caller-abort short-circuits the loop.
    expect(fetchImpl.mock.calls.length).toBe(1)
  })

  it('config invalidate hook clears the cache (re-reads on next call)', async () => {
    const { config, crypto } = makeConfig({ upstreams: [{ baseURL: 'https://up.example/v1', keyIds: ['k1'] }] })
    const configKV = makeConfigKV(config)
    const fetchImpl = vi.fn(async () => happyResponse({ ok: 1 }))

    const router = createLlmRouterService({
      configKV,
      envelopeCrypto: crypto,
      gatewayMetrics: null,
      fetchImpl,
    })

    await router.route({ modelName: 'openai/gpt-5-mini', body: {} })
    router.invalidateConfig()
    await router.route({ modelName: 'openai/gpt-5-mini', body: {} })

    // 2 fetches + 2 configKV reads (because invalidate fired between them)
    expect(fetchImpl.mock.calls.length).toBe(2)
    expect((configKV.getOptional as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })
})
