import type { RouterConfig } from '../../services/domain/llm-router/types'
import type { OfficialCatalogService } from '../../services/domain/official-catalog'

import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { createEnvelopeCrypto } from '../../utils/envelope-crypto'
import { ApiError } from '../../utils/error'
import { resolveOfficialAliyunNlsCredentials, resolveOfficialAliyunNlsCredentialsFromConfig } from './route'

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

function createOfficialCatalogService(routeModelId = 'auto'): OfficialCatalogService {
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
  } as unknown as OfficialCatalogService
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
    const officialCatalogService = createOfficialCatalogService('aliyun/asr-primary')

    const credentials = await resolveOfficialAliyunNlsCredentialsFromConfig({
      configKV: { getOptional: vi.fn(async () => routerConfig) } as never,
      envelopeCrypto: envelope,
      officialCatalogService,
    })

    expect(credentials).toMatchObject({
      accessKeyId: 'ak',
      accessKeySecret: 'secret',
      appKey: 'app',
    })
    expect(officialCatalogService.syncAliasesFromRouterConfig).toHaveBeenCalledWith({
      surface: 'asr',
      modelIds: ['aliyun/asr-primary'],
    })
    expect(officialCatalogService.resolveEnabledAlias).toHaveBeenCalledWith('asr', 'auto')
  })

  it('rejects disabled official ASR aliases before credentials are used', async () => {
    const envelope = createEnvelopeCrypto({ masterKey: Buffer.alloc(32, 7) })
    const officialCatalogService = createOfficialCatalogService()
    vi.mocked(officialCatalogService.resolveEnabledAlias).mockRejectedValueOnce(
      new ApiError(400, 'OFFICIAL_ALIAS_DISABLED', 'Official provider alias is disabled'),
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

    await expect(resolveOfficialAliyunNlsCredentialsFromConfig({
      configKV: { getOptional: vi.fn(async () => routerConfig) } as never,
      envelopeCrypto: envelope,
      officialCatalogService,
    })).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'OFFICIAL_ALIAS_DISABLED',
    })
  })
})
