import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { RouterConfig } from '../../services/domain/llm-router/types'
import type { ProviderCatalogService } from '../../services/domain/provider-catalog'
import type { EnvelopeCrypto } from '../../utils/envelope-crypto'

import { createKeyRotator } from '../../services/domain/llm-router/key-rotator'

/** Aliyun NLS regions supported by the official ASR router configuration. */
export type AliyunNlsRegion = 'cn-shanghai' | 'cn-shanghai-internal' | 'cn-beijing' | 'cn-beijing-internal' | 'cn-shenzhen' | 'cn-shenzhen-internal'

/** Decrypted Aliyun NLS credentials used for one official ASR session. */
export interface AliyunNlsCredentials {
  accessKeyId: string
  accessKeySecret: string
  appKey: string
  region: AliyunNlsRegion
}

const ALIYUN_NLS_REGION_FALLBACK: AliyunNlsRegion = 'cn-shanghai'
const ALIYUN_NLS_REGIONS = new Set<AliyunNlsRegion>([
  'cn-shanghai',
  'cn-shanghai-internal',
  'cn-beijing',
  'cn-beijing-internal',
  'cn-shenzhen',
  'cn-shenzhen-internal',
])

const OFFICIAL_ASR_MODEL_NAME = 'auto'

function stringAdapterParam(params: Record<string, unknown> | undefined, key: string): string {
  const value = params?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

/** Resolves Aliyun NLS credentials for one router model. */
export function resolveOfficialAliyunNlsCredentials(
  routerConfig: RouterConfig | null | undefined,
  envelopeCrypto: EnvelopeCrypto,
  modelName: string = OFFICIAL_ASR_MODEL_NAME,
): AliyunNlsCredentials | null {
  const model = routerConfig?.asr?.models[modelName]
  const upstream = model?.upstreams[0]
  if (model?.provider !== 'aliyun-nls' || !upstream)
    return null

  const iterator = createKeyRotator(upstream, envelopeCrypto, modelName, null, model.provider)[Symbol.iterator]()
  const next = iterator.next()
  if (next.done)
    return null

  const accessKeySecretBytes = next.value.plaintext
  try {
    const accessKeyId = stringAdapterParam(upstream.adapterParams, 'accessKeyId')
    const accessKeySecret = accessKeySecretBytes.toString('utf8').trim()
    const appKey = stringAdapterParam(upstream.adapterParams, 'appKey')
    const rawRegion = stringAdapterParam(upstream.adapterParams, 'region')
    if (!accessKeyId || !accessKeySecret || !appKey)
      return null

    const region = ALIYUN_NLS_REGIONS.has(rawRegion as AliyunNlsRegion)
      ? rawRegion as AliyunNlsRegion
      : ALIYUN_NLS_REGION_FALLBACK

    return { accessKeyId, accessKeySecret, appKey, region }
  }
  finally {
    accessKeySecretBytes.fill(0)
  }
}

/** Resolves the enabled official ASR alias before it decrypts the upstream key. */
export async function resolveOfficialAliyunNlsCredentialsFromConfig(input: {
  configKV: ConfigKVService
  envelopeCrypto: EnvelopeCrypto
  providerCatalogService: ProviderCatalogService
}): Promise<AliyunNlsCredentials | null> {
  const routerConfig = await input.configKV.getOptional('LLM_ROUTER_CONFIG')
  if (Object.keys(routerConfig?.asr?.models ?? {}).length === 0)
    return null

  const alias = await input.providerCatalogService.resolveEnabledAlias('asr', OFFICIAL_ASR_MODEL_NAME)
  const primary = alias.routes.find(route => route.pool === 'primary')
  const modelName = (primary ?? alias.routes[0]).routerModelId
  return resolveOfficialAliyunNlsCredentials(routerConfig, input.envelopeCrypto, modelName)
}
