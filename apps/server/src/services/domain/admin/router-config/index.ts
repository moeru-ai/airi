import type Redis from 'ioredis'
import type { InferOutput } from 'valibot'

import type { EnvelopeCrypto } from '../../../../utils/envelope-crypto'
import type { asrModelSchema, ConfigKVService, llmModelSchema, llmRouterConfigSchema, ttsModelSchema, unspeechUpstreamSchema } from '../../../adapters/config-kv'

import { useLogger } from '@guiiai/logg'

import { createBadRequestError } from '../../../../utils/error'

/**
 * AAD label used when encrypting/decrypting the streaming TTS upstream key.
 * Must match `STREAM_MODEL_LABEL_FALLBACK` in
 * apps/server/src/routes/audio-speech-ws/index.ts — the ws proxy decrypts
 * with this label, so writing under a different one surfaces as
 * `DECRYPT_FAILED` at session start.
 */
const STREAMING_TTS_AAD_MODEL_NAME = 'streaming-tts'

/** Default key entry id per provider. Operator can override per request. */
const DEFAULT_KEY_ENTRY_IDS = {
  'openrouter': 'openrouter-prod-1',
  'bedrock': 'bedrock-prod-1',
  'openai-compatible': 'openai-compatible-prod-1',
  'azure': 'azure-tts-prod-1',
  'dashscope-cosyvoice': 'dashscope-tts-prod-1',
  'stepfun': 'stepfun-tts-prod-1',
  'unspeech': 'volcengine-prod-1',
  'aliyun-nls-asr': 'aliyun-nls-asr-prod-1',
} as const

const DEFAULT_FALLBACK_TRIGGERS = {
  httpCodes: [401, 402, 403, 429, 500, 502, 503, 504],
  onTimeout: true,
}

type LlmRouterConfig = InferOutput<typeof llmRouterConfigSchema>
type LlmModel = InferOutput<typeof llmModelSchema>
type TtsModel = InferOutput<typeof ttsModelSchema>
type AsrModel = InferOutput<typeof asrModelSchema>
type UnspeechUpstream = InferOutput<typeof unspeechUpstreamSchema>
type KeyEntry = LlmModel['upstreams'][number]['keys'][number]
type LlmSliceKind = 'openrouter' | 'bedrock' | 'openai-compatible'

/**
 * Per-provider input. The admin route validates the shape with Valibot
 * (discriminated on `kind`) before handing the slice to the service.
 *
 * `plaintextKey` enters the process here, gets envelope-encrypted in
 * {@link buildSlice}, and is dropped from memory before the response is
 * built — it never reaches logs, ciphertext previews, or audit records.
 */
export type SliceInput
  = | OpenRouterSliceInput
    | BedrockSliceInput
    | OpenAICompatibleSliceInput
    | AzureSliceInput
    | DashscopeSliceInput
    | StepfunSliceInput
    | AliyunNlsAsrSliceInput
    | UnspeechSliceInput

export interface OpenRouterSliceInput {
  kind: 'openrouter'
  /** Key under `LLM_ROUTER_CONFIG.llm.models`. */
  modelName: string
  /** Upstream model id sent to OpenRouter (e.g. `openai/gpt-4o-mini`). */
  overrideModel: string
  /** Plaintext provider key. Encrypted in-place; never echoed back. */
  plaintextKey?: string
  /** @default 'https://openrouter.ai/api/v1' */
  baseURL?: string
  /** @default 'openrouter-prod-1' */
  keyEntryId?: string
  /** Existing key entry to preserve when `plaintextKey` is omitted. */
  existingKeyEntryId?: string
  /** @default 'Bearer {KEY}' */
  headerTemplate?: string
}

export interface BedrockSliceInput {
  kind: 'bedrock'
  /** Key under `LLM_ROUTER_CONFIG.llm.models`. */
  modelName: string
  /** Upstream Bedrock model id sent to the OpenAI-compatible Bedrock gateway. */
  overrideModel: string
  /** Plaintext provider key or Bedrock bearer token. Encrypted in-place; never echoed back. */
  plaintextKey?: string
  /** @default 'https://bedrock-mantle.us-east-1.api.aws/v1' */
  baseURL?: string
  /** @default 'bedrock-prod-1' */
  keyEntryId?: string
  /** Existing key entry to preserve when `plaintextKey` is omitted. */
  existingKeyEntryId?: string
  /** @default 'Bearer {KEY}' */
  headerTemplate?: string
}

export interface OpenAICompatibleSliceInput {
  kind: 'openai-compatible'
  /** Key under `LLM_ROUTER_CONFIG.llm.models`. */
  modelName: string
  /** Upstream OpenAI-compatible model id. */
  overrideModel: string
  /** Plaintext provider key. Encrypted in-place; never echoed back. */
  plaintextKey?: string
  /** @default 'https://api.openai.com/v1' */
  baseURL?: string
  /** @default 'openai-compatible-prod-1' */
  keyEntryId?: string
  /** Existing key entry to preserve when `plaintextKey` is omitted. */
  existingKeyEntryId?: string
  /** @default 'Bearer {KEY}' */
  headerTemplate?: string
}

export interface AzureSliceInput {
  kind: 'azure'
  /** Key under `LLM_ROUTER_CONFIG.tts.models` (e.g. `microsoft/v1`). */
  modelName: string
  /** Azure Speech region, used in baseURL and `adapterParams.region`. */
  region: string
  /** Default Microsoft voice used when `/audio/speech` omits `voice`. */
  defaultVoice?: string
  plaintextKey?: string
  /** @default 'azure-tts-prod-1' */
  keyEntryId?: string
  /** Existing key entry to preserve when `plaintextKey` is omitted. */
  existingKeyEntryId?: string
}

