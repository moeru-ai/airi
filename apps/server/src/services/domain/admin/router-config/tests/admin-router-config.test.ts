import type Redis from 'ioredis'

import type { ConfigKVService } from '../../../../adapters/config-kv'

import { randomBytes } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildAliyunNlsAsrSlice,
  buildAzureSlice,
  buildBedrockSlice,
  buildDashscopeSlice,
  buildNextRouterConfig,
  buildOpenRouterSlice,
  buildStepfunSlice,
  buildUnspeechSlice,
  createAdminRouterConfigService,
  redactCiphertext,
} from '..'
import { createEnvelopeCrypto } from '../../../../../utils/envelope-crypto'

function freshEnvelope() {
  return createEnvelopeCrypto({ masterKey: randomBytes(32) })
}

const DEFAULT_FALLBACK_TRIGGERS = {
  httpCodes: [401, 402, 403, 429, 500, 502, 503, 504],
  onTimeout: true,
}

interface FakeConfigKV {
  store: Map<string, unknown>
  service: ConfigKVService
  publishedChannels: { channel: string, payload: string }[]
}

/**
 * In-memory fake for ConfigKVService + a thin Redis publish stub.
 *
 * Use when:
 * - Service tests need to assert which configKV entries got written and
 *   which channel publishes fired, without touching real Redis.
 */
function fakeConfigKV(): FakeConfigKV {
  const store = new Map<string, unknown>()
  const service: Partial<ConfigKVService> = {
    async getOptional(key: string) {
      return (store.get(key) ?? null) as never
    },
    async getOrThrow(key: string) {
      const v = store.get(key)
      if (v === undefined)
        throw new Error(`fake getOrThrow missing ${key}`)
      return v as never
    },
    async get(key: string) {
      return this.getOrThrow!(key as never)
    },
    async set(key: string, value: unknown) {
      store.set(key, value)
    },
  }
  return { store, service: service as ConfigKVService, publishedChannels: [] }
}

function fakeRedis(captured: { channel: string, payload: string }[]): Redis {
  return {
    publish: vi.fn(async (channel: string, payload: string) => {
      captured.push({ channel, payload })
      return 1
    }),
  } as unknown as Redis
}

describe('redactCiphertext', () => {
  it('replaces ciphertext strings with a length tag', () => {
    const input = {
      keys: [{ id: 'k1', ciphertext: 'a'.repeat(100) }],
      adapterParams: { nested: { ciphertext: 'b'.repeat(50) } },
    }
    expect(redactCiphertext(input)).toEqual({
      keys: [{ id: 'k1', ciphertext: '<ciphertext: 100 chars>' }],
      adapterParams: { nested: { ciphertext: '<ciphertext: 50 chars>' } },
    })
  })

  it('leaves non-ciphertext fields unchanged', () => {
    expect(redactCiphertext({ baseURL: 'https://x', count: 3, flag: true })).toEqual({
      baseURL: 'https://x',
      count: 3,
      flag: true,
    })
  })

  it('walks arrays', () => {
    expect(redactCiphertext([{ ciphertext: 'xx' }, { ciphertext: 'yyy' }])).toEqual([
      { ciphertext: '<ciphertext: 2 chars>' },
      { ciphertext: '<ciphertext: 3 chars>' },
    ])
  })
})

