import type Redis from 'ioredis'
import type { InferOutput } from 'valibot'

import type { EnvelopeCrypto } from '../../../../utils/envelope-crypto'
import type { ConfigKVService, llmModelSchema, llmRouterConfigSchema, ttsModelSchema, ttsUpstreamSchema } from '../../../adapters/config-kv'

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
  'azure': 'azure-tts-prod-1',
  'dashscope-cosyvoice': 'dashscope-tts-prod-1',
  'streaming-tts': 'volcengine-prod-1',
} as const

type LlmRouterConfig = InferOutput<typeof llmRouterConfigSchema>
type LlmModel = InferOutput<typeof llmModelSchema>
type TtsModel = InferOutput<typeof ttsModelSchema>
type TtsUpstream = InferOutput<typeof ttsUpstreamSchema>

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
    | AzureSliceInput
    | DashscopeSliceInput
    | StreamingTtsSliceInput

export interface OpenRouterSliceInput {
  kind: 'openrouter'
  /** Key under `LLM_ROUTER_CONFIG.llm.models`. */
  modelName: string
  /** Upstream model id sent to OpenRouter (e.g. `openai/gpt-4o-mini`). */
  overrideModel: string
  /** Plaintext provider key. Encrypted in-place; never echoed back. */
  plaintextKey: string
  /** @default 'https://openrouter.ai/api/v1' */
  baseURL?: string
  /** @default 'openrouter-prod-1' */
  keyEntryId?: string
  /** @default 'Bearer {KEY}' */
  headerTemplate?: string
}

export interface AzureSliceInput {
  kind: 'azure'
  /** Key under `LLM_ROUTER_CONFIG.tts.models` (e.g. `microsoft/v1`). */
  modelName: string
  /** Azure Speech region, used in baseURL and `adapterParams.region`. */
  region: string
  plaintextKey: string
  /** @default 'azure-tts-prod-1' */
  keyEntryId?: string
}

export interface DashscopeSliceInput {
  kind: 'dashscope-cosyvoice'
  /** Key under `LLM_ROUTER_CONFIG.tts.models` (e.g. `alibaba/cosyvoice-v2`). */
  modelName: string
  /** `intl` → dashscope-intl.aliyuncs.com (Singapore); `cn` → dashscope.aliyuncs.com (Beijing). */
  region: 'intl' | 'cn'
  /** Concrete cosyvoice variant the adapter calls upstream. Independent from `modelName`. */
  upstreamModel: string
  plaintextKey: string
  /** @default 'dashscope-tts-prod-1' */
  keyEntryId?: string
}

export interface StreamingTtsSliceInput {
  kind: 'streaming-tts'
  /** unspeech ws endpoint: `ws://airi-unspeech.railway.internal:5933/v1/audio/speech/stream` etc. */
  upstreamURL: string
  /** Upstream provider key (Volcengine `X-Api-Key`), not an unspeech token. */
  plaintextKey: string
  /** @default 'volcengine-prod-1' */
  keyEntryId?: string
}

interface LlmModelSlice {
  target: 'llm-router'
  surface: 'llm'
  kind: 'openrouter'
  modelName: string
  model: LlmModel
  keyEntryId: string
}

interface TtsModelSlice {
  target: 'llm-router'
  surface: 'tts'
  kind: 'azure' | 'dashscope-cosyvoice'
  modelName: string
  model: TtsModel
  keyEntryId: string
}

interface StreamingTtsSlice {
  target: 'streaming-tts'
  kind: 'streaming-tts'
  value: TtsUpstream
  keyEntryId: string
}

type BuiltSlice = LlmModelSlice | TtsModelSlice | StreamingTtsSlice

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
  const keyEntryId = input.keyEntryId ?? DEFAULT_KEY_ENTRY_IDS.openrouter
  const ciphertext = envelope.encryptKey(input.plaintextKey, {
    modelName: input.modelName,
    keyEntryId,
  })
  return {
    target: 'llm-router',
    surface: 'llm',
    kind: 'openrouter',
    modelName: input.modelName,
    keyEntryId,
    model: {
      upstreams: [{
        baseURL: input.baseURL ?? 'https://openrouter.ai/api/v1',
        overrideModel: input.overrideModel,
        keys: [{ id: keyEntryId, ciphertext }],
        headerTemplate: input.headerTemplate ?? 'Bearer {KEY}',
      }],
    } as LlmModel,
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
  const ciphertext = envelope.encryptKey(input.plaintextKey, {
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
        adapterParams: { region: input.region },
      }],
    } as TtsModel,
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
  const ciphertext = envelope.encryptKey(input.plaintextKey, {
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
    } as TtsModel,
  }
}

/**
 * Encrypts a streaming TTS slice into the STREAMING_TTS_UPSTREAM shape.
 *
 * Use when:
 * - Admin posts a `streaming-tts` slice; called by {@link buildSlice}.
 *
 * Expects:
 * - `upstreamURL` starts with `ws://` or `wss://`. http:// is almost always a
 *   copy-paste of the unspeech REST endpoint and fails at `new WebSocket()`
 *   inside the audio-speech-ws proxy.
 */
