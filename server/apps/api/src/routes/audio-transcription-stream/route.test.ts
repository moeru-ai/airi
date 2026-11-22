import type { RouterConfig } from '../../services/domain/llm-router/types'
import type { ProviderCatalogService } from '../../services/domain/provider-catalog'

import { Buffer } from 'node:buffer'

import { ApiError } from '@proj-airi/http-error-shared'
import { describe, expect, it, vi } from 'vitest'

import { createEnvelopeCrypto } from '../../utils/envelope-crypto'
import { resolveOfficialAliyunNlsCredentials, resolveOfficialAsrRouteFromConfig, resolveOfficialDashScopeFunAsrCredentials } from './route'

function createRouterConfig(overrides?: Partial<RouterConfig>): RouterConfig {
  return {
    llm: { models: {} },
    tts: { models: {} },
    defaults: {
      perAttemptTimeoutMs: 30000,
      fullChainTimeoutMs: 60000,
      fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504],
    },
    ...overrides,
  }
}

function createProviderCatalogService(routeModelId = 'auto'): ProviderCatalogService {
  return {
    syncAliasesFromRouterConfig: vi.fn(async () => []),
    resolveEnabledAlias: vi.fn(async () => ({
      id: 'alias-auto',
      surface: 'asr',
      aliasId: 'auto',
      displayName: 'Auto',
      enabled: true,
      displayOrder: 0,
      fallbackEnabled: true,
      loadBalancingEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      routes: [{
        id: 'route-1',
        aliasId: 'alias-auto',
        routerModelId: routeModelId,
        pool: 'primary',
        enabled: true,
        weight: 1,
        displayOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
    })),
  } as unknown as ProviderCatalogService
}

describe('resolveOfficialAliyunNlsCredentials', () => {
  /**
   * @example
   * resolveOfficialAliyunNlsCredentials(routerConfig, envelope, 'auto')
   */
  it('returns null when official ASR model config is absent', () => {
    const envelope = createEnvelopeCrypto({ masterKey: Buffer.alloc(32, 7) })

    const credentials = resolveOfficialAliyunNlsCredentials(createRouterConfig(), envelope, 'auto')

    expect(credentials).toBeNull()
  })

  /**
   * @example
   * resolveOfficialAliyunNlsCredentials(routerConfig, envelope, 'auto')
   */
  it('decrypts Aliyun NLS credentials from LLM_ROUTER_CONFIG.asr', () => {
    const envelope = createEnvelopeCrypto({ masterKey: Buffer.alloc(32, 7) })
    const ciphertext = envelope.encryptKey(' secret ', {
      modelName: 'auto',
      keyEntryId: 'aliyun-nls-asr-prod-1',
    })

    const credentials = resolveOfficialAliyunNlsCredentials(createRouterConfig({
      asr: {
        models: {
          auto: {
            provider: 'aliyun-nls',
            upstreams: [{
              keys: [{ id: 'aliyun-nls-asr-prod-1', ciphertext }],
              adapterParams: {
                accessKeyId: ' ak ',
                appKey: ' app ',
                region: '',
              },
            }],
          },
        },
      },
    }), envelope, 'auto')

    expect(credentials).toEqual({
      accessKeyId: 'ak',
      accessKeySecret: 'secret',
      appKey: 'app',
      region: 'cn-shanghai',
    })
  })

  it('resolves official ASR alias through the catalog before decrypting credentials', async () => {
    const envelope = createEnvelopeCrypto({ masterKey: Buffer.alloc(32, 7) })
    const ciphertext = envelope.encryptKey(' secret ', {
      modelName: 'aliyun/asr-primary',
      keyEntryId: 'aliyun-nls-asr-prod-1',
    })
    const routerConfig = createRouterConfig({
      asr: {
        models: {
          'aliyun/asr-primary': {
            provider: 'aliyun-nls',
            upstreams: [{
              keys: [{ id: 'aliyun-nls-asr-prod-1', ciphertext }],
              adapterParams: {
                accessKeyId: 'ak',
                appKey: 'app',
              },
            }],
          },
        },
      },
    })
    const providerCatalogService = createProviderCatalogService('aliyun/asr-primary')

    const asrRoute = await resolveOfficialAsrRouteFromConfig({
      configKV: { getOptional: vi.fn(async () => routerConfig) } as never,
      envelopeCrypto: envelope,
      providerCatalogService,
    })

    expect(asrRoute).toMatchObject({
      provider: 'aliyun-nls',
      credentials: {
        accessKeyId: 'ak',
        accessKeySecret: 'secret',
        appKey: 'app',
      },
    })
    expect(providerCatalogService.syncAliasesFromRouterConfig).not.toHaveBeenCalled()
    expect(providerCatalogService.resolveEnabledAlias).toHaveBeenCalledWith('asr', 'auto')
  })

  it('rejects disabled ASR capability aliases before credentials are used', async () => {
    const envelope = createEnvelopeCrypto({ masterKey: Buffer.alloc(32, 7) })
    const providerCatalogService = createProviderCatalogService()
    vi.mocked(providerCatalogService.resolveEnabledAlias).mockRejectedValueOnce(
      new ApiError(400, 'CAPABILITY_ALIAS_DISABLED', 'Capability alias is disabled'),
    )
    const routerConfig = createRouterConfig({
      asr: {
        models: {
          auto: {
            provider: 'aliyun-nls',
            upstreams: [{
              keys: [{ id: 'aliyun-nls-asr-prod-1', ciphertext: 'unused' }],
              adapterParams: {},
            }],
          },
        },
      },
    })

    await expect(resolveOfficialAsrRouteFromConfig({
      configKV: { getOptional: vi.fn(async () => routerConfig) } as never,
      envelopeCrypto: envelope,
      providerCatalogService,
    })).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'CAPABILITY_ALIAS_DISABLED',
    })
  })
})