export interface DashscopeSliceInput {
  kind: 'dashscope-cosyvoice'
  /** Key under `LLM_ROUTER_CONFIG.tts.models` (e.g. `alibaba/cosyvoice-v2`). */
  modelName: string
  /** `intl` → dashscope-intl.aliyuncs.com (Singapore); `cn` → dashscope.aliyuncs.com (Beijing). */
  region: 'intl' | 'cn'
  /** Concrete cosyvoice variant the adapter calls upstream. Independent from `modelName`. */
  upstreamModel: string
  plaintextKey?: string
  /** @default 'dashscope-tts-prod-1' */
  keyEntryId?: string
  /** Existing key entry to preserve when `plaintextKey` is omitted. */
  existingKeyEntryId?: string
}

export interface StepfunSliceInput {
  kind: 'stepfun'
  /** Key under `LLM_ROUTER_CONFIG.tts.models` (e.g. `stepfun/stepaudio-2.5-tts`). */
  modelName: string
  /** Concrete StepFun TTS model sent upstream. */
  upstreamModel?: 'stepaudio-2.5-tts' | 'step-tts-2' | 'step-tts-mini'
  /** Default official voice used when `/audio/speech` omits `voice`. */
  defaultVoice?: string
  /** Default global instruction for `stepaudio-2.5-tts`; per-request `instruction` overrides it. */
  instruction?: string
  plaintextKey?: string
  /** @default 'stepfun-tts-prod-1' */
  keyEntryId?: string
  /** Existing key entry to preserve when `plaintextKey` is omitted. */
  existingKeyEntryId?: string
}

export interface UnspeechSliceInput {
  kind: 'unspeech'
  /** unspeech REST root: `http(s)://host:port` (no trailing slash, no path). */
  restBaseURL: string
  /** Streaming subtree — omit when running unspeech REST-only without ws TTS. */
  streaming?: {
    /** unspeech ws endpoint: `ws(s)://host:port/v1/audio/speech/stream`. */
    upstreamURL: string
    /** Upstream provider key (Volcengine `X-Api-Key`), not an unspeech token. */
    plaintextKey?: string
    /** @default 'volcengine-prod-1' */
    keyEntryId?: string
    /** Existing key entry to preserve when `plaintextKey` is omitted. */
    existingKeyEntryId?: string
    /** Operator-curated streaming models exposed to the frontend picker. */
    models?: Array<{ id: string, name?: string, description?: string }>
    /** Server-curated default streaming model id. */
    defaultModel?: string
  }
}

export interface AliyunNlsAsrSliceInput {
  kind: 'aliyun-nls-asr'
  /** Key under `LLM_ROUTER_CONFIG.asr.models`; the official client currently uses `auto`. */
  modelName: string
  /** Aliyun AccessKey ID used for token signing. Stored in adapterParams, not encrypted. */
  accessKeyId: string
  /** Aliyun NLS app key. Stored in adapterParams, not encrypted. */
  appKey: string
  /** Aliyun NLS region; defaults to cn-shanghai. */
  region?: 'cn-shanghai' | 'cn-shanghai-internal' | 'cn-beijing' | 'cn-beijing-internal' | 'cn-shenzhen' | 'cn-shenzhen-internal'
  /** Aliyun AccessKey secret. Encrypted in-place; never echoed back. */
  plaintextKey?: string
  /** @default 'aliyun-nls-asr-prod-1' */
  keyEntryId?: string
  /** Existing key entry to preserve when `plaintextKey` is omitted. */
  existingKeyEntryId?: string
}

interface LlmModelSlice {
  target: 'llm-router'
  surface: 'llm'
  kind: LlmSliceKind
  modelName: string
  model: LlmModel
  keyEntryId: string
}

interface TtsModelSlice {
  target: 'llm-router'
  surface: 'tts'
  kind: 'azure' | 'dashscope-cosyvoice' | 'stepfun'
  modelName: string
  model: TtsModel
  keyEntryId: string
}

interface AsrModelSlice {
  target: 'llm-router'
  surface: 'asr'
  kind: 'aliyun-nls-asr'
  modelName: string
  model: AsrModel
  keyEntryId: string
}

interface UnspeechSlice {
  target: 'unspeech'
  kind: 'unspeech'
  value: UnspeechUpstream
  /** Streaming key entry id when `streaming` is set; `null` otherwise. */
  keyEntryId: string | null
}

type BuiltSlice = LlmModelSlice | TtsModelSlice | AsrModelSlice | UnspeechSlice

/**
 * Encrypts an OpenRouter slice into the LLM_ROUTER_CONFIG.llm shape.
 *
 * Use when:
 * - Admin posts an `openrouter` slice; called by {@link buildSlice}.
 *
 * Returns:
 * - A `BuiltSlice` whose `model.upstreams[0].keys[0].ciphertext` is the
 *   envelope-encrypted plaintext key with AAD `{modelName, keyEntryId}`.
 */
export function buildOpenRouterSlice(input: OpenRouterSliceInput, envelope: EnvelopeCrypto): LlmModelSlice {
  return buildLlmSlice(input, envelope)
}

export function buildBedrockSlice(input: BedrockSliceInput, envelope: EnvelopeCrypto): LlmModelSlice {
  return buildLlmSlice(input, envelope)
}

export function buildOpenAICompatibleSlice(input: OpenAICompatibleSliceInput, envelope: EnvelopeCrypto): LlmModelSlice {
  return buildLlmSlice(input, envelope)
}

function buildLlmSlice(input: OpenRouterSliceInput | BedrockSliceInput | OpenAICompatibleSliceInput, envelope: EnvelopeCrypto): LlmModelSlice {
  const keyEntryId = input.keyEntryId ?? DEFAULT_KEY_ENTRY_IDS[input.kind]
  const ciphertext = envelope.encryptKey(requiredPlaintextKey(input.plaintextKey, input.kind), {
    modelName: input.modelName,
    keyEntryId,
  })
  return {
    target: 'llm-router',
    surface: 'llm',
    kind: input.kind,
    modelName: input.modelName,
    keyEntryId,
    model: {
      upstreams: [{
        baseURL: input.baseURL ?? defaultLlmBaseURL(input.kind),
        overrideModel: input.overrideModel,
        keys: [{ id: keyEntryId, ciphertext }],
        headerTemplate: input.headerTemplate ?? 'Bearer {KEY}',
      }],
      fallbackTriggers: DEFAULT_FALLBACK_TRIGGERS,
    },
  }
}

