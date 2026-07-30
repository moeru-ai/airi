import type { AdminRouterConfigService, SliceInput } from '../../../../services/domain/admin/router-config'
import type { HonoEnv } from '../../../../types/hono'

import { Hono } from 'hono'
import {
  array,
  boolean,
  literal,
  maxLength,
  nonEmpty,
  object,
  optional,
  picklist,
  pipe,
  record,
  regex,
  safeParse,
  string,
  url,
  variant,
} from 'valibot'

import { adminGuard } from '../../../../middlewares/admin-guard'
import { authGuard } from '../../../../middlewares/auth'
import { createBadRequestError } from '../../../../utils/error'

/**
 * Hard cap on slices per request. The envelope crypto is cheap (~1ms each),
 * so the cap exists to bound request body size and audit log noise, not CPU.
 * Realistic admin calls touch 1–3 providers at a time.
 */
const MAX_SLICES_PER_REQUEST = 20

/**
 * Hard cap on plaintext key length. Most provider keys are short, but
 * Bedrock bearer tokens can be multi-kilobyte signed payloads.
 */
const MAX_KEY_LENGTH = 8192

/** AAD separator constraint mirrored from `keyEntrySchema` in config-kv. */
const NO_PIPE = regex(/^[^|]+$/, 'must not contain "|" (reserved AAD separator)')

const OpenRouterSliceSchema = object({
  kind: literal('openrouter'),
  modelName: pipe(string(), nonEmpty('modelName is required'), maxLength(200), NO_PIPE),
  overrideModel: pipe(string(), nonEmpty('overrideModel is required'), maxLength(200)),
  plaintextKey: optional(pipe(string(), nonEmpty('plaintextKey must not be empty when provided'), maxLength(MAX_KEY_LENGTH))),
  baseURL: optional(pipe(string(), url('baseURL must be a valid URL'))),
  keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
  existingKeyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
  headerTemplate: optional(pipe(string(), nonEmpty(), maxLength(200))),
})

const BedrockSliceSchema = object({
  kind: literal('bedrock'),
  modelName: pipe(string(), nonEmpty('modelName is required'), maxLength(200), NO_PIPE),
  overrideModel: pipe(string(), nonEmpty('overrideModel is required'), maxLength(200)),
  plaintextKey: optional(pipe(string(), nonEmpty('plaintextKey must not be empty when provided'), maxLength(MAX_KEY_LENGTH))),
  baseURL: optional(pipe(string(), url('baseURL must be a valid URL'))),
  keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
  existingKeyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
  headerTemplate: optional(pipe(string(), nonEmpty(), maxLength(200))),
})

const OpenAICompatibleSliceSchema = object({
  kind: literal('openai-compatible'),
  modelName: pipe(string(), nonEmpty('modelName is required'), maxLength(200), NO_PIPE),
  overrideModel: pipe(string(), nonEmpty('overrideModel is required'), maxLength(200)),
  plaintextKey: optional(pipe(string(), nonEmpty('plaintextKey must not be empty when provided'), maxLength(MAX_KEY_LENGTH))),
  baseURL: optional(pipe(string(), url('baseURL must be a valid URL'))),
  keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
  existingKeyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
  headerTemplate: optional(pipe(string(), nonEmpty(), maxLength(200))),
})

const AzureSliceSchema = object({
  kind: literal('azure'),
  modelName: pipe(string(), nonEmpty('modelName is required'), maxLength(200), NO_PIPE),
  region: pipe(string(), nonEmpty('region is required'), maxLength(64)),
  defaultVoice: optional(pipe(string(), nonEmpty('defaultVoice must not be empty'), maxLength(200))),
  plaintextKey: optional(pipe(string(), nonEmpty('plaintextKey must not be empty when provided'), maxLength(MAX_KEY_LENGTH))),
  keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
  existingKeyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
})

const DashscopeSliceSchema = object({
  kind: literal('dashscope-cosyvoice'),
  modelName: pipe(string(), nonEmpty('modelName is required'), maxLength(200), NO_PIPE),
  region: picklist(['intl', 'cn'], 'region must be "intl" or "cn"'),
  upstreamModel: pipe(string(), nonEmpty('upstreamModel is required'), maxLength(200)),
  plaintextKey: optional(pipe(string(), nonEmpty('plaintextKey must not be empty when provided'), maxLength(MAX_KEY_LENGTH))),
  keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
  existingKeyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
})