describe('resolveOfficialDashScopeFunAsrCredentials', () => {
  function funAsrConfig(envelope: ReturnType<typeof createEnvelopeCrypto>, adapterParams: Record<string, unknown>) {
    const ciphertext = envelope.encryptKey(' sk-test ', { modelName: 'auto', keyEntryId: 'fun-asr-1' })
    return createRouterConfig({
      asr: {
        models: {
          auto: {
            provider: 'dashscope-fun-asr',
            upstreams: [{ keys: [{ id: 'fun-asr-1', ciphertext }], adapterParams }],
          },
        },
      },
    })
  }

  /**
   * @example
   * resolveOfficialDashScopeFunAsrCredentials(routerConfig, envelope, 'auto')
   */
  it('uses the Singapore endpoint and defaults when adapter params are empty', () => {
    const envelope = createEnvelopeCrypto({ masterKey: Buffer.alloc(32, 7) })

    expect(resolveOfficialDashScopeFunAsrCredentials(funAsrConfig(envelope, {}), envelope)).toEqual({
      apiKey: 'sk-test',
      model: 'fun-asr-realtime',
      websocketURL: 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference',
      maxSentenceSilenceMs: 400,
    })
  })

  it('reads the endpoint, model, and sentence silence from adapter params', () => {
    const envelope = createEnvelopeCrypto({ masterKey: Buffer.alloc(32, 7) })
    const config = funAsrConfig(envelope, { websocketURL: 'wss://asr.example.com/ws', model: 'fun-asr-realtime-2026-02-28', maxSentenceSilenceMs: 600 })

    expect(resolveOfficialDashScopeFunAsrCredentials(config, envelope)).toMatchObject({
      model: 'fun-asr-realtime-2026-02-28',
      websocketURL: 'wss://asr.example.com/ws',
      maxSentenceSilenceMs: 600,
    })
  })

  it('returns null for an out-of-range sentence silence', () => {
    const envelope = createEnvelopeCrypto({ masterKey: Buffer.alloc(32, 7) })

    expect(resolveOfficialDashScopeFunAsrCredentials(funAsrConfig(envelope, { maxSentenceSilenceMs: 100 }), envelope)).toBeNull()
  })

  it('routes the official alias to Fun-ASR when the model uses that provider', async () => {
    const envelope = createEnvelopeCrypto({ masterKey: Buffer.alloc(32, 7) })
    const routerConfig = funAsrConfig(envelope, {})

    await expect(resolveOfficialAsrRouteFromConfig({
      configKV: { getOptional: vi.fn(async () => routerConfig) } as never,
      envelopeCrypto: envelope,
      providerCatalogService: createProviderCatalogService(),
    })).resolves.toMatchObject({ provider: 'dashscope-fun-asr', credentials: { apiKey: 'sk-test' } })
  })
})