function defaultLlmBaseURL(kind: LlmSliceKind): string {
  switch (kind) {
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    case 'bedrock':
      return 'https://bedrock-mantle.us-east-1.api.aws/v1'
    case 'openai-compatible':
      return 'https://api.openai.com/v1'
  }
}

/**
 * Encrypts an Azure TTS slice into the LLM_ROUTER_CONFIG.tts shape.
 *
 * Use when:
 * - Admin posts an `azure` slice; called by {@link buildSlice}.
 */
export function buildAzureSlice(input: AzureSliceInput, envelope: EnvelopeCrypto): TtsModelSlice {
  const keyEntryId = input.keyEntryId ?? DEFAULT_KEY_ENTRY_IDS.azure
  const ciphertext = envelope.encryptKey(requiredPlaintextKey(input.plaintextKey, input.kind), {
    modelName: input.modelName,
    keyEntryId,
  })
  return {
    target: 'llm-router',
    surface: 'tts',
    kind: 'azure',
    modelName: input.modelName,
    keyEntryId,
    model: {
      provider: 'azure',
      upstreams: [{
        baseURL: `https://${input.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        keys: [{ id: keyEntryId, ciphertext }],
        adapterParams: {
          region: input.region,
          ...(input.defaultVoice ? { defaultVoice: input.defaultVoice } : {}),
        },
      }],
      fallbackTriggers: DEFAULT_FALLBACK_TRIGGERS,
    },
  }
}

/**
 * Encrypts a DashScope cosyvoice slice into the LLM_ROUTER_CONFIG.tts shape.
 *
 * Use when:
 * - Admin posts a `dashscope-cosyvoice` slice; called by {@link buildSlice}.
 *
 * Expects:
 * - The dashscope-cosyvoice adapter does NOT append
 *   `/services/audio/tts/SpeechSynthesizer`; the full non-streaming endpoint
 *   path must be baked into `baseURL` here. A bare `/api/v1` baseURL was the
 *   root cause of the 404 storm during the v1→v2 migration.
 */
export function buildDashscopeSlice(input: DashscopeSliceInput, envelope: EnvelopeCrypto): TtsModelSlice {
  const keyEntryId = input.keyEntryId ?? DEFAULT_KEY_ENTRY_IDS['dashscope-cosyvoice']
  const ciphertext = envelope.encryptKey(requiredPlaintextKey(input.plaintextKey, input.kind), {
    modelName: input.modelName,
    keyEntryId,
  })
  const host = input.region === 'cn'
    ? 'dashscope.aliyuncs.com'
    : 'dashscope-intl.aliyuncs.com'
  return {
    target: 'llm-router',
    surface: 'tts',
    kind: 'dashscope-cosyvoice',
    modelName: input.modelName,
    keyEntryId,
    model: {
      provider: 'dashscope-cosyvoice',
      upstreams: [{
        baseURL: `https://${host}/api/v1/services/audio/tts/SpeechSynthesizer`,
        keys: [{ id: keyEntryId, ciphertext }],
        adapterParams: { model: input.upstreamModel },
      }],
      fallbackTriggers: DEFAULT_FALLBACK_TRIGGERS,
    },
  }
}

/**
 * Encrypts a StepFun TTS slice into the LLM_ROUTER_CONFIG.tts shape.
 *
 * Use when:
 * - Admin posts a `stepfun` slice for StepAudio 2.5 TTS or Step TTS 2/Mini.
 *
 * Expects:
 * - `upstreamModel` is the concrete StepFun model sent to
 *   `POST /v1/audio/speech`; defaults to `stepaudio-2.5-tts`.
 */
export function buildStepfunSlice(input: StepfunSliceInput, envelope: EnvelopeCrypto): TtsModelSlice {
  const keyEntryId = input.keyEntryId ?? DEFAULT_KEY_ENTRY_IDS.stepfun
  const ciphertext = envelope.encryptKey(requiredPlaintextKey(input.plaintextKey, input.kind), {
    modelName: input.modelName,
    keyEntryId,
  })
  return {
    target: 'llm-router',
    surface: 'tts',
    kind: 'stepfun',
    modelName: input.modelName,
    keyEntryId,
    model: {
      provider: 'stepfun',
      upstreams: [{
        baseURL: 'https://api.stepfun.com/v1/audio/speech',
        keys: [{ id: keyEntryId, ciphertext }],
        adapterParams: {
          model: input.upstreamModel ?? 'stepaudio-2.5-tts',
          ...(input.defaultVoice ? { defaultVoice: input.defaultVoice } : {}),
          ...(input.instruction ? { instruction: input.instruction } : {}),
        },
      }],
      fallbackTriggers: DEFAULT_FALLBACK_TRIGGERS,
    },
  }
}

/**
 * Encrypts an Aliyun NLS ASR slice into the LLM_ROUTER_CONFIG.asr shape.
 *
 * Use when:
 * - Admin posts an `aliyun-nls-asr` slice for the official realtime
 *   transcription proxy.
 *
 * Expects:
 * - `plaintextKey` is the Aliyun AccessKey secret. `accessKeyId` and `appKey`
 *   are non-secret routing params stored in `adapterParams`.
 */
export function buildAliyunNlsAsrSlice(input: AliyunNlsAsrSliceInput, envelope: EnvelopeCrypto): AsrModelSlice {
  const keyEntryId = input.keyEntryId ?? DEFAULT_KEY_ENTRY_IDS['aliyun-nls-asr']
  const ciphertext = envelope.encryptKey(requiredPlaintextKey(input.plaintextKey, input.kind), {
    modelName: input.modelName,
    keyEntryId,
  })
  return {
    target: 'llm-router',
    surface: 'asr',
    kind: 'aliyun-nls-asr',
    modelName: input.modelName,
    keyEntryId,
    model: {
      provider: 'aliyun-nls',
      upstreams: [{
        keys: [{ id: keyEntryId, ciphertext }],
        adapterParams: {
          accessKeyId: input.accessKeyId,
          appKey: input.appKey,
          region: input.region ?? 'cn-shanghai',
        },
      }],
    },
  }
}