const StepfunSliceSchema = object({
  kind: literal('stepfun'),
  modelName: pipe(string(), nonEmpty('modelName is required'), maxLength(200), NO_PIPE),
  upstreamModel: optional(picklist(['stepaudio-2.5-tts', 'step-tts-2', 'step-tts-mini'], 'upstreamModel must be a supported StepFun TTS model')),
  defaultVoice: optional(pipe(string(), nonEmpty('defaultVoice must not be empty'), maxLength(200))),
  instruction: optional(pipe(string(), nonEmpty('instruction must not be empty'), maxLength(200))),
  plaintextKey: optional(pipe(string(), nonEmpty('plaintextKey must not be empty when provided'), maxLength(MAX_KEY_LENGTH))),
  keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
  existingKeyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
})

const AliyunNlsAsrSliceSchema = object({
  kind: literal('aliyun-nls-asr'),
  modelName: pipe(string(), nonEmpty('modelName is required'), maxLength(200), NO_PIPE),
  accessKeyId: pipe(string(), nonEmpty('accessKeyId is required'), maxLength(200)),
  appKey: pipe(string(), nonEmpty('appKey is required'), maxLength(200)),
  region: optional(picklist([
    'cn-shanghai',
    'cn-shanghai-internal',
    'cn-beijing',
    'cn-beijing-internal',
    'cn-shenzhen',
    'cn-shenzhen-internal',
  ], 'region must be a supported Aliyun NLS region')),
  plaintextKey: optional(pipe(string(), nonEmpty('plaintextKey must not be empty when provided'), maxLength(MAX_KEY_LENGTH))),
  keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
  existingKeyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
})

/**
 * `restBaseURL` is the unspeech REST root (http(s)://host:port, no path).
 * `streaming.upstreamURL` must be ws:// or wss:// — http(s):// here is almost
 * always a copy-paste of the REST endpoint and fails at `new WebSocket()`
 * inside the audio-speech-ws proxy with no actionable error for the admin.
 */
const UnspeechSliceSchema = object({
  kind: literal('unspeech'),
  restBaseURL: pipe(
    string(),
    nonEmpty('restBaseURL is required'),
    regex(/^https?:\/\/\S+$/, 'restBaseURL must start with http:// or https://'),
    maxLength(500),
  ),
  streaming: optional(object({
    upstreamURL: pipe(
      string(),
      nonEmpty('streaming.upstreamURL is required'),
      regex(/^wss?:\/\/\S+$/, 'streaming.upstreamURL must start with ws:// or wss://'),
      maxLength(500),
    ),
    plaintextKey: optional(pipe(string(), nonEmpty('streaming.plaintextKey must not be empty when provided'), maxLength(MAX_KEY_LENGTH))),
    keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
    existingKeyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
    models: optional(array(object({
      id: pipe(string(), nonEmpty('streaming.models[].id is required'), maxLength(200)),
      name: optional(pipe(string(), nonEmpty(), maxLength(200))),
      description: optional(pipe(string(), nonEmpty(), maxLength(500))),
    }))),
    defaultModel: optional(pipe(string(), nonEmpty('streaming.defaultModel must not be empty'), maxLength(200))),
  })),
})

const SliceSchema = variant('kind', [
  OpenRouterSliceSchema,
  BedrockSliceSchema,
  OpenAICompatibleSliceSchema,
  AzureSliceSchema,
  DashscopeSliceSchema,
  StepfunSliceSchema,
  AliyunNlsAsrSliceSchema,
  UnspeechSliceSchema,
])

const BodySchema = object({
  mode: optional(picklist(['merge', 'reset']), 'merge'),
  dryRun: optional(boolean(), false),
  slices: optional(
    pipe(
      array(SliceSchema),
      maxLength(MAX_SLICES_PER_REQUEST, `slices must be at most ${MAX_SLICES_PER_REQUEST} entries`),
    ),
    [],
  ),
  defaults: optional(object({
    chatModel: optional(pipe(string(), nonEmpty('defaults.chatModel must not be empty'), maxLength(200))),
    ttsModel: optional(pipe(string(), nonEmpty('defaults.ttsModel must not be empty'), maxLength(200))),
    ttsVoices: optional(record(
      pipe(string(), nonEmpty('defaults.ttsVoices model id must not be empty'), maxLength(200)),
      record(
        pipe(string(), nonEmpty('defaults.ttsVoices locale must not be empty'), maxLength(50)),
        pipe(string(), nonEmpty('defaults.ttsVoices voice id must not be empty'), maxLength(200)),
      ),
    )),
  })),
})

