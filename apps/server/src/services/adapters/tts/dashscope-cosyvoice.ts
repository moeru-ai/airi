import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult, TtsVoiceCatalogContext } from './types'

import { createBadRequestError } from '../../../utils/error'
import { audioMimeFromFormat } from './audio-format'
import { listVoicesViaUnSpeech, sendSpeechViaUnSpeech } from './unspeech'

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
 * If you bump this past v2, verify the configured default voice exists for
 * that model — voice catalogs differ between v2 (`*_v2`) and v3 (`*_v3`).
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
    if (!input.voice)
      throw createBadRequestError('dashscope-cosyvoice voice is required', 'BAD_REQUEST')
    if (typeof input.extraOptions?.pitch === 'number' || typeof input.extraOptions?.volume === 'number') {
      throw createBadRequestError(
        'dashscope-cosyvoice does not support Voice Pack pitch or volume parameters',
        'BAD_REQUEST',
      )
    }
    const voice = input.voice
    const format = input.responseFormat ?? DEFAULT_COSYVOICE_FORMAT

    return sendSpeechViaUnSpeech({
      ctx,
      model: `alibaba/${model}`,
      input: input.text,
      voice,
      responseFormat: format,
      fallbackContentType: audioMimeFromFormat(format),
      providerLabel: 'dashscope-cosyvoice',
    })
  },

  async getVoiceCatalog(ctx: TtsVoiceCatalogContext): Promise<Voice[]> {
    // unspeech's alibaba backend embeds the catalog at build time
    // (unspeech/pkg/backend/alibaba/voices.go `//go:embed voices.json`),
    // so this call is in-memory on unspeech's side and only crosses a TCP
    // hop. No upstream credential is required.
    const params = new URLSearchParams({ provider: 'alibaba' })
    if (typeof ctx.adapterParams.model === 'string')
      params.set('model', ctx.adapterParams.model)
    return listVoicesViaUnSpeech({
      ctx,
      query: params.toString(),
      providerLabel: 'cosyvoice',
    })
  },
}
