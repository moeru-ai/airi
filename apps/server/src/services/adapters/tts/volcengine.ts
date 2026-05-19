import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult, TtsVoiceCatalogContext } from './types'

import { errorMessageFrom } from '@moeru/std'

import { createBadGatewayError, createInternalError } from '../../../utils/error'
import { nanoid } from '../../../utils/id'

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
    const encoding = input.responseFormat ?? DEFAULT_VOLCENGINE_FORMAT
    const speed = input.speed ?? 1

    // unspeech volcengine backend (unspeech/pkg/backend/volcengine/speech.go):
    // - reads token from `Authorization: Bearer <token>` (strips "Bearer "
    //   prefix), then re-attaches as `Bearer; <token>` to the upstream — so
    //   we send a normal Bearer here, NOT the `Bearer; ` form.
    // - takes `app.appid`, `app.cluster`, `user.uid`, `request.reqid`,
    //   `audio.encoding`, `audio.speed_ratio` from `extra_body` jsonpath.
    // - decodes the upstream base64 audio frame itself and returns binary.
    const body = JSON.stringify({
      model: apiResourceId ? `volcengine/${apiResourceId}` : 'volcengine',
      input: input.text,
      voice,
      response_format: encoding,
      extra_body: {
        app: { appid, cluster },
        user: { uid: 'airi-server' },
        audio: { speed_ratio: speed },
        request: { reqid: nanoid(), operation: 'query' },
      },
    })

    let response: Response
    try {
      response = await ctx.fetchImpl(`${ctx.unspeechBaseURL.replace(/\/+$/, '')}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ctx.keyPlaintext.toString('utf8')}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: ctx.abortSignal,
      })
    }
    catch (error) {
      throw createInternalError(`volcengine tts fetch failed: ${errorMessageFrom(error) ?? 'unknown'}`)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const err = new Error(`volcengine tts upstream ${response.status}: ${text.slice(0, 256)}`) as Error & { status?: number }
      err.status = response.status
      throw err
    }

    // unspeech decodes the base64 audio frame and returns binary audio
    // directly — no more JSON envelope on this side.
    const arrayBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') ?? encodingToMime(encoding)

    return { contentType, body: arrayBuffer }
  },

  async getVoiceCatalog(ctx: TtsVoiceCatalogContext): Promise<Voice[]> {
    // unspeech embeds the Volcengine catalog at build time
    // (unspeech/pkg/backend/volcengine/voices.go), filtered server-side to
    // streaming-compatible voices. Passing `model=<api_resource_id>` narrows
    // further by `compatible_models` — adapterParams.model is the operator-
    // configured resource id (e.g. `seed-tts-2.0`).
    const url = new URL(`${ctx.unspeechBaseURL.replace(/\/+$/, '')}/api/voices`)
    url.searchParams.set('backend', 'volcengine')
    const apiResourceId = typeof ctx.adapterParams?.model === 'string'
      ? ctx.adapterParams.model
      : undefined
    if (apiResourceId)
      url.searchParams.set('model', apiResourceId)

    let response: Response
    try {
      response = await ctx.fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: ctx.abortSignal,
      })
    }
    catch (error) {
      throw createBadGatewayError(`volcengine voices fetch failed: ${errorMessageFrom(error) ?? 'unknown'}`)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw createBadGatewayError(
        `volcengine voices upstream ${response.status}: ${text.slice(0, 256)}`,
        { lastStatusCode: response.status },
      )
    }

    const data = await response.json() as { voices: Voice[] }
    if (!Array.isArray(data.voices))
      throw createBadGatewayError('volcengine voices upstream missing voices[]')

    return data.voices
  },
}

/**
 * Maps Volcengine's `encoding` field to a MIME type for the gateway response.
 */
function encodingToMime(encoding: string): string {
  if (encoding === 'mp3')
    return 'audio/mpeg'
  if (encoding === 'wav')
    return 'audio/wav'
  if (encoding === 'pcm')
    return 'audio/L16'
  if (encoding === 'ogg_opus')
    return 'audio/ogg'
  return 'application/octet-stream'
}