describe('buildOpenRouterSlice', () => {
  it('encrypts the plaintext key under {modelName, keyEntryId} AAD', () => {
    const envelope = freshEnvelope()
    const built = buildOpenRouterSlice({
      kind: 'openrouter',
      modelName: 'chat-default',
      overrideModel: 'openai/gpt-4o-mini',
      plaintextKey: 'sk-or-secret',
    }, envelope)

    expect(built.target).toBe('llm-router')
    expect(built.surface).toBe('llm')
    expect(built.modelName).toBe('chat-default')
    expect(built.keyEntryId).toBe('openrouter-prod-1')

    const upstream = built.model.upstreams[0]
    expect(upstream.baseURL).toBe('https://openrouter.ai/api/v1')
    expect(upstream.overrideModel).toBe('openai/gpt-4o-mini')
    expect(upstream.headerTemplate).toBe('Bearer {KEY}')
    expect(built.model.fallbackTriggers).toEqual(DEFAULT_FALLBACK_TRIGGERS)

    // Round-trip the ciphertext under the same AAD — guards against the
    // AAD getting silently changed (which would surface as DECRYPT_FAILED
    // at gateway runtime, but never in tests like this if we only checked
    // the ciphertext length).
    const decrypted = envelope.decryptKey(upstream.keys[0].ciphertext, {
      modelName: 'chat-default',
      keyEntryId: 'openrouter-prod-1',
    })
    expect(decrypted.toString('utf8')).toBe('sk-or-secret')
  })

  it('respects custom baseURL, keyEntryId, and headerTemplate', () => {
    const envelope = freshEnvelope()
    const built = buildOpenRouterSlice({
      kind: 'openrouter',
      modelName: 'chat-default',
      overrideModel: 'openai/gpt-4o-mini',
      plaintextKey: 'sk',
      baseURL: 'https://proxy.example/api/v1',
      keyEntryId: 'openrouter-prod-2',
      headerTemplate: 'X-Custom-Token {KEY}',
    }, envelope)

    expect(built.keyEntryId).toBe('openrouter-prod-2')
    expect(built.model.upstreams[0].baseURL).toBe('https://proxy.example/api/v1')
    expect(built.model.upstreams[0].headerTemplate).toBe('X-Custom-Token {KEY}')
    expect(built.model.upstreams[0].keys[0].id).toBe('openrouter-prod-2')
  })
})

describe('buildBedrockSlice', () => {
  it('accepts and encrypts multi-kilobyte Bedrock bearer tokens', () => {
    const envelope = freshEnvelope()
    const token = `bedrock-api-key-${'x'.repeat(2200)}`
    const built = buildBedrockSlice({
      kind: 'bedrock',
      modelName: 'chat-bedrock',
      overrideModel: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      plaintextKey: token,
    }, envelope)

    expect(built.kind).toBe('bedrock')
    expect(built.keyEntryId).toBe('bedrock-prod-1')
    expect(built.model.upstreams[0].baseURL).toBe('https://bedrock-mantle.us-east-1.api.aws/v1')

    const decrypted = envelope.decryptKey(built.model.upstreams[0].keys[0].ciphertext, {
      modelName: 'chat-bedrock',
      keyEntryId: 'bedrock-prod-1',
    })
    expect(decrypted.toString('utf8')).toBe(token)
  })
})

describe('buildAzureSlice', () => {
  it('builds the cognitiveservices baseURL from region and surfaces region in adapterParams', () => {
    const envelope = freshEnvelope()
    const built = buildAzureSlice({
      kind: 'azure',
      modelName: 'microsoft/v1',
      region: 'eastasia',
      defaultVoice: 'en-US-AvaMultilingualNeural',
      plaintextKey: 'azure-key',
    }, envelope)

    expect(built.kind).toBe('azure')
    expect(built.model.provider).toBe('azure')
    expect(built.model.upstreams[0].baseURL).toBe('https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1')
    expect(built.model.upstreams[0].adapterParams).toEqual({
      region: 'eastasia',
      defaultVoice: 'en-US-AvaMultilingualNeural',
    })
    expect(built.model.fallbackTriggers).toEqual(DEFAULT_FALLBACK_TRIGGERS)

    const decrypted = envelope.decryptKey(built.model.upstreams[0].keys[0].ciphertext, {
      modelName: 'microsoft/v1',
      keyEntryId: 'azure-tts-prod-1',
    })
    expect(decrypted.toString('utf8')).toBe('azure-key')
  })
})