/**
 * Encrypts an unspeech slice into the UNSPEECH_UPSTREAM shape.
 *
 * Use when:
 * - Admin posts an `unspeech` slice; called by {@link buildSlice}.
 *
 * Expects:
 * - `streaming.upstreamURL` (when provided) starts with `ws://` or `wss://`.
 *   http:// is almost always a copy-paste of the unspeech REST endpoint and
 *   fails at `new WebSocket()` inside the audio-speech-ws proxy.
 */
export function buildUnspeechSlice(input: UnspeechSliceInput, envelope: EnvelopeCrypto): UnspeechSlice {
  if (!input.streaming) {
    return {
      target: 'unspeech',
      kind: 'unspeech',
      keyEntryId: null,
      value: { restBaseURL: input.restBaseURL },
    }
  }
  const keyEntryId = input.streaming.keyEntryId ?? DEFAULT_KEY_ENTRY_IDS.unspeech
  const ciphertext = envelope.encryptKey(requiredPlaintextKey(input.streaming.plaintextKey, input.kind), {
    modelName: STREAMING_TTS_AAD_MODEL_NAME,
    keyEntryId,
  })
  return {
    target: 'unspeech',
    kind: 'unspeech',
    keyEntryId,
    value: {
      restBaseURL: input.restBaseURL,
      streaming: {
        baseURL: input.streaming.upstreamURL,
        keys: [{ id: keyEntryId, ciphertext }],
        adapterParams: {},
        models: input.streaming.models ?? [],
        defaultModel: input.streaming.defaultModel,
      },
    },
  }
}

function requiredPlaintextKey(value: string | undefined, kind: SliceInput['kind']): string {
  if (value?.trim())
    return value

  throw createBadRequestError(`${kind} plaintext key is required when no existing key can be preserved`, 'INVALID_BODY')
}

function firstKey(upstream: { keys: KeyEntry[] } | undefined, preferredId: string | undefined): KeyEntry | null {
  if (!upstream?.keys.length)
    return null

  if (preferredId) {
    const selected = upstream.keys.find(key => key.id === preferredId)
    if (selected)
      return selected
  }

  return upstream.keys[0] ?? null
}

function preservedKeyOrThrow(upstream: { keys: KeyEntry[] } | undefined, preferredId: string | undefined, kind: SliceInput['kind']): KeyEntry {
  const key = firstKey(upstream, preferredId)
  if (!key)
    throw createBadRequestError(`${kind} existing key entry was not found; paste a new provider key to rotate it`, 'INVALID_BODY')

  return key
}

function buildLlmSlicePreservingKey(input: OpenRouterSliceInput | BedrockSliceInput | OpenAICompatibleSliceInput, envelope: EnvelopeCrypto, existing: LlmModel | undefined): LlmModelSlice {
  if (input.plaintextKey?.trim())
    return buildLlmSlice(input, envelope)

  const existingUpstream = existing?.upstreams[0]
  const key = preservedKeyOrThrow(existingUpstream, input.existingKeyEntryId ?? input.keyEntryId, input.kind)
  return {
    target: 'llm-router',
    surface: 'llm',
    kind: input.kind,
    modelName: input.modelName,
    keyEntryId: key.id,
    model: {
      upstreams: [{
        baseURL: input.baseURL ?? existingUpstream?.baseURL ?? defaultLlmBaseURL(input.kind),
        overrideModel: input.overrideModel,
        keys: [key],
        headerTemplate: input.headerTemplate ?? existingUpstream?.headerTemplate ?? 'Bearer {KEY}',
      }],
      fallbackTriggers: existing?.fallbackTriggers ?? DEFAULT_FALLBACK_TRIGGERS,
    },
  }
}

function buildAzureSlicePreservingKey(input: AzureSliceInput, envelope: EnvelopeCrypto, existing: TtsModel | undefined): TtsModelSlice {
  if (input.plaintextKey?.trim())
    return buildAzureSlice(input, envelope)

  const existingUpstream = existing?.upstreams[0]
  const key = preservedKeyOrThrow(existingUpstream, input.existingKeyEntryId ?? input.keyEntryId, input.kind)
  return {
    target: 'llm-router',
    surface: 'tts',
    kind: 'azure',
    modelName: input.modelName,
    keyEntryId: key.id,
    model: {
      provider: 'azure',
      upstreams: [{
        baseURL: `https://${input.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
        keys: [key],
        adapterParams: {
          region: input.region,
          ...(input.defaultVoice ? { defaultVoice: input.defaultVoice } : {}),
        },
      }],
      fallbackTriggers: existing?.fallbackTriggers ?? DEFAULT_FALLBACK_TRIGGERS,
    },
  }
}

function buildDashscopeSlicePreservingKey(input: DashscopeSliceInput, envelope: EnvelopeCrypto, existing: TtsModel | undefined): TtsModelSlice {
  if (input.plaintextKey?.trim())
    return buildDashscopeSlice(input, envelope)

  const existingUpstream = existing?.upstreams[0]
  const key = preservedKeyOrThrow(existingUpstream, input.existingKeyEntryId ?? input.keyEntryId, input.kind)
  const host = input.region === 'cn'
    ? 'dashscope.aliyuncs.com'
    : 'dashscope-intl.aliyuncs.com'
  return {
    target: 'llm-router',
    surface: 'tts',
    kind: 'dashscope-cosyvoice',
    modelName: input.modelName,
    keyEntryId: key.id,
    model: {
      provider: 'dashscope-cosyvoice',
      upstreams: [{
        baseURL: `https://${host}/api/v1/services/audio/tts/SpeechSynthesizer`,
        keys: [key],
        adapterParams: { model: input.upstreamModel },
      }],
      fallbackTriggers: existing?.fallbackTriggers ?? DEFAULT_FALLBACK_TRIGGERS,
    },
  }
}

