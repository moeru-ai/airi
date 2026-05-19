import type { Env } from '../../../../libs/env'
import type { AdminRouterConfigService, SliceInput } from '../../../../services/domain/admin/router-config'
import type { HonoEnv } from '../../../../types/hono'

import { Hono } from 'hono'
import {
  array,
  boolean,
  literal,
  maxLength,
  minLength,
  nonEmpty,
  object,
  optional,
  picklist,
  pipe,
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
 * Hard cap on plaintext key length. Real provider keys are 30–200 chars;
 * 1KB leaves headroom for unusual formats while keeping the body lean.
 */
const MAX_KEY_LENGTH = 1024

/** AAD separator constraint mirrored from `keyEntrySchema` in config-kv. */
const NO_PIPE = regex(/^[^|]+$/, 'must not contain "|" (reserved AAD separator)')

const OpenRouterSliceSchema = object({
  kind: literal('openrouter'),
  modelName: pipe(string(), nonEmpty('modelName is required'), maxLength(200), NO_PIPE),
  overrideModel: pipe(string(), nonEmpty('overrideModel is required'), maxLength(200)),
  plaintextKey: pipe(string(), nonEmpty('plaintextKey is required'), maxLength(MAX_KEY_LENGTH)),
  baseURL: optional(pipe(string(), url('baseURL must be a valid URL'))),
  keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
  headerTemplate: optional(pipe(string(), nonEmpty(), maxLength(200))),
})

const AzureSliceSchema = object({
  kind: literal('azure'),
  modelName: pipe(string(), nonEmpty('modelName is required'), maxLength(200), NO_PIPE),
  region: pipe(string(), nonEmpty('region is required'), maxLength(64)),
  plaintextKey: pipe(string(), nonEmpty('plaintextKey is required'), maxLength(MAX_KEY_LENGTH)),
  keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
})

const DashscopeSliceSchema = object({
  kind: literal('dashscope-cosyvoice'),
  modelName: pipe(string(), nonEmpty('modelName is required'), maxLength(200), NO_PIPE),
  region: picklist(['intl', 'cn'], 'region must be "intl" or "cn"'),
  upstreamModel: pipe(string(), nonEmpty('upstreamModel is required'), maxLength(200)),
  plaintextKey: pipe(string(), nonEmpty('plaintextKey is required'), maxLength(MAX_KEY_LENGTH)),
  keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
})

/**
 * `upstreamURL` must be ws:// or wss://. http(s):// here is almost always a
 * copy-paste of the unspeech REST endpoint, which would fail at
 * `new WebSocket()` inside the audio-speech-ws proxy with no actionable
 * error for the admin.
 */
const StreamingTtsSliceSchema = object({
  kind: literal('streaming-tts'),
  upstreamURL: pipe(
    string(),
    nonEmpty('upstreamURL is required'),
    regex(/^wss?:\/\/\S+$/, 'upstreamURL must start with ws:// or wss://'),
    maxLength(500),
  ),
  plaintextKey: pipe(string(), nonEmpty('plaintextKey is required'), maxLength(MAX_KEY_LENGTH)),
  keyEntryId: optional(pipe(string(), nonEmpty(), maxLength(200), NO_PIPE)),
})

const SliceSchema = variant('kind', [
  OpenRouterSliceSchema,
  AzureSliceSchema,
  DashscopeSliceSchema,
  StreamingTtsSliceSchema,
])

const BodySchema = object({
  mode: optional(picklist(['merge', 'reset']), 'merge'),
  dryRun: optional(boolean(), false),
  slices: pipe(
    array(SliceSchema),
    minLength(1, 'slices must not be empty'),
    maxLength(MAX_SLICES_PER_REQUEST, `slices must be at most ${MAX_SLICES_PER_REQUEST} entries`),
  ),
  defaults: optional(object({
    chatModel: optional(pipe(string(), nonEmpty('defaults.chatModel must not be empty'), maxLength(200))),
    ttsModel: optional(pipe(string(), nonEmpty('defaults.ttsModel must not be empty'), maxLength(200))),
  })),
})

/**
 * Admin route for seeding / patching the LLM router config tree. Mounted
 * at `POST /api/admin/config/router`; the only supported way to write
 * `LLM_ROUTER_CONFIG`, `STREAMING_TTS_UPSTREAM`, and the
 * `DEFAULT_{CHAT,TTS}_MODEL` aliases.
 *
 * Body shape (discriminated on `slices[].kind`):
 *
 *   {
 *     "mode": "merge" | "reset",        // defaults to "merge"
 *     "dryRun": false,                  // when true, returns redacted preview
 *                                       // and skips writes + invalidation
 *     "slices": [
 *       { "kind": "openrouter", "modelName": "chat-default",
 *         "overrideModel": "openai/gpt-4o-mini", "plaintextKey": "..." },
 *       { "kind": "azure", "modelName": "microsoft/v1",
 *         "region": "eastasia", "plaintextKey": "..." },
 *       { "kind": "dashscope-cosyvoice", "modelName": "alibaba/cosyvoice-v2",
 *         "region": "intl", "upstreamModel": "cosyvoice-v2",
 *         "plaintextKey": "..." },
 *       { "kind": "streaming-tts",
 *         "upstreamURL": "ws://airi-unspeech.railway.internal:5933/v1/audio/speech/stream",
 *         "plaintextKey": "..." }
 *     ],
 *     "defaults": {
 *       "chatModel": "chat-default",    // writes DEFAULT_CHAT_MODEL
 *       "ttsModel":  "alibaba/cosyvoice-v2"  // writes DEFAULT_TTS_MODEL
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
 *       "STREAMING_TTS_UPSTREAM": { ... },
 *       "DEFAULT_CHAT_MODEL":    "chat-default",
 *       "DEFAULT_TTS_MODEL":     "alibaba/cosyvoice-v2"
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
  env: Env,
) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .use('*', adminGuard(env))
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