describe('buildAliyunNlsAsrSlice', () => {
  /**
   * @example
   * buildAliyunNlsAsrSlice({ kind: 'aliyun-nls-asr', modelName: 'auto', accessKeyId: 'ak', appKey: 'app', plaintextKey: 'secret' }, envelope)
   */
  it('encrypts the access key secret under the ASR model AAD', () => {
    const envelope = freshEnvelope()
    const built = buildAliyunNlsAsrSlice({
      kind: 'aliyun-nls-asr',
      modelName: 'auto',
      accessKeyId: 'ak',
      appKey: 'app',
      plaintextKey: 'secret',
    }, envelope)

    expect(built.target).toBe('llm-router')
    expect(built.surface).toBe('asr')
    expect(built.modelName).toBe('auto')
    expect(built.keyEntryId).toBe('aliyun-nls-asr-prod-1')
    expect(built.model.provider).toBe('aliyun-nls')
    expect(built.model.upstreams[0].adapterParams).toEqual({
      accessKeyId: 'ak',
      appKey: 'app',
      region: 'cn-shanghai',
    })

    const decrypted = envelope.decryptKey(built.model.upstreams[0].keys[0].ciphertext, {
      modelName: 'auto',
      keyEntryId: 'aliyun-nls-asr-prod-1',
    })
    expect(decrypted.toString('utf8')).toBe('secret')
  })
})

describe('buildDashscopeSlice', () => {
  it.each([
    ['intl', 'dashscope-intl.aliyuncs.com'],
    ['cn', 'dashscope.aliyuncs.com'],
  ] as const)('uses the %s region host', (region, host) => {
    const envelope = freshEnvelope()
    const built = buildDashscopeSlice({
      kind: 'dashscope-cosyvoice',
      modelName: 'alibaba/cosyvoice-v2',
      region,
      upstreamModel: 'cosyvoice-v2',
      plaintextKey: 'sk-dash',
    }, envelope)

    expect(built.model.upstreams[0].baseURL).toBe(`https://${host}/api/v1/services/audio/tts/SpeechSynthesizer`)
    expect(built.model.upstreams[0].adapterParams).toEqual({ model: 'cosyvoice-v2' })
    expect(built.model.fallbackTriggers).toEqual(DEFAULT_FALLBACK_TRIGGERS)
  })
})

describe('buildStepfunSlice', () => {
  it('builds the StepFun TTS endpoint and surfaces model defaults in adapterParams', () => {
    const envelope = freshEnvelope()
    const built = buildStepfunSlice({
      kind: 'stepfun',
      modelName: 'stepfun/stepaudio-2.5-tts',
      upstreamModel: 'stepaudio-2.5-tts',
      defaultVoice: 'cixingnansheng',
      instruction: '温柔、克制、有一点笑意',
      plaintextKey: 'step-key',
    }, envelope)

    expect(built.kind).toBe('stepfun')
    expect(built.model.provider).toBe('stepfun')
    expect(built.model.upstreams[0].baseURL).toBe('https://api.stepfun.com/v1/audio/speech')
    expect(built.model.upstreams[0].adapterParams).toEqual({
      model: 'stepaudio-2.5-tts',
      defaultVoice: 'cixingnansheng',
      instruction: '温柔、克制、有一点笑意',
    })
    expect(built.model.fallbackTriggers).toEqual(DEFAULT_FALLBACK_TRIGGERS)

    const decrypted = envelope.decryptKey(built.model.upstreams[0].keys[0].ciphertext, {
      modelName: 'stepfun/stepaudio-2.5-tts',
      keyEntryId: 'stepfun-tts-prod-1',
    })
    expect(decrypted.toString('utf8')).toBe('step-key')
  })
})

