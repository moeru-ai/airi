import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult, TtsVoiceCatalogContext } from './types'

import { createBadRequestError, createInternalError } from '../../../utils/error'
import { nanoid } from '../../../utils/id'
import { audioMimeFromFormat } from './audio-format'
import { listVoicesViaUnSpeech, sendSpeechViaUnSpeech } from './unspeech'

/**
 * Default Volcengine TTS voice id. `BV001_streaming` is Volcengine's standard
 * Chinese general-purpose streaming voice referenced in their docs.
 */
const DEFAULT_VOLCENGINE_VOICE = 'BV001_streaming'

/**
 * Default Volcengine audio encoding. Matches our OpenAI-shape `mp3` default.
 */
const DEFAULT_VOLCENGINE_FORMAT = 'mp3'

/**
 * Default Volcengine cluster. Documented as `volcano_tts` for the generic
 * hosted TTS endpoint; ops can override via `adapterParams.cluster`.
 */
const DEFAULT_VOLCENGINE_CLUSTER = 'volcano_tts'

/**
 * Volcengine non-streaming REST adapter.
 *
 * Use when:
 * - Routing a hosted TTS request to Volcengine OpenSpeech.
 *
 * Expects:
 * - `ctx.baseURL` is the Volcengine TTS endpoint, e.g.
 *   `https://openspeech.bytedance.com/api/v1/tts`.
 * - `ctx.keyPlaintext` is the access token. The auth header uses Volcengine's
 *   non-standard `Bearer; <token>` format (semicolon after `Bearer`).
 * - `ctx.adapterParams.appid` is the Volcengine application id (required).
 * - `ctx.adapterParams.cluster` overrides the default cluster id when set.
 *
 * Returns:
 * - {@link TtsResult} with the audio bytes as an `ArrayBuffer`. Body is
 *   decoded from the upstream JSON `data` base64 field.
 */
export const volcengineAdapter: TtsAdapter = {
  id: 'volcengine',

  async send(input: TtsInput, ctx: TtsAdapterContext): Promise<TtsResult> {
    const appid = ctx.adapterParams.appid
    if (typeof appid !== 'string' || !appid)
      throw createInternalError('volcengine tts: adapterParams.appid is required')

    const cluster = typeof ctx.adapterParams.cluster === 'string'
      ? ctx.adapterParams.cluster
      : DEFAULT_VOLCENGINE_CLUSTER

    const apiResourceId = typeof ctx.adapterParams.model === 'string'
      ? ctx.adapterParams.model
      : undefined

    const voice = input.voice ?? DEFAULT_VOLCENGINE_VOICE
    if (typeof input.extraOptions?.pitch === 'number' || typeof input.extraOptions?.volume === 'number') {
      throw createBadRequestError(
        'volcengine does not support Voice Pack pitch or volume parameters',
        'BAD_REQUEST',
      )
    }
    const encoding = input.responseFormat ?? DEFAULT_VOLCENGINE_FORMAT
    const speed = input.speed ?? 1

    // unspeech volcengine backend (unspeech/pkg/backend/volcengine/speech.go):
    // - reads token from `Authorization: Bearer <token>` (strips "Bearer "
    //   prefix), then re-attaches as `Bearer; <token>` to the upstream — so
    //   we send a normal Bearer here, NOT the `Bearer; ` form.
    // - takes `app.appid`, `app.cluster`, `user.uid`, `request.reqid`,
    //   `audio.encoding`, `audio.speed_ratio` from `extra_body` jsonpath.
    // - decodes the upstream base64 audio frame itself and returns binary.
    return sendSpeechViaUnSpeech({
      ctx,
      model: apiResourceId ? `volcengine/${apiResourceId}` : 'volcengine',
      input: input.text,
      voice,
      responseFormat: encoding,
      extraBody: {
        app: { appid, cluster },
        user: { uid: 'airi-server' },
        audio: { speed_ratio: speed },
        request: { reqid: nanoid(), operation: 'query' },
      },
      fallbackContentType: audioMimeFromFormat(encoding),
      providerLabel: 'volcengine',
    })
  },

  async getVoiceCatalog(ctx: TtsVoiceCatalogContext): Promise<Voice[]> {
    // unspeech embeds the Volcengine catalog at build time
    // (unspeech/pkg/backend/volcengine/voices.go), filtered server-side to
    // streaming-compatible voices. Passing `model=<api_resource_id>` narrows
    // further by `compatible_models` — adapterParams.model is the operator-
    // configured resource id (e.g. `seed-tts-2.0`).
    const params = new URLSearchParams({ provider: 'volcengine' })
    const apiResourceId = typeof ctx.adapterParams?.model === 'string'
      ? ctx.adapterParams.model
      : undefined
    if (apiResourceId)
      params.set('model', apiResourceId)

    return listVoicesViaUnSpeech({
      ctx,
      query: params.toString(),
      providerLabel: 'volcengine',
    })
  },
}
