import type { Context } from 'hono'

import type { Database } from '../../libs/db'
import type { Env } from '../../libs/env'
import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { RouterConfig } from '../../services/domain/llm-router/types'
import type { ProviderCatalogService } from '../../services/domain/provider-catalog'
import type { EnvelopeCrypto } from '../../utils/envelope-crypto'

import { createServiceUnavailableError, createUnauthorizedError } from '@proj-airi/http-error-shared'
import { integer, maxValue, minValue, number, object, optional, pipe, safeParse, string, trim, url } from 'valibot'

import { resolveRequestAuth } from '../../libs/request-auth'
import { createKeyRotator } from '../../services/domain/llm-router/key-rotator'
import { createDashScopeFunAsrStreamResponse, DASHSCOPE_FUN_ASR_DEFAULT_MODEL, DASHSCOPE_FUN_ASR_DEFAULT_SENTENCE_SILENCE_MS, DASHSCOPE_INTL_INFERENCE_WS_URL } from './dashscope-fun-asr-session'
import { createAliyunNlsStreamResponse } from './session'

type AliyunNlsRegion = 'cn-shanghai' | 'cn-shanghai-internal' | 'cn-beijing' | 'cn-beijing-internal' | 'cn-shenzhen' | 'cn-shenzhen-internal'

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

const funAsrAdapterParamsSchema = object({
  websocketURL: optional(pipe(string(), trim(), url())),
  model: optional(pipe(string(), trim())),
  maxSentenceSilenceMs: optional(pipe(number(), integer(), minValue(200), maxValue(6000))),
})

function stringAdapterParam(params: Record<string, unknown> | undefined, key: string): string {
  const value = params?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Resolves optional official Aliyun NLS credentials from router config.
 *
 * Use when:
 * - The realtime transcription route needs to decide whether official ASR is configured.
 *
 * Expects:
 * - `LLM_ROUTER_CONFIG.asr.models[modelName]` is an `aliyun-nls` model.
 * - The first upstream key ciphertext stores the access key secret.
 * - `adapterParams.accessKeyId` and `adapterParams.appKey` are present.
 *
 * Returns:
 * - Decrypted credentials, or `null` when any required config is missing.
 */
export function resolveOfficialAliyunNlsCredentials(
  routerConfig: RouterConfig | null | undefined,
  envelopeCrypto: EnvelopeCrypto,
  modelName: string = OFFICIAL_ASR_MODEL_NAME,
) {
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

    return {
      accessKeyId,
      accessKeySecret,
      appKey,
      region,
    }
  }
  finally {
    accessKeySecretBytes.fill(0)
  }
}

/**
 * Resolves the official Model Studio Fun-ASR credentials from router config.
 *
 * Use when:
 * - The official ASR model uses the `dashscope-fun-asr` provider.
 *
 * Expects:
 * - The first upstream key ciphertext stores the Model Studio API key.
 * - Optional `adapterParams`: `websocketURL`, `model`, and `maxSentenceSilenceMs` (200 to 6000).
 *
 * Returns:
 * - Decrypted credentials, or `null` when the model is not a Fun-ASR model, has no key, or has invalid params.
 */
export function resolveOfficialDashScopeFunAsrCredentials(
  routerConfig: RouterConfig | null | undefined,
  envelopeCrypto: EnvelopeCrypto,
  modelName: string = OFFICIAL_ASR_MODEL_NAME,
) {
  const model = routerConfig?.asr?.models[modelName]
  const upstream = model?.upstreams[0]
  if (model?.provider !== 'dashscope-fun-asr' || !upstream)
    return null

  const params = safeParse(funAsrAdapterParamsSchema, upstream.adapterParams ?? {})
  if (!params.success)
    return null

  const next = createKeyRotator(upstream, envelopeCrypto, modelName, null, model.provider)[Symbol.iterator]().next()
  if (next.done)
    return null

  const apiKeyBytes = next.value.plaintext
  try {
    const apiKey = apiKeyBytes.toString('utf8').trim()
    if (!apiKey)
      return null

    return {
      apiKey,
      model: params.output.model || DASHSCOPE_FUN_ASR_DEFAULT_MODEL,
      websocketURL: params.output.websocketURL || DASHSCOPE_INTL_INFERENCE_WS_URL,
      maxSentenceSilenceMs: params.output.maxSentenceSilenceMs ?? DASHSCOPE_FUN_ASR_DEFAULT_SENTENCE_SILENCE_MS,
    }
  }
  finally {
    apiKeyBytes.fill(0)
  }
}

/**
 * Resolves the official ASR upstream that the `auto` alias routes to.
 *
 * Returns:
 * - The provider and its credentials, or `null` when official ASR is not configured.
 */
export async function resolveOfficialAsrRouteFromConfig(input: {
  configKV: ConfigKVService
  envelopeCrypto: EnvelopeCrypto
  providerCatalogService: ProviderCatalogService
}) {
  const routerConfig = await input.configKV.getOptional('LLM_ROUTER_CONFIG')
  if (Object.keys(routerConfig?.asr?.models ?? {}).length === 0)
    return null

  const alias = await input.providerCatalogService.resolveEnabledAlias('asr', OFFICIAL_ASR_MODEL_NAME)
  const primary = alias.routes.find(route => route.pool === 'primary')
  const modelName = (primary ?? alias.routes[0]).routerModelId

  const funAsr = resolveOfficialDashScopeFunAsrCredentials(routerConfig, input.envelopeCrypto, modelName)
  if (funAsr)
    return { provider: 'dashscope-fun-asr' as const, credentials: funAsr }

  const nls = resolveOfficialAliyunNlsCredentials(routerConfig, input.envelopeCrypto, modelName)
  if (nls)
    return { provider: 'aliyun-nls' as const, credentials: nls }

  return null
}

/**
 * Handles official realtime transcription audio upload streams.
 *
 * Use when:
 * - A browser client POSTs the Hearing PCM stream and expects SSE transcript deltas.
 *
 * Expects:
 * - Authentication has not yet run through normal session middleware because this route is mounted before body limits.
 *
 * Returns:
 * - An SSE response that mirrors `@xsai/stream-transcription` delta events.
 */
export function createAudioTranscriptionStreamHandler(input: {
  db: Database
  env: Env
  configKV: ConfigKVService
  envelopeCrypto: EnvelopeCrypto
  providerCatalogService: ProviderCatalogService
}) {
  return async function handleAudioTranscriptionStream(c: Context) {
    const session = await resolveRequestAuth(
      input.db,
      input.env,
      c.req.raw.headers,
    )
    if (!session?.user)
      throw createUnauthorizedError()

    const asrRoute = await resolveOfficialAsrRouteFromConfig(input)
    if (!asrRoute)
      throw createServiceUnavailableError('Official ASR transcription is not configured in the ASR capability catalog', 'CONFIG_NOT_SET')

    const audioStream = c.req.raw.body
    if (!audioStream)
      throw createServiceUnavailableError('Streaming transcription request is missing audio body', 'REQUEST_BODY_NOT_STREAMABLE')

    if (asrRoute.provider === 'dashscope-fun-asr') {
      return createDashScopeFunAsrStreamResponse({
        audioStream: audioStream as ReadableStream<Uint8Array>,
        credentials: asrRoute.credentials,
      })
    }

    return createAliyunNlsStreamResponse({
      audioStream: audioStream as ReadableStream<Uint8Array>,
      credentials: asrRoute.credentials,
    })
  }
}
