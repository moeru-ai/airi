import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult, TtsVoiceCatalogContext } from './types'

import { errorMessageFrom } from '@moeru/std'

import { createBadGatewayError, createInternalError } from '../../../utils/error'

/**
 * Default DashScope cosyvoice voice id. v2 voice ids carry an explicit `_v2`
 * suffix; `longxiaochun_v2` is the general-purpose Chinese assistant voice
 * called out in Alibaba's voice list.
 *
 * NOTICE:
 * Hardcoded near use; promote when ops want per-tenant defaults.
 */
const DEFAULT_COSYVOICE_VOICE = 'longxiaochun_v2'

/**
 * Default cosyvoice audio format. Mirrors the OpenAI `mp3` default expected by
 * downstream consumers.
 */
const DEFAULT_COSYVOICE_FORMAT = 'mp3'

/**
 * Default cosyvoice model id. v1 was dropped from the official "REST-supported
 * models" list (the official list now starts at v2 and runs through v3.5);
 * v2 is the most conservative current default and shares a request body shape
 * with v3/v3.5 so ops can retarget via `adapterParams.model` without code.
 * NOTICE:
 * If you bump this past v2, verify the chosen `DEFAULT_COSYVOICE_VOICE` exists
 * for that model — voice catalogs differ between v2 (`*_v2`) and v3 (`*_v3`).
 */
const DEFAULT_COSYVOICE_MODEL = 'cosyvoice-v2'

/**
 * DashScope cosyvoice adapter.
 *
 * Use when:
 * - Routing a hosted TTS request to Alibaba DashScope's cosyvoice v2 / v3
 *   family of models (Chinese + English + selected multilingual voices).
 *
 * Expects:
 * - `ctx.baseURL` is the **full** non-streaming endpoint, e.g.
 *   `https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`
 *   (or `dashscope-intl.aliyuncs.com` for the Singapore region). The adapter
 *   does not append a path — pointing at a bare `/api/v1` will 404.
 * - `ctx.keyPlaintext` is the DashScope API key (sent as `Bearer ...`).
 * - `ctx.adapterParams.model` (optional) names the cosyvoice variant; defaults
 *   to {@link DEFAULT_COSYVOICE_MODEL}.
 *
 * Returns:
 * - {@link TtsResult} with the audio bytes as an `ArrayBuffer`. The non-
 *   streaming endpoint returns a JSON envelope whose `output.audio.url` is
 *   a short-lived signed URL; this adapter performs the follow-up GET and
 *   surfaces the final bytes so router callers get the same single-shot
 *   contract as the Azure / Volcengine paths.
 */
export const dashscopeCosyvoiceAdapter: TtsAdapter = {
  id: 'dashscope-cosyvoice',

  async send(input: TtsInput, ctx: TtsAdapterContext): Promise<TtsResult> {
    const model = typeof ctx.adapterParams.model === 'string'
      ? ctx.adapterParams.model
      : DEFAULT_COSYVOICE_MODEL
    const voice = input.voice ?? DEFAULT_COSYVOICE_VOICE
    const format = input.responseFormat ?? DEFAULT_COSYVOICE_FORMAT

    const body = JSON.stringify({
      model: `alibaba/${model}`,
      input: input.text,
      voice,
      response_format: format,
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
      throw createInternalError(`dashscope-cosyvoice tts fetch failed: ${errorMessageFrom(error) ?? 'unknown'}`)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const err = new Error(`dashscope-cosyvoice tts upstream ${response.status}: ${text.slice(0, 256)}`) as Error & { status?: number }
      err.status = response.status
      throw err
    }

    // unspeech aggregates the WS binary frames and returns the audio buffer
    // directly, so we no longer parse a JSON envelope or follow a signed URL.
    const audioBytes = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') ?? formatToMime(format)

    return { contentType, body: audioBytes }
  },

  async getVoiceCatalog(ctx: TtsVoiceCatalogContext): Promise<Voice[]> {
    // unspeech's alibaba backend embeds the catalog at build time
    // (unspeech/pkg/backend/alibaba/voices.go `//go:embed voices.json`),
    // so this call is in-memory on unspeech's side and only crosses a TCP
    // hop. No upstream credential is required.
    const url = `${ctx.unspeechBaseURL.replace(/\/+$/, '')}/api/voices?backend=alibaba`

    let response: Response
    try {
      response = await ctx.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: ctx.abortSignal,
      })
    }
    catch (error) {
      throw createBadGatewayError(`cosyvoice voices fetch failed: ${errorMessageFrom(error) ?? 'unknown'}`)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw createBadGatewayError(
        `cosyvoice voices upstream ${response.status}: ${text.slice(0, 256)}`,
        { lastStatusCode: response.status },
      )
    }

    const data = await response.json() as { voices: Voice[] }
    if (!Array.isArray(data.voices))
      throw createBadGatewayError('cosyvoice voices upstream missing voices[]')

    return data.voices
  },
}

/**
 * Maps cosyvoice's `format` (`mp3` / `wav` / `pcm`) to a MIME type for the
 * client. Keeps the router contract symmetric with Azure / Volcengine.
 */
function formatToMime(format: string): string {
  switch (format) {
    case 'mp3': return 'audio/mpeg'
    case 'wav': return 'audio/wav'
    case 'pcm': return 'audio/L16'
    default: return 'application/octet-stream'
  }
}
