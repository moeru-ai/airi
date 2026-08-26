import type { RouterConfig } from '../../services/domain/llm-router/types'
import type { ProviderCatalogService } from '../../services/domain/provider-catalog'

import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { createEnvelopeCrypto } from '../../utils/envelope-crypto'
import { ApiError } from '../../utils/error'
import { resolveOfficialAliyunNlsCredentials, resolveOfficialAliyunNlsCredentialsFromConfig } from './route'

function createProviderCatalogService(routeModelId = 'auto'): ProviderCatalogService {
  return {
    resolveEnabledAlias: vi.fn(async () => ({
      aliasId: 'auto',
      createdAt: new Date(),
      displayName: 'Auto',
      displayOrder: 0,
      enabled: true,
      fallbackEnabled: true,
      id: 'alias-auto',
      loadBalancingEnabled: false,
      routes: [{
        aliasId: 'alias-auto',
        createdAt: new Date(),
        displayOrder: 0,
        enabled: true,
        id: 'route-1',
        pool: 'primary',
        routerModelId: routeModelId,
        updatedAt: new Date(),
        weight: 1,
      }],
      surface: 'asr',
      updatedAt: new Date(),
    })),
    syncAliasesFromRouterConfig: vi.fn(async () => []),
  } as unknown as ProviderCatalogService
}

function createRouterConfig(overrides?: Partial<RouterConfig>): RouterConfig {
  return {
    defaults: {
      fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504],
      fullChainTimeoutMs: 60000,
      perAttemptTimeoutMs: 30000,
    },
    llm: { models: {} },
    tts: { models: {} },
    ...overrides,
  }
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
      keyEntryId: 'aliyun-nls-asr-prod-1',
      modelName: 'auto',
    })

    const credentials = resolveOfficialAliyunNlsCredentials(createRouterConfig({
      asr: {
        models: {
          auto: {
            provider: 'aliyun-nls',
            upstreams: [{
              adapterParams: {
                accessKeyId: ' ak ',
                appKey: ' app ',
                region: '',
              },
              keys: [{ ciphertext, id: 'aliyun-nls-asr-prod-1' }],
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
      keyEntryId: 'aliyun-nls-asr-prod-1',
      modelName: 'aliyun/asr-primary',
    })
    const routerConfig = createRouterConfig({
      asr: {
        models: {
          'aliyun/asr-primary': {
            provider: 'aliyun-nls',
            upstreams: [{
              adapterParams: {
                accessKeyId: 'ak',
                appKey: 'app',
              },
              keys: [{ ciphertext, id: 'aliyun-nls-asr-prod-1' }],
            }],
          },
        },
      },
    })
    const providerCatalogService = createProviderCatalogService('aliyun/asr-primary')

    const credentials = await resolveOfficialAliyunNlsCredentialsFromConfig({
      configKV: { getOptional: vi.fn(async () => routerConfig) } as never,
      envelopeCrypto: envelope,
      providerCatalogService,
    })

    expect(credentials).toMatchObject({
      accessKeyId: 'ak',
      accessKeySecret: 'secret',
      appKey: 'app',
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
              adapterParams: {},
              keys: [{ ciphertext: 'unused', id: 'aliyun-nls-asr-prod-1' }],
            }],
          },
        },
      },
    })

    await expect(resolveOfficialAliyunNlsCredentialsFromConfig({
      configKV: { getOptional: vi.fn(async () => routerConfig) } as never,
      envelopeCrypto: envelope,
      providerCatalogService,
    })).rejects.toMatchObject({
      errorCode: 'CAPABILITY_ALIAS_DISABLED',
      statusCode: 400,
    })
  })
})