export function buildStreamingTtsSlice(input: StreamingTtsSliceInput, envelope: EnvelopeCrypto): StreamingTtsSlice {
  const keyEntryId = input.keyEntryId ?? DEFAULT_KEY_ENTRY_IDS['streaming-tts']
  const ciphertext = envelope.encryptKey(input.plaintextKey, {
    modelName: STREAMING_TTS_AAD_MODEL_NAME,
    keyEntryId,
  })
  return {
    target: 'streaming-tts',
    kind: 'streaming-tts',
    keyEntryId,
    value: {
      baseURL: input.upstreamURL,
      keys: [{ id: keyEntryId, ciphertext }],
      adapterParams: {},
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
export function buildSlice(input: SliceInput, envelope: EnvelopeCrypto): BuiltSlice {
  switch (input.kind) {
    case 'openrouter':
      return buildOpenRouterSlice(input, envelope)
    case 'azure':
      return buildAzureSlice(input, envelope)
    case 'dashscope-cosyvoice':
      return buildDashscopeSlice(input, envelope)
    case 'streaming-tts':
      return buildStreamingTtsSlice(input, envelope)
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
  slices: (LlmModelSlice | TtsModelSlice)[],
): LlmRouterConfig {
  const llmModels: Record<string, LlmModel>
    = mode === 'merge' && existing?.llm?.models ? { ...existing.llm.models } : {}
  const ttsModels: Record<string, TtsModel>
    = mode === 'merge' && existing?.tts?.models ? { ...existing.tts.models } : {}

  for (const slice of slices) {
    if (slice.surface === 'llm')
      llmModels[slice.modelName] = slice.model
    else
      ttsModels[slice.modelName] = slice.model
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
  }
  /** Admin user id for audit logging only. Not part of the persisted config. */
  actorUserId?: string
}

export interface AppliedSummary {
  kind: SliceInput['kind']
  target: 'llm-router' | 'streaming-tts'
  surface?: 'llm' | 'tts'
  modelName?: string
  keyEntryId: string
}

export interface ApplyResult {
  applied: AppliedSummary[]
  invalidatedKeys: string[]
  preview: {
    LLM_ROUTER_CONFIG?: unknown
    STREAMING_TTS_UPSTREAM?: unknown
    DEFAULT_CHAT_MODEL?: string
    DEFAULT_TTS_MODEL?: string
  }
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

  /**
   * Applies an admin request, returning the redacted preview either way.
   *
   * Expects:
   * - At most one `streaming-tts` slice per request. The streaming surface
   *   is a single unspeech instance per deployment, so multiple entries are
   *   almost always an admin mistake.
   */
  async function apply(input: ApplyInput): Promise<ApplyResult> {
    const streamingCount = input.slices.filter(s => s.kind === 'streaming-tts').length
    if (streamingCount > 1)
      throw createBadRequestError('At most one streaming-tts slice per request', 'INVALID_BODY')

    // Step 1: encrypt every slice. Throws (via envelope) only on malformed
    // master key, which means the deployment is broken; surface as 500.
    const built = input.slices.map(s => buildSlice(s, deps.envelope))

    const llmTtsSlices = built.filter((s): s is LlmModelSlice | TtsModelSlice => s.target === 'llm-router')
    const streamingSlice = built.find((s): s is StreamingTtsSlice => s.target === 'streaming-tts')

    // Step 2: build the next LLM_ROUTER_CONFIG tree if any LLM/TTS slice
    // was supplied. `merge` reads existing first; `reset` skips the read.
    let nextRouterConfig: LlmRouterConfig | undefined
    if (llmTtsSlices.length > 0) {
      const existing = input.mode === 'merge'
        ? await deps.configKV.getOptional('LLM_ROUTER_CONFIG')
        : null
      nextRouterConfig = buildNextRouterConfig(input.mode, existing, llmTtsSlices)
    }

    const preview: ApplyResult['preview'] = {}
    if (nextRouterConfig)
      preview.LLM_ROUTER_CONFIG = redactCiphertext(nextRouterConfig)
    if (streamingSlice)
      preview.STREAMING_TTS_UPSTREAM = redactCiphertext(streamingSlice.value)
    if (input.defaults?.chatModel)
      preview.DEFAULT_CHAT_MODEL = input.defaults.chatModel
    if (input.defaults?.ttsModel)
      preview.DEFAULT_TTS_MODEL = input.defaults.ttsModel

    const applied: AppliedSummary[] = built.map(s => s.target === 'streaming-tts'
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

    // Step 3: real writes. configKV.set runs the per-key valibot validator,
    // so a malformed shape fails here BEFORE we publish invalidation.
    const invalidatedKeys: string[] = []
    if (nextRouterConfig) {
      await deps.configKV.set('LLM_ROUTER_CONFIG', nextRouterConfig as never)
      invalidatedKeys.push('LLM_ROUTER_CONFIG')
    }
    if (streamingSlice) {
      await deps.configKV.set('STREAMING_TTS_UPSTREAM', streamingSlice.value as never)
      invalidatedKeys.push('STREAMING_TTS_UPSTREAM')
    }
    if (input.defaults?.chatModel) {
      await deps.configKV.set('DEFAULT_CHAT_MODEL', input.defaults.chatModel)
      invalidatedKeys.push('DEFAULT_CHAT_MODEL')
    }
    if (input.defaults?.ttsModel) {
      await deps.configKV.set('DEFAULT_TTS_MODEL', input.defaults.ttsModel)
      invalidatedKeys.push('DEFAULT_TTS_MODEL')
    }

    // Step 4: cross-instance invalidation. config-sync-subscriber currently
    // only acts on `LLM_ROUTER_CONFIG` (audio-speech-ws reads
    // `STREAMING_TTS_UPSTREAM` fresh on every connection), but we publish
    // all touched keys for forward compatibility.
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

  return { apply }
}

export type AdminRouterConfigService = ReturnType<typeof createAdminRouterConfigService>
