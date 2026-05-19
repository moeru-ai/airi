import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult } from './types'

import { Buffer } from 'node:buffer'

import { errorMessageFrom } from '@moeru/std'

import volcengineVoices from './voices/volcengine.json' with { type: 'json' }

import { createInternalError } from '../../../utils/error'
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
    const appid = typeof ctx.adapterParams.appid === 'string' ? ctx.adapterParams.appid : undefined
    if (!appid) {
      // Misconfigured upstream — the router config validation should have
      // caught this earlier, but defending here keeps the adapter total.
      throw createInternalError('volcengine tts: adapterParams.appid is required')
    }
    const cluster = typeof ctx.adapterParams.cluster === 'string'
      ? ctx.adapterParams.cluster
      : DEFAULT_VOLCENGINE_CLUSTER

    const voice = input.voice ?? DEFAULT_VOLCENGINE_VOICE
    const encoding = input.responseFormat ?? DEFAULT_VOLCENGINE_FORMAT
    const speed = input.speed ?? 1

    const token = ctx.keyPlaintext.toString('utf8')

    // Volcengine TTS request envelope (v1 non-streaming "query" mode).
    // Per docs the `reqid` must be unique per request; we use nanoid for that.
    const body = {
      app: { appid, token, cluster },
      user: { uid: 'airi-server' },
      audio: {
        voice_type: voice,
        encoding,
        speed_ratio: speed,
      },
      request: {
        reqid: nanoid(),
        text: input.text,
        operation: 'query',
      },
    }

    const headers: Record<string, string> = {
      // NOTICE:
      // Volcengine's auth header uses `Bearer; <token>` (note the semicolon),
      // not standard `Bearer <token>`. Documented at
      // https://www.volcengine.com/docs/6561/79817 — sending a normal Bearer
      // returns 401.
      'Authorization': `Bearer; ${token}`,
      'Content-Type': 'application/json',
    }

    let response: Response
    try {
      response = await ctx.fetchImpl(ctx.baseURL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
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

    let payload: unknown
    try {
      payload = await response.json()
    }
    catch (error) {
      throw createInternalError(`volcengine tts response parse failed: ${errorMessageFrom(error) ?? 'unknown'}`)
    }

    const audioData = extractVolcengineAudioBase64(payload)
    if (!audioData) {
      const err = new Error('volcengine tts upstream returned no audio data') as Error & { status?: number }
      err.status = response.status
      throw err
    }

    const buf = Buffer.from(audioData, 'base64')
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const contentType = encodingToMime(encoding)

    return { contentType, body: arrayBuffer }
  },

  getVoiceCatalog() {
    return volcengineVoices as Voice[]
  },
}

/**
 * Reads the `data` base64 field from Volcengine's JSON response. Returns
 * `null` if the response shape doesn't carry audio (e.g. error envelope).
 */
function extractVolcengineAudioBase64(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object')
    return null
  const data = (payload as Record<string, unknown>).data
  return typeof data === 'string' ? data : null
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