function buildStepfunSlicePreservingKey(input: StepfunSliceInput, envelope: EnvelopeCrypto, existing: TtsModel | undefined): TtsModelSlice {
  if (input.plaintextKey?.trim())
    return buildStepfunSlice(input, envelope)

  const existingUpstream = existing?.upstreams[0]
  const key = preservedKeyOrThrow(existingUpstream, input.existingKeyEntryId ?? input.keyEntryId, input.kind)
  return {
    target: 'llm-router',
    surface: 'tts',
    kind: 'stepfun',
    modelName: input.modelName,
    keyEntryId: key.id,
    model: {
      provider: 'stepfun',
      upstreams: [{
        baseURL: 'https://api.stepfun.com/v1/audio/speech',
        keys: [key],
        adapterParams: {
          model: input.upstreamModel ?? 'stepaudio-2.5-tts',
          ...(input.defaultVoice ? { defaultVoice: input.defaultVoice } : {}),
          ...(input.instruction ? { instruction: input.instruction } : {}),
        },
      }],
      fallbackTriggers: existing?.fallbackTriggers ?? DEFAULT_FALLBACK_TRIGGERS,
    },
  }
}

function buildAliyunNlsAsrSlicePreservingKey(input: AliyunNlsAsrSliceInput, envelope: EnvelopeCrypto, existing: AsrModel | undefined): AsrModelSlice {
  if (input.plaintextKey?.trim())
    return buildAliyunNlsAsrSlice(input, envelope)

  const existingUpstream = existing?.upstreams[0]
  const key = preservedKeyOrThrow(existingUpstream, input.existingKeyEntryId ?? input.keyEntryId, input.kind)
  return {
    target: 'llm-router',
    surface: 'asr',
    kind: 'aliyun-nls-asr',
    modelName: input.modelName,
    keyEntryId: key.id,
    model: {
      provider: 'aliyun-nls',
      upstreams: [{
        keys: [key],
        adapterParams: {
          accessKeyId: input.accessKeyId,
          appKey: input.appKey,
          region: input.region ?? stringFromRecord(existingUpstream?.adapterParams, 'region') ?? 'cn-shanghai',
        },
      }],
    },
  }
}

function buildUnspeechSlicePreservingKey(input: UnspeechSliceInput, envelope: EnvelopeCrypto, existing: UnspeechUpstream | undefined | null): UnspeechSlice {
  if (!input.streaming || input.streaming.plaintextKey?.trim())
    return buildUnspeechSlice(input, envelope)

  const key = preservedKeyOrThrow(existing?.streaming, input.streaming.existingKeyEntryId ?? input.streaming.keyEntryId, input.kind)
  return {
    target: 'unspeech',
    kind: 'unspeech',
    keyEntryId: key.id,
    value: {
      restBaseURL: input.restBaseURL,
      streaming: {
        baseURL: input.streaming.upstreamURL,
        keys: [key],
        adapterParams: existing?.streaming?.adapterParams ?? {},
        models: input.streaming.models ?? existing?.streaming?.models ?? [],
        defaultModel: input.streaming.defaultModel ?? existing?.streaming?.defaultModel,
      },
    },
  }
}

/**
 * Encrypts a slice input. Routes to the per-kind builder.
 *
 * Use when:
 * - The service main path needs to turn an admin-supplied slice into a
 *   ready-to-write configKV fragment. Tests dispatch the same way.
 */
export function buildSlice(
  input: SliceInput,
  envelope: EnvelopeCrypto,
  existing?: {
    routerConfig?: LlmRouterConfig | null
    unspeech?: UnspeechUpstream | null
  },
): BuiltSlice {
  switch (input.kind) {
    case 'openrouter':
    case 'bedrock':
    case 'openai-compatible':
      return buildLlmSlicePreservingKey(input, envelope, existing?.routerConfig?.llm.models[input.modelName])
    case 'azure':
      return buildAzureSlicePreservingKey(input, envelope, existing?.routerConfig?.tts.models[input.modelName])
    case 'dashscope-cosyvoice':
      return buildDashscopeSlicePreservingKey(input, envelope, existing?.routerConfig?.tts.models[input.modelName])
    case 'stepfun':
      return buildStepfunSlicePreservingKey(input, envelope, existing?.routerConfig?.tts.models[input.modelName])
    case 'aliyun-nls-asr':
      return buildAliyunNlsAsrSlicePreservingKey(input, envelope, existing?.routerConfig?.asr?.models[input.modelName])
    case 'unspeech':
      return buildUnspeechSlicePreservingKey(input, envelope, existing?.unspeech)
  }
}

/**
 * Computes the next `LLM_ROUTER_CONFIG` tree.
 *
 * Use when:
 * - One or more LLM/TTS slices need to be merged into (or reset on top of)
 *   the existing configKV entry.
 *
 * Expects:
 * - `existing` is the current parsed `LLM_ROUTER_CONFIG` (or `null` if the
 *   entry is absent). `mode: 'merge'` preserves models not touched this run;
 *   `mode: 'reset'` drops every prior entry and keeps only what is in
 *   `slices`.
 *
 * Returns:
 * - The next config tree, ready to feed `configKV.set('LLM_ROUTER_CONFIG', ...)`.
 *   `defaults` is preserved verbatim when merging — the admin endpoint does
 *   not currently re-tune timeouts via this path.
 */
export function buildNextRouterConfig(
  mode: 'merge' | 'reset',
  existing: LlmRouterConfig | null | undefined,
  slices: (LlmModelSlice | TtsModelSlice | AsrModelSlice)[],
): LlmRouterConfig {
  const llmModels: Record<string, LlmModel>
    = mode === 'merge' && existing?.llm?.models ? { ...existing.llm.models } : {}
  const ttsModels: Record<string, TtsModel>
    = mode === 'merge' && existing?.tts?.models ? { ...existing.tts.models } : {}
  const asrModels: Record<string, AsrModel>
    = mode === 'merge' && existing?.asr?.models ? { ...existing.asr.models } : {}

  for (const slice of slices) {
    if (slice.surface === 'llm')
      llmModels[slice.modelName] = slice.model
    else if (slice.surface === 'tts')
      ttsModels[slice.modelName] = slice.model
    else
      asrModels[slice.modelName] = slice.model
  }

  // Defaults live alongside the models but aren't editable through this
  // endpoint yet; keep the existing tree in merge mode so we don't blow them
  // away. In reset mode, fall back to the schema default object.
  const defaults = mode === 'merge' && existing?.defaults
    ? existing.defaults
    : { perAttemptTimeoutMs: 30000, fullChainTimeoutMs: 60000, fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504] }

  return {
    llm: { models: llmModels },
    tts: { models: ttsModels },
    asr: { models: asrModels },
    defaults,
  }
}