describe('buildUnspeechSlice', () => {
  it('writes restBaseURL with no streaming subtree when the slice omits streaming', () => {
    const envelope = freshEnvelope()
    const built = buildUnspeechSlice({
      kind: 'unspeech',
      restBaseURL: 'http://unspeech.example:5933',
    }, envelope)

    expect(built.target).toBe('unspeech')
    expect(built.value.restBaseURL).toBe('http://unspeech.example:5933')
    expect(built.value.streaming).toBeUndefined()
    expect(built.keyEntryId).toBeNull()
  })

  it('encrypts streaming.plaintextKey under the streaming-tts AAD model label (must match audio-speech-ws decrypt)', () => {
    const envelope = freshEnvelope()
    const built = buildUnspeechSlice({
      kind: 'unspeech',
      restBaseURL: 'http://unspeech.example:5933',
      streaming: {
        upstreamURL: 'ws://unspeech.example:5933/v1/audio/speech/stream',
        plaintextKey: 'volc-key',
      },
    }, envelope)

    expect(built.target).toBe('unspeech')
    expect(built.value.streaming?.baseURL).toBe('ws://unspeech.example:5933/v1/audio/speech/stream')

    // The AAD modelName MUST be the literal 'streaming-tts' — anything else
    // surfaces as DECRYPT_FAILED at session start in audio-speech-ws.
    const ct = built.value.streaming!.keys[0].ciphertext
    const decrypted = envelope.decryptKey(ct, {
      modelName: 'streaming-tts',
      keyEntryId: 'volcengine-prod-1',
    })
    expect(decrypted.toString('utf8')).toBe('volc-key')
  })
})

describe('buildNextRouterConfig', () => {
  it('merge mode preserves models not touched this run', () => {
    const envelope = freshEnvelope()
    const existing = {
      llm: {
        models: {
          'untouched-chat': {
            upstreams: [{ baseURL: 'https://old', keys: [{ id: 'k', ciphertext: 'c' }], headerTemplate: 'Bearer {KEY}' }],
            fallbackTriggers: DEFAULT_FALLBACK_TRIGGERS,
          },
        },
      },
      tts: {
        models: {
          'untouched-tts': {
            provider: 'azure' as const,
            upstreams: [{ baseURL: 'https://old-tts', keys: [{ id: 'k', ciphertext: 'c' }], adapterParams: {} }],
            fallbackTriggers: DEFAULT_FALLBACK_TRIGGERS,
          },
        },
      },
      defaults: { perAttemptTimeoutMs: 12345, fullChainTimeoutMs: 60000, fallbackHttpCodes: [500] },
    }
    const newSlice = buildOpenRouterSlice({
      kind: 'openrouter',
      modelName: 'chat-default',
      overrideModel: 'openai/gpt-4o-mini',
      plaintextKey: 'sk',
    }, envelope)

    const next = buildNextRouterConfig('merge', existing, [newSlice])

    expect(Object.keys(next.llm.models).sort()).toEqual(['chat-default', 'untouched-chat'])
    expect(Object.keys(next.tts.models)).toEqual(['untouched-tts'])
    // Defaults preserved verbatim in merge mode — the admin endpoint does
    // not currently re-tune timeouts, and zeroing them would silently break
    // gateway timeouts.
    expect(next.defaults?.perAttemptTimeoutMs).toBe(12345)
  })

  it('reset mode drops every prior entry and uses default timeouts', () => {
    const envelope = freshEnvelope()
    const existing = {
      llm: {
        models: {
          old: {
            upstreams: [{ baseURL: 'https://old', keys: [{ id: 'k', ciphertext: 'c' }], headerTemplate: 'Bearer {KEY}' }],
            fallbackTriggers: DEFAULT_FALLBACK_TRIGGERS,
          },
        },
      },
      tts: { models: {} },
      defaults: { perAttemptTimeoutMs: 12345, fullChainTimeoutMs: 60000, fallbackHttpCodes: [500] },
    }
    const newSlice = buildOpenRouterSlice({
      kind: 'openrouter',
      modelName: 'chat-default',
      overrideModel: 'openai/gpt-4o-mini',
      plaintextKey: 'sk',
    }, envelope)

    const next = buildNextRouterConfig('reset', existing, [newSlice])

    expect(Object.keys(next.llm.models)).toEqual(['chat-default'])
    expect(next.defaults?.perAttemptTimeoutMs).toBe(30000)
  })

  it('starts from empty when existing is null (first-time bootstrap)', () => {
    const envelope = freshEnvelope()
    const newSlice = buildAzureSlice({
      kind: 'azure',
      modelName: 'microsoft/v1',
      region: 'eastasia',
      plaintextKey: 'azure-key',
    }, envelope)

    const next = buildNextRouterConfig('merge', null, [newSlice])
    expect(Object.keys(next.llm.models)).toEqual([])
    expect(Object.keys(next.tts.models)).toEqual(['microsoft/v1'])
  })
})

