import type { ConfigKVService, StepfunStreamingTtsUpstream, UnspeechUpstream } from '../../services/adapters/config-kv'
import type { StreamingTtsStartCommand } from './providers/types'

import { ofetch } from 'ofetch'

import { STEPFUN_STREAMING_TTS_KEY_CONTEXT } from '../../services/adapters/config-kv'
import { isUnspeechStreamingModelEnabled, streamingTtsModelResourceId } from '../../services/domain/streaming-tts-policy'

export interface ResolvedStreamingTtsProvider {
  /** Provider selected by exact public model id. */
  kind: 'unspeech' | 'stepfun'
  /** Provider websocket URL, including provider-specific model parameters. */
  upstreamURL: string
  /** Ordered encrypted credentials available to this provider. */
  keys: Array<{ id: string, ciphertext: string }>
  /** Envelope encryption context that must match the configuration writer. */
  keyContext: string
  /** Operator-level StepFun instruction used when the client does not supply one. */
  instruction?: string
}

/** A client-visible policy failure found while resolving a streaming provider. */
export class StreamingTtsResolutionError extends Error {
  constructor(
    readonly code: string,
    readonly closeCode: number,
    options?: ErrorOptions,
  ) {
    super(code, options)
    this.name = 'StreamingTtsResolutionError'
  }
}

/**
 * Resolves one client start command to exactly one configured provider.
 *
 * StepFun in `available` mode only handles its explicit model ids; unSpeech
 * remains available for all of its configured models. `default` affects the
 * catalog's selected model, not this deterministic model-to-provider mapping.
 */
export async function resolveStreamingTtsProvider(
  start: StreamingTtsStartCommand,
  configKV: ConfigKVService,
): Promise<ResolvedStreamingTtsProvider> {
  let stepfun: StepfunStreamingTtsUpstream | null
  let unspeech: UnspeechUpstream | null
  try {
    const [loadedStepfun, loadedUnspeech] = await Promise.all([
      configKV.getOptional('STEPFUN_STREAMING_TTS_UPSTREAM'),
      configKV.getOptional('UNSPEECH_UPSTREAM'),
    ])
    stepfun = loadedStepfun ?? null
    unspeech = loadedUnspeech ?? null
  }
  catch (error) {
    throw new StreamingTtsResolutionError('config_unavailable', 1011, { cause: error })
  }

  if (stepfun && stepfun.rollout !== 'disabled' && stepfun.models.some(model => model.id === start.model)) {
    if (!stepfun.voices.some(voice => voice.id === start.voice))
      throw new StreamingTtsResolutionError('streaming_tts_voice_not_enabled', 1008)
    if (!isStepfunResponseFormatSupported(start.responseFormat))
      throw new StreamingTtsResolutionError('streaming_tts_response_format_not_supported', 1008)
    return {
      kind: 'stepfun',
      upstreamURL: stepfunURL(stepfun.baseURL, start.model),
      keys: stepfun.keys,
      keyContext: STEPFUN_STREAMING_TTS_KEY_CONTEXT,
      instruction: stepfun.instruction,
    }
  }

  const streaming = unspeech?.streaming
  if (!unspeech?.restBaseURL || !streaming?.baseURL || streaming.keys.length === 0) {
    const hasAvailableStepfun = stepfun != null && stepfun.rollout !== 'disabled'
    throw new StreamingTtsResolutionError(
      hasAvailableStepfun ? 'streaming_tts_model_not_enabled' : 'streaming_tts_not_configured',
      1008,
    )
  }
  if (!isUnspeechStreamingModelEnabled(streaming.models ?? [], start.model))
    throw new StreamingTtsResolutionError('streaming_tts_model_not_enabled', 1008)

  const voicesURL = unspeechVoicesURL(unspeech.restBaseURL, streamingTtsModelResourceId(start.model))
  let voices: unknown[]
  try {
    const data = await ofetch(voicesURL, { timeout: 5000 }) as { voices?: unknown[] }
    voices = Array.isArray(data.voices) ? data.voices : []
  }
  catch (error) {
    throw new StreamingTtsResolutionError('streaming_tts_voice_catalog_unavailable', 1011, { cause: error })
  }
  if (!voices.some(voice => voiceId(voice) === start.voice))
    throw new StreamingTtsResolutionError('streaming_tts_voice_not_enabled', 1008)

  return {
    kind: 'unspeech',
    upstreamURL: streaming.baseURL,
    keys: streaming.keys,
    keyContext: 'streaming-tts',
  }
}

function isStepfunResponseFormatSupported(format: string | undefined): boolean {
  return format == null || format === 'mp3' || format === 'opus' || format === 'flac'
}

function stepfunURL(baseURL: string, model: string): string {
  const url = new URL(baseURL)
  url.searchParams.set('model', streamingTtsModelResourceId(model))
  return url.toString()
}

function unspeechVoicesURL(restBaseURL: string, resourceId: string): string {
  const url = new URL(restBaseURL)
  url.pathname = '/api/voices'
  url.search = new URLSearchParams({ provider: 'volcengine', model: resourceId }).toString()
  return url.toString()
}

function voiceId(voice: unknown): string | null {
  if (typeof voice !== 'object' || voice == null)
    return null
  const id = (voice as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : null
}