/**
 * Redacts every `ciphertext` field down to its byte length for safe response
 * preview.
 *
 * Before:
 * - `{ "keys": [{ "id": "k1", "ciphertext": "aGVsbG8=...long..." }] }`
 *
 * After:
 * - `{ "keys": [{ "id": "k1", "ciphertext": "<ciphertext: 1024 chars>" }] }`
 */
export function redactCiphertext(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(redactCiphertext)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'ciphertext' && typeof v === 'string')
        out[k] = `<ciphertext: ${v.length} chars>`
      else
        out[k] = redactCiphertext(v)
    }
    return out
  }
  return value
}

export interface ApplyInput {
  mode: 'merge' | 'reset'
  dryRun: boolean
  slices: SliceInput[]
  defaults?: {
    chatModel?: string
    ttsModel?: string
    ttsVoices?: Record<string, Record<string, string>>
  }
  /** Admin user id for audit logging only. Not part of the persisted config. */
  actorUserId?: string
}

export interface AppliedSummary {
  kind: SliceInput['kind']
  target: 'llm-router' | 'unspeech'
  surface?: 'llm' | 'tts' | 'asr'
  modelName?: string
  keyEntryId: string | null
}

export interface ApplyResult {
  applied: AppliedSummary[]
  invalidatedKeys: string[]
  preview: {
    LLM_ROUTER_CONFIG?: unknown
    UNSPEECH_UPSTREAM?: unknown
    DEFAULT_CHAT_MODEL?: string
    DEFAULT_TTS_MODEL?: string
    DEFAULT_TTS_VOICES?: Record<string, Record<string, string>>
  }
}

export interface CurrentRouterConfigResult {
  request: {
    mode: 'merge'
    slices: SliceInput[]
    defaults: NonNullable<ApplyInput['defaults']>
  }
  preview: ApplyResult['preview']
  loadedAt: string
  missingKeys: string[]
}

function sliceNeedsExistingKey(slice: SliceInput): boolean {
  if (slice.kind === 'unspeech')
    return slice.streaming != null && !slice.streaming.plaintextKey?.trim()

  return !slice.plaintextKey?.trim()
}

function slicesFromRouterConfig(config: LlmRouterConfig | null): SliceInput[] {
  if (!config)
    return []

  const slices: SliceInput[] = []
  for (const [modelName, model] of Object.entries(config.llm.models)) {
    const slice = llmSliceFromModel(modelName, model)
    if (slice)
      slices.push(slice)
  }
  for (const [modelName, model] of Object.entries(config.tts.models)) {
    const slice = ttsSliceFromModel(modelName, model)
    if (slice)
      slices.push(slice)
  }
  for (const [modelName, model] of Object.entries(config.asr?.models ?? {})) {
    const slice = asrSliceFromModel(modelName, model)
    if (slice)
      slices.push(slice)
  }
  return slices
}

function llmSliceFromModel(modelName: string, model: LlmModel): OpenRouterSliceInput | BedrockSliceInput | OpenAICompatibleSliceInput | null {
  const upstream = model.upstreams[0]
  const key = upstream?.keys[0]
  if (!upstream || !key)
    return null

  return {
    kind: llmKindFromBaseURL(upstream.baseURL),
    modelName,
    overrideModel: upstream.overrideModel ?? modelName,
    baseURL: upstream.baseURL,
    headerTemplate: upstream.headerTemplate,
    keyEntryId: key.id,
    existingKeyEntryId: key.id,
  }
}

function llmKindFromBaseURL(baseURL: string): LlmSliceKind {
  try {
    const host = new URL(baseURL).hostname
    if (host === 'openrouter.ai')
      return 'openrouter'
    if (host.includes('bedrock') || host.endsWith('.api.aws'))
      return 'bedrock'
    return 'openai-compatible'
  }
  catch {
    return 'openai-compatible'
  }
}

function ttsSliceFromModel(modelName: string, model: TtsModel): AzureSliceInput | DashscopeSliceInput | StepfunSliceInput | null {
  const upstream = model.upstreams[0]
  const key = upstream?.keys[0]
  if (!upstream || !key)
    return null

  if (model.provider === 'azure') {
    const region = stringFromRecord(upstream.adapterParams, 'region') ?? azureRegionFromBaseURL(upstream.baseURL) ?? ''
    return {
      kind: 'azure',
      modelName,
      region,
      defaultVoice: stringFromRecord(upstream.adapterParams, 'defaultVoice'),
      keyEntryId: key.id,
      existingKeyEntryId: key.id,
    }
  }

  if (model.provider === 'dashscope-cosyvoice') {
    return {
      kind: 'dashscope-cosyvoice',
      modelName,
      region: upstream.baseURL.includes('dashscope.aliyuncs.com') ? 'cn' : 'intl',
      upstreamModel: stringFromRecord(upstream.adapterParams, 'model') ?? modelName,
      keyEntryId: key.id,
      existingKeyEntryId: key.id,
    }
  }

  if (model.provider === 'stepfun') {
    const upstreamModel = stringFromRecord(upstream.adapterParams, 'model')
    return {
      kind: 'stepfun',
      modelName,
      upstreamModel: isStepfunInputModel(upstreamModel) ? upstreamModel : undefined,
      defaultVoice: stringFromRecord(upstream.adapterParams, 'defaultVoice'),
      instruction: stringFromRecord(upstream.adapterParams, 'instruction'),
      keyEntryId: key.id,
      existingKeyEntryId: key.id,
    }
  }

  return null
}

