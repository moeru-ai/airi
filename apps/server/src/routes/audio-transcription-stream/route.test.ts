import type { RouterConfig } from '../../services/domain/llm-router/types'

import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { createEnvelopeCrypto } from '../../utils/envelope-crypto'
import { resolveOfficialAliyunNlsCredentials } from './route'

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
})