/**
 * Admin route for seeding / patching the LLM router config tree. Mounted
 * at `POST /api/admin/config/router`; the only supported way to write
 * `LLM_ROUTER_CONFIG`, `UNSPEECH_UPSTREAM`, and the
 * `DEFAULT_{CHAT,TTS}_MODEL` aliases.
 *
 * Body shape (discriminated on `slices[].kind`):
 *
 *   {
 *     "mode": "merge" | "reset",        // defaults to "merge"
 *     "dryRun": false,                  // when true, returns redacted preview
 *                                       // and skips writes + invalidation
 *     "slices": [                      // optional when only defaults change
 *       { "kind": "openrouter", "modelName": "chat-default",
 *         "overrideModel": "openai/gpt-4o-mini", "plaintextKey": "..." },
 *       { "kind": "bedrock", "modelName": "chat-bedrock",
 *         "overrideModel": "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
 *         "plaintextKey": "...", "baseURL": "https://bedrock-mantle.us-east-1.api.aws/v1" },
 *       { "kind": "openai-compatible", "modelName": "chat-compatible",
 *         "overrideModel": "gpt-4o-mini", "plaintextKey": "...",
 *         "baseURL": "https://api.example.com/v1" },
 *       { "kind": "azure", "modelName": "microsoft/v1",
 *         "region": "eastasia", "plaintextKey": "..." },
 *       { "kind": "dashscope-cosyvoice", "modelName": "alibaba/cosyvoice-v2",
 *         "region": "intl", "upstreamModel": "cosyvoice-v2",
 *         "plaintextKey": "..." },
 *       { "kind": "stepfun", "modelName": "stepfun/stepaudio-2.5-tts",
 *         "upstreamModel": "stepaudio-2.5-tts",
 *         "defaultVoice": "cixingnansheng", "plaintextKey": "..." },
 *       { "kind": "aliyun-nls-asr", "modelName": "auto",
 *         "accessKeyId": "...", "appKey": "...", "plaintextKey": "..." },
 *       { "kind": "unspeech",
 *         "restBaseURL": "http://airi-unspeech.railway.internal:5933",
 *         "streaming": {
 *           "upstreamURL": "ws://airi-unspeech.railway.internal:5933/v1/audio/speech/stream",
 *           "plaintextKey": "..."
 *         } }
 *     ],
 *     "defaults": {
 *       "chatModel": "chat-default",    // writes DEFAULT_CHAT_MODEL
 *       "ttsModel":  "alibaba/cosyvoice-v2", // writes DEFAULT_TTS_MODEL
 *       "ttsVoices": {                  // writes DEFAULT_TTS_VOICES
 *         "alibaba/cosyvoice-v2": {
 *           "zh-CN": "longxiaochun_v2"
 *         }
 *       }
 *     }
 *   }
 *
 * Response:
 *
 *   {
 *     "applied":  [{ kind, target, modelName?, keyEntryId, surface? }, ...],
 *     "invalidatedKeys": ["LLM_ROUTER_CONFIG", "DEFAULT_CHAT_MODEL", ...],
 *     "preview":  {                     // ciphertext redacted to "<N chars>"
 *       "LLM_ROUTER_CONFIG":     { ... },
 *       "UNSPEECH_UPSTREAM":     { ... },
 *       "DEFAULT_CHAT_MODEL":    "chat-default",
 *       "DEFAULT_TTS_MODEL":     "alibaba/cosyvoice-v2",
 *       "DEFAULT_TTS_VOICES":    { ... }
 *     }
 *   }
 *
 * Security notes:
 * - `plaintextKey` is consumed in-process and never returned. The preview
 *   only ever contains length-redacted ciphertext.
 * - The route relies on `bodyLimit(1MB)` from the global middleware chain;
 *   no per-route bumps.
 */
export function createAdminRouterConfigRoutes(
  service: AdminRouterConfigService,
) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .use('*', adminGuard)
    .get('/', async (c) => {
      return c.json(await service.current())
    })
    .post('/', async (c) => {
      const user = c.get('user')!

      const raw = await c.req.json().catch(() => null)
      if (raw == null)
        throw createBadRequestError('Request body must be JSON', 'INVALID_BODY')

      const parsed = safeParse(BodySchema, raw)
      if (!parsed.success) {
        throw createBadRequestError(
          'Invalid request body',
          'INVALID_BODY',
          parsed.issues.map(i => ({
            path: i.path?.map(p => p.key).join('.'),
            message: i.message,
          })),
        )
      }

      const body = parsed.output
      const hasDefaults = body.defaults != null && Object.keys(body.defaults).length > 0
      if (body.slices.length === 0 && !hasDefaults)
        throw createBadRequestError('Request body must include at least one slice or defaults entry', 'INVALID_BODY')

      const result = await service.apply({
        mode: body.mode,
        dryRun: body.dryRun,
        slices: body.slices as SliceInput[],
        defaults: body.defaults,
        actorUserId: user.id,
      })

      return c.json(result)
    })
}