function asrSliceFromModel(modelName: string, model: AsrModel): AliyunNlsAsrSliceInput | null {
  const upstream = model.upstreams[0]
  const key = upstream?.keys[0]
  if (model.provider !== 'aliyun-nls' || !upstream || !key)
    return null

  const accessKeyId = stringFromRecord(upstream.adapterParams, 'accessKeyId')
  const appKey = stringFromRecord(upstream.adapterParams, 'appKey')
  if (!accessKeyId || !appKey)
    return null

  const region = stringFromRecord(upstream.adapterParams, 'region')
  return {
    kind: 'aliyun-nls-asr',
    modelName,
    accessKeyId,
    appKey,
    region: isAliyunNlsRegion(region) ? region : undefined,
    keyEntryId: key.id,
    existingKeyEntryId: key.id,
  }
}

function slicesFromUnspeech(unspeech: UnspeechUpstream | null): UnspeechSliceInput[] {
  if (!unspeech)
    return []

  const key = unspeech.streaming?.keys[0]
  return [{
    kind: 'unspeech',
    restBaseURL: unspeech.restBaseURL,
    ...(unspeech.streaming
      ? {
          streaming: {
            upstreamURL: unspeech.streaming.baseURL,
            keyEntryId: key?.id,
            existingKeyEntryId: key?.id,
            models: unspeech.streaming.models,
            defaultModel: unspeech.streaming.defaultModel,
          },
        }
      : {}),
  }]
}

function azureRegionFromBaseURL(baseURL: string): string | null {
  const match = /^https:\/\/([^.]+)\.tts\.speech\.microsoft\.com\//u.exec(baseURL)
  return match?.[1] ?? null
}