describe('createAdminRouterConfigService', () => {
  let kv: FakeConfigKV
  let captured: { channel: string, payload: string }[]
  let redis: Redis
  let envelope: ReturnType<typeof createEnvelopeCrypto>

  beforeEach(() => {
    kv = fakeConfigKV()
    captured = []
    redis = fakeRedis(captured)
    envelope = freshEnvelope()
  })

  it('dry-run returns redacted preview without touching the store or pub/sub', async () => {
    const service = createAdminRouterConfigService({ configKV: kv.service, envelope, redis })
    const result = await service.apply({
      mode: 'merge',
      dryRun: true,
      slices: [{
        kind: 'openrouter',
        modelName: 'chat-default',
        overrideModel: 'openai/gpt-4o-mini',
        plaintextKey: 'sk-or-secret',
      }],
      defaults: {
        chatModel: 'chat-default',
        ttsVoices: {
          'alibaba/cosyvoice-v2': { 'zh-CN': 'longxiaochun_v2' },
        },
      },
    })

    expect(kv.store.size).toBe(0)
    expect(captured).toEqual([])
    expect(result.invalidatedKeys).toEqual([])

    // Preview must redact ciphertext — leaking plaintext OR raw ciphertext
    // back to admin response would be a regression.
    const preview = result.preview.LLM_ROUTER_CONFIG as { llm: { models: Record<string, { upstreams: { keys: { ciphertext: string }[] }[] }> } }
    const ct = preview.llm.models['chat-default'].upstreams[0].keys[0].ciphertext
    expect(ct).toMatch(/^<ciphertext: \d+ chars>$/)
    expect(ct).not.toContain('sk-or-secret')

    expect(result.preview.DEFAULT_CHAT_MODEL).toBe('chat-default')
    expect(result.preview.DEFAULT_TTS_VOICES).toEqual({
      'alibaba/cosyvoice-v2': { 'zh-CN': 'longxiaochun_v2' },
    })
  })

  it('writes LLM_ROUTER_CONFIG, DEFAULT_CHAT_MODEL, and publishes invalidation', async () => {
    const service = createAdminRouterConfigService({ configKV: kv.service, envelope, redis })
    const result = await service.apply({
      mode: 'reset',
      dryRun: false,
      slices: [{
        kind: 'openrouter',
        modelName: 'chat-default',
        overrideModel: 'openai/gpt-4o-mini',
        plaintextKey: 'sk',
      }],
      defaults: { chatModel: 'chat-default' },
    })

    expect(kv.store.has('LLM_ROUTER_CONFIG')).toBe(true)
    expect(kv.store.get('DEFAULT_CHAT_MODEL')).toBe('chat-default')
    expect(result.invalidatedKeys.sort()).toEqual(['DEFAULT_CHAT_MODEL', 'LLM_ROUTER_CONFIG'])
    expect(captured.map(p => JSON.parse(p.payload).key).sort()).toEqual(['DEFAULT_CHAT_MODEL', 'LLM_ROUTER_CONFIG'])
  })

  it('writes DEFAULT_TTS_VOICES without requiring provider slices', async () => {
    const service = createAdminRouterConfigService({ configKV: kv.service, envelope, redis })
    const result = await service.apply({
      mode: 'merge',
      dryRun: false,
      slices: [],
      defaults: {
        ttsVoices: {
          'alibaba/cosyvoice-v2': {
            'zh-CN': 'longxiaochun_v2',
            'en-US': 'loongava_v2',
          },
          'volcengine/seed-tts-2.0': {
            'zh-CN': 'zh_female_vv_uranus_bigtts',
          },
        },
      },
    })

    expect(kv.store.get('DEFAULT_TTS_VOICES')).toEqual({
      'alibaba/cosyvoice-v2': {
        'zh-CN': 'longxiaochun_v2',
        'en-US': 'loongava_v2',
      },
      'volcengine/seed-tts-2.0': {
        'zh-CN': 'zh_female_vv_uranus_bigtts',
      },
    })
    expect(kv.store.has('LLM_ROUTER_CONFIG')).toBe(false)
    expect(result.preview.DEFAULT_TTS_VOICES).toEqual(kv.store.get('DEFAULT_TTS_VOICES'))
    expect(result.invalidatedKeys).toEqual(['DEFAULT_TTS_VOICES'])
    expect(captured.map(p => JSON.parse(p.payload).key)).toEqual(['DEFAULT_TTS_VOICES'])
  })

  it('writes UNSPEECH_UPSTREAM and publishes invalidation when an unspeech slice is included', async () => {
    const service = createAdminRouterConfigService({ configKV: kv.service, envelope, redis })
    const result = await service.apply({
      mode: 'merge',
      dryRun: false,
      slices: [{
        kind: 'unspeech',
        restBaseURL: 'http://unspeech.example:5933',
        streaming: {
          upstreamURL: 'wss://unspeech.example/v1/audio/speech/stream',
          plaintextKey: 'volc',
          models: [
            { id: 'volcengine/seed-tts-2.0', name: 'Seed-TTS 2.0', description: 'Low-latency streaming TTS' },
          ],
          defaultModel: 'volcengine/seed-tts-2.0',
        },
      }],
    })

    expect(kv.store.has('UNSPEECH_UPSTREAM')).toBe(true)
    expect(kv.store.get('UNSPEECH_UPSTREAM')).toMatchObject({
      streaming: {
        models: [
          { id: 'volcengine/seed-tts-2.0', name: 'Seed-TTS 2.0', description: 'Low-latency streaming TTS' },
        ],
        defaultModel: 'volcengine/seed-tts-2.0',
      },
    })
    expect(kv.store.has('LLM_ROUTER_CONFIG')).toBe(false)
    expect(result.invalidatedKeys).toEqual(['UNSPEECH_UPSTREAM'])
    expect(captured.map(p => JSON.parse(p.payload).key)).toEqual(['UNSPEECH_UPSTREAM'])
  })

  it('rejects multiple unspeech slices', async () => {
    const service = createAdminRouterConfigService({ configKV: kv.service, envelope, redis })
    await expect(service.apply({
      mode: 'merge',
      dryRun: true,
      slices: [
        { kind: 'unspeech', restBaseURL: 'http://a' },
        { kind: 'unspeech', restBaseURL: 'http://b' },
      ],
    })).rejects.toThrow(/At most one unspeech/i)
  })

  it('merge mode reads existing LLM_ROUTER_CONFIG and preserves untouched models', async () => {
    // Seed an existing entry directly into the fake store, matching the
    // shape configKV.getOptional would have returned after a prior admin call.
    kv.store.set('LLM_ROUTER_CONFIG', {
      llm: { models: { 'preexisting-chat': { upstreams: [{ baseURL: 'https://x', keys: [{ id: 'k', ciphertext: 'c' }], headerTemplate: 'Bearer {KEY}' }] } } },
      tts: { models: {} },
      defaults: { perAttemptTimeoutMs: 30000, fullChainTimeoutMs: 60000, fallbackHttpCodes: [500] },
    })

    const service = createAdminRouterConfigService({ configKV: kv.service, envelope, redis })
    await service.apply({
      mode: 'merge',
      dryRun: false,
      slices: [{
        kind: 'azure',
        modelName: 'microsoft/v1',
        region: 'eastasia',
        plaintextKey: 'azure-key',
      }],
    })

    const written = kv.store.get('LLM_ROUTER_CONFIG') as { llm: { models: Record<string, unknown> }, tts: { models: Record<string, unknown> } }
    expect(Object.keys(written.llm.models)).toEqual(['preexisting-chat'])
    expect(Object.keys(written.tts.models)).toEqual(['microsoft/v1'])
  })

  it('current returns editable slices from configKV without exposing raw ciphertext', async () => {
    kv.store.set('LLM_ROUTER_CONFIG', {
      llm: {
        models: {
          'chat-live': {
            upstreams: [{
              baseURL: 'https://openrouter.ai/api/v1',
              overrideModel: 'openai/gpt-4.1-mini',
              keys: [{ id: 'openrouter-live', ciphertext: 'secret-ciphertext' }],
              headerTemplate: 'Bearer {KEY}',
            }],
            fallbackTriggers: DEFAULT_FALLBACK_TRIGGERS,
          },
        },
      },
      tts: { models: {} },
      defaults: { perAttemptTimeoutMs: 30000, fullChainTimeoutMs: 60000, fallbackHttpCodes: [500] },
    })
    kv.store.set('DEFAULT_CHAT_MODEL', 'chat-live')

    const service = createAdminRouterConfigService({ configKV: kv.service, envelope, redis })
    const current = await service.current()

    expect(current.request.slices).toEqual([{
      kind: 'openrouter',
      modelName: 'chat-live',
      overrideModel: 'openai/gpt-4.1-mini',
      baseURL: 'https://openrouter.ai/api/v1',
      headerTemplate: 'Bearer {KEY}',
      keyEntryId: 'openrouter-live',
      existingKeyEntryId: 'openrouter-live',
    }])
    expect(current.request.defaults.chatModel).toBe('chat-live')
    expect(JSON.stringify(current.preview)).toContain('<ciphertext: 17 chars>')
    expect(JSON.stringify(current.preview)).not.toContain('secret-ciphertext')
  })

  it('current classifies Bedrock and generic OpenAI-compatible LLM upstreams by baseURL', async () => {
    kv.store.set('LLM_ROUTER_CONFIG', {
      llm: {
        models: {
          'chat-bedrock': {
            upstreams: [{
              baseURL: 'https://bedrock-mantle.us-east-1.api.aws/v1',
              overrideModel: 'us.amazon.nova-pro-v1:0',
              keys: [{ id: 'bedrock-live', ciphertext: 'bedrock-ciphertext' }],
              headerTemplate: 'Bearer {KEY}',
            }],
            fallbackTriggers: DEFAULT_FALLBACK_TRIGGERS,
          },
          'chat-compatible': {
            upstreams: [{
              baseURL: 'https://llm.example.com/v1',
              overrideModel: 'gpt-4o-mini',
              keys: [{ id: 'compatible-live', ciphertext: 'compatible-ciphertext' }],
              headerTemplate: 'Bearer {KEY}',
            }],
            fallbackTriggers: DEFAULT_FALLBACK_TRIGGERS,
          },
        },
      },
      tts: { models: {} },
      defaults: { perAttemptTimeoutMs: 30000, fullChainTimeoutMs: 60000, fallbackHttpCodes: [500] },
    })

    const service = createAdminRouterConfigService({ configKV: kv.service, envelope, redis })
    const current = await service.current()

    expect(current.request.slices).toEqual([
      {
        kind: 'bedrock',
        modelName: 'chat-bedrock',
        overrideModel: 'us.amazon.nova-pro-v1:0',
        baseURL: 'https://bedrock-mantle.us-east-1.api.aws/v1',
        headerTemplate: 'Bearer {KEY}',
        keyEntryId: 'bedrock-live',
        existingKeyEntryId: 'bedrock-live',
      },
      {
        kind: 'openai-compatible',
        modelName: 'chat-compatible',
        overrideModel: 'gpt-4o-mini',
        baseURL: 'https://llm.example.com/v1',
        headerTemplate: 'Bearer {KEY}',
        keyEntryId: 'compatible-live',
        existingKeyEntryId: 'compatible-live',
      },
    ])
  })

  it('preserves an existing key entry when an applied slice omits plaintextKey', async () => {
    kv.store.set('LLM_ROUTER_CONFIG', {
      llm: {
        models: {
          'chat-live': {
            upstreams: [{
              baseURL: 'https://openrouter.ai/api/v1',
              overrideModel: 'openai/gpt-4.1-mini',
              keys: [{ id: 'openrouter-live', ciphertext: 'secret-ciphertext' }],
              headerTemplate: 'Bearer {KEY}',
            }],
            fallbackTriggers: DEFAULT_FALLBACK_TRIGGERS,
          },
        },
      },
      tts: { models: {} },
      defaults: { perAttemptTimeoutMs: 30000, fullChainTimeoutMs: 60000, fallbackHttpCodes: [500] },
    })

    const service = createAdminRouterConfigService({ configKV: kv.service, envelope, redis })
    await service.apply({
      mode: 'merge',
      dryRun: false,
      slices: [{
        kind: 'openrouter',
        modelName: 'chat-live',
        overrideModel: 'openai/gpt-4.1-mini',
        baseURL: 'https://proxy.example/api/v1',
        keyEntryId: 'openrouter-live',
        existingKeyEntryId: 'openrouter-live',
      }],
    })

    const written = kv.store.get('LLM_ROUTER_CONFIG') as { llm: { models: Record<string, { upstreams: Array<{ baseURL: string, keys: Array<{ id: string, ciphertext: string }> }> }> } }
    const upstream = written.llm.models['chat-live'].upstreams[0]
    expect(upstream.baseURL).toBe('https://proxy.example/api/v1')
    expect(upstream.keys).toEqual([{ id: 'openrouter-live', ciphertext: 'secret-ciphertext' }])
  })

  it('reset mode skips the existing read and drops prior entries', async () => {
    kv.store.set('LLM_ROUTER_CONFIG', {
      llm: { models: { 'should-be-dropped': { upstreams: [{ baseURL: 'https://x', keys: [{ id: 'k', ciphertext: 'c' }], headerTemplate: 'Bearer {KEY}' }] } } },
      tts: { models: {} },
      defaults: { perAttemptTimeoutMs: 30000, fullChainTimeoutMs: 60000, fallbackHttpCodes: [500] },
    })

    const getOptionalSpy = vi.spyOn(kv.service, 'getOptional')

    const service = createAdminRouterConfigService({ configKV: kv.service, envelope, redis })
    await service.apply({
      mode: 'reset',
      dryRun: false,
      slices: [{
        kind: 'openrouter',
        modelName: 'chat-default',
        overrideModel: 'openai/gpt-4o-mini',
        plaintextKey: 'sk',
      }],
    })

    expect(getOptionalSpy).not.toHaveBeenCalled()
    const written = kv.store.get('LLM_ROUTER_CONFIG') as { llm: { models: Record<string, unknown> } }
    expect(Object.keys(written.llm.models)).toEqual(['chat-default'])
  })

  it('returns per-slice applied summaries that the audit log can use', async () => {
    const service = createAdminRouterConfigService({ configKV: kv.service, envelope, redis })
    const result = await service.apply({
      mode: 'merge',
      dryRun: true,
      slices: [
        { kind: 'openrouter', modelName: 'chat-default', overrideModel: 'openai/gpt-4o-mini', plaintextKey: 'sk' },
        { kind: 'dashscope-cosyvoice', modelName: 'alibaba/cosyvoice-v2', region: 'intl', upstreamModel: 'cosyvoice-v2', plaintextKey: 'sk' },
        { kind: 'stepfun', modelName: 'stepfun/stepaudio-2.5-tts', upstreamModel: 'stepaudio-2.5-tts', plaintextKey: 'sk' },
      ],
    })

    expect(result.applied).toEqual([
      { kind: 'openrouter', target: 'llm-router', surface: 'llm', modelName: 'chat-default', keyEntryId: 'openrouter-prod-1' },
      { kind: 'dashscope-cosyvoice', target: 'llm-router', surface: 'tts', modelName: 'alibaba/cosyvoice-v2', keyEntryId: 'dashscope-tts-prod-1' },
      { kind: 'stepfun', target: 'llm-router', surface: 'tts', modelName: 'stepfun/stepaudio-2.5-tts', keyEntryId: 'stepfun-tts-prod-1' },
    ])
  })
})