function stringFromRecord(recordValue: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = recordValue?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isStepfunInputModel(value: string | undefined): value is NonNullable<StepfunSliceInput['upstreamModel']> {
  return value === 'stepaudio-2.5-tts' || value === 'step-tts-2' || value === 'step-tts-mini'
}

function isAliyunNlsRegion(value: string | undefined): value is NonNullable<AliyunNlsAsrSliceInput['region']> {
  return value === 'cn-shanghai'
    || value === 'cn-shanghai-internal'
    || value === 'cn-beijing'
    || value === 'cn-beijing-internal'
    || value === 'cn-shenzhen'
    || value === 'cn-shenzhen-internal'
}

interface AdminRouterConfigDeps {
  configKV: ConfigKVService
  envelope: EnvelopeCrypto
  redis: Redis
}

/**
 * Admin service for seeding / patching the LLM router configKV tree.
 *
 * Use when:
 * - Mounting `POST /api/admin/config/router`. The HTTP layer parses the body
 *   and forwards it here; this layer owns encryption, merge semantics,
 *   validation, and cross-instance invalidation.
 *
 * Expects:
 * - `envelope` is wired with the same master key the LLM router decrypts
 *   under, otherwise written ciphertexts will surface as `DECRYPT_FAILED` at
 *   the first /chat/completions or /audio/speech request.
 *
 * Returns:
 * - `apply()` resolves to the redacted preview, the list of touched configKV
 *   keys, and a per-slice summary suitable for an audit row. Plaintext keys
 *   are dropped from memory before this resolves.
 */
export function createAdminRouterConfigService(deps: AdminRouterConfigDeps) {
  const logger = useLogger('admin-router-config').useGlobalConfig()

  async function current(): Promise<CurrentRouterConfigResult> {
    const [
      routerConfig,
      unspeech,
      chatModel,
      ttsModel,
      ttsVoices,
    ] = await Promise.all([
      deps.configKV.getOptional('LLM_ROUTER_CONFIG'),
      deps.configKV.getOptional('UNSPEECH_UPSTREAM'),
      deps.configKV.getOptional('DEFAULT_CHAT_MODEL'),
      deps.configKV.getOptional('DEFAULT_TTS_MODEL'),
      deps.configKV.getOptional('DEFAULT_TTS_VOICES'),
    ])

    const slices: SliceInput[] = [
      ...slicesFromRouterConfig(routerConfig ?? null),
      ...slicesFromUnspeech(unspeech ?? null),
    ]
    const defaults: NonNullable<ApplyInput['defaults']> = {}
    if (chatModel)
      defaults.chatModel = chatModel
    if (ttsModel)
      defaults.ttsModel = ttsModel
    if (ttsVoices && Object.keys(ttsVoices).length > 0)
      defaults.ttsVoices = ttsVoices

    const preview: ApplyResult['preview'] = {}
    if (routerConfig)
      preview.LLM_ROUTER_CONFIG = redactCiphertext(routerConfig)
    if (unspeech)
      preview.UNSPEECH_UPSTREAM = redactCiphertext(unspeech)
    if (chatModel)
      preview.DEFAULT_CHAT_MODEL = chatModel
    if (ttsModel)
      preview.DEFAULT_TTS_MODEL = ttsModel
    if (ttsVoices && Object.keys(ttsVoices).length > 0)
      preview.DEFAULT_TTS_VOICES = ttsVoices

    return {
      request: {
        mode: 'merge',
        slices,
        defaults,
      },
      preview,
      loadedAt: new Date().toISOString(),
      missingKeys: [
        ...(routerConfig ? [] : ['LLM_ROUTER_CONFIG']),
        ...(unspeech ? [] : ['UNSPEECH_UPSTREAM']),
        ...(chatModel ? [] : ['DEFAULT_CHAT_MODEL']),
        ...(ttsModel ? [] : ['DEFAULT_TTS_MODEL']),
      ],
    }
  }

  /**
   * Applies an admin request, returning the redacted preview either way.
   *
   * Expects:
   * - At most one `unspeech` slice per request. unspeech is a single
   *   deployment per environment, so multiple entries are almost always an
   *   admin mistake.
   */
  async function apply(input: ApplyInput): Promise<ApplyResult> {
    const unspeechCount = input.slices.filter(s => s.kind === 'unspeech').length
    if (unspeechCount > 1)
      throw createBadRequestError('At most one unspeech slice per request', 'INVALID_BODY')

    const hasRouterInput = input.slices.some(s => s.kind !== 'unspeech')
    const hasUnspeechInput = input.slices.some(s => s.kind === 'unspeech')
    const shouldReadRouterConfig = hasRouterInput
      && (input.mode === 'merge' || input.slices.some(sliceNeedsExistingKey))
    const shouldReadUnspeech = hasUnspeechInput
    const [existingRouterConfig, existingUnspeech] = await Promise.all([
      shouldReadRouterConfig ? deps.configKV.getOptional('LLM_ROUTER_CONFIG') : Promise.resolve(null),
      shouldReadUnspeech ? deps.configKV.getOptional('UNSPEECH_UPSTREAM') : Promise.resolve(null),
    ])

    // Step 1: encrypt new keys and preserve existing ciphertexts when the
    // admin loaded current config and left a key field blank.
    const built = input.slices.map(s => buildSlice(s, deps.envelope, {
      routerConfig: existingRouterConfig,
      unspeech: existingUnspeech,
    }))

    const routerSlices = built.filter((s): s is LlmModelSlice | TtsModelSlice | AsrModelSlice => s.target === 'llm-router')
    const unspeechSlice = built.find((s): s is UnspeechSlice => s.target === 'unspeech')

    // Step 2: build the next LLM_ROUTER_CONFIG tree if any LLM/TTS/ASR slice
    // was supplied. `merge` reads existing first; `reset` skips the read.
    let nextRouterConfig: LlmRouterConfig | undefined
    if (routerSlices.length > 0) {
      nextRouterConfig = buildNextRouterConfig(input.mode, existingRouterConfig, routerSlices)
    }

    // Step 3: build the next UNSPEECH_UPSTREAM. Streaming `models` +
    // `defaultModel` are operator-curated and must survive key/URL rotation,
    // so we graft them from the existing entry when the slice's streaming
    // subtree is set (otherwise there's nothing to merge into).
    let nextUnspeech: UnspeechUpstream | undefined
    if (unspeechSlice) {
      const newValue = unspeechSlice.value
      if (newValue.streaming && existingUnspeech?.streaming) {
        nextUnspeech = {
          ...newValue,
          streaming: {
            ...newValue.streaming,
            models: existingUnspeech.streaming.models?.length ? existingUnspeech.streaming.models : newValue.streaming.models,
            defaultModel: existingUnspeech.streaming.defaultModel ?? newValue.streaming.defaultModel,
          },
        }
      }
      else {
        nextUnspeech = newValue
      }
    }

    const preview: ApplyResult['preview'] = {}
    if (nextRouterConfig)
      preview.LLM_ROUTER_CONFIG = redactCiphertext(nextRouterConfig)
    if (nextUnspeech)
      preview.UNSPEECH_UPSTREAM = redactCiphertext(nextUnspeech)
    if (input.defaults?.chatModel)
      preview.DEFAULT_CHAT_MODEL = input.defaults.chatModel
    if (input.defaults?.ttsModel)
      preview.DEFAULT_TTS_MODEL = input.defaults.ttsModel
    if (input.defaults?.ttsVoices)
      preview.DEFAULT_TTS_VOICES = input.defaults.ttsVoices

    const applied: AppliedSummary[] = built.map(s => s.target === 'unspeech'
      ? { kind: s.kind, target: s.target, keyEntryId: s.keyEntryId }
      : { kind: s.kind, target: s.target, surface: s.surface, modelName: s.modelName, keyEntryId: s.keyEntryId })

    if (input.dryRun) {
      logger.withFields({
        actorUserId: input.actorUserId,
        mode: input.mode,
        applied,
        dryRun: true,
      }).log('admin-router-config dry-run')
      return { applied, invalidatedKeys: [], preview }
    }

    // Step 4: real writes. configKV.set runs the per-key valibot validator,
    // so a malformed shape fails here BEFORE we publish invalidation.
    const invalidatedKeys: string[] = []
    if (nextRouterConfig) {
      await deps.configKV.set('LLM_ROUTER_CONFIG', nextRouterConfig as never)
      invalidatedKeys.push('LLM_ROUTER_CONFIG')
    }
    if (nextUnspeech) {
      await deps.configKV.set('UNSPEECH_UPSTREAM', nextUnspeech as never)
      invalidatedKeys.push('UNSPEECH_UPSTREAM')
    }
    if (input.defaults?.chatModel) {
      await deps.configKV.set('DEFAULT_CHAT_MODEL', input.defaults.chatModel)
      invalidatedKeys.push('DEFAULT_CHAT_MODEL')
    }
    if (input.defaults?.ttsModel) {
      await deps.configKV.set('DEFAULT_TTS_MODEL', input.defaults.ttsModel)
      invalidatedKeys.push('DEFAULT_TTS_MODEL')
    }
    if (input.defaults?.ttsVoices) {
      await deps.configKV.set('DEFAULT_TTS_VOICES', input.defaults.ttsVoices)
      invalidatedKeys.push('DEFAULT_TTS_VOICES')
    }

    // Step 5: cross-instance invalidation. audio-speech-ws reads
    // UNSPEECH_UPSTREAM.streaming fresh on every connection so the publish
    // is observability-only for that surface; LLM_ROUTER_CONFIG and the
    // voice catalog cache rely on it for cross-instance freshness.
    for (const key of invalidatedKeys) {
      const payload = JSON.stringify({ key, version: Date.now(), publishedAt: Date.now() })
      await deps.redis.publish('configkv:invalidate', payload)
    }

    logger.withFields({
      actorUserId: input.actorUserId,
      mode: input.mode,
      applied,
      invalidatedKeys,
    }).log('admin-router-config applied')

    return { applied, invalidatedKeys, preview }
  }

  return { apply, current }
}

export type AdminRouterConfigService = ReturnType<typeof createAdminRouterConfigService>
