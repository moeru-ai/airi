import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult } from './types'

import { Buffer } from 'node:buffer'

import { errorMessageFrom } from '@moeru/std'

import { createInternalError } from '../../utils/error'

/**
 * Default DashScope cosyvoice voice id. `longxiaochun` is the most commonly
 * referenced general-purpose Chinese voice in Alibaba's docs.
 *
 * NOTICE:
 * Hardcoded near use; promote when ops want per-tenant defaults.
 */
const DEFAULT_COSYVOICE_VOICE = 'longxiaochun'

/**
 * Default cosyvoice audio format. Mirrors the OpenAI `mp3` default expected by
 * downstream consumers.
 */
const DEFAULT_COSYVOICE_FORMAT = 'mp3'

/**
 * Default cosyvoice model id targeted by v1. Adapters can be retargeted via
 * `adapterParams.model` if ops want to A/B between cosyvoice variants without
 * deploying a code change.
 */
const DEFAULT_COSYVOICE_MODEL = 'cosyvoice-v1'

/**
 * DashScope cosyvoice non-streaming REST adapter.
 *
 * Use when:
 * - Routing a hosted TTS request to Alibaba DashScope's cosyvoice family of
 *   models (Chinese + English speech synthesis).
 *
 * Expects:
 * - `ctx.baseURL` points at the DashScope multimodal-generation endpoint, e.g.
 *   `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`.
 * - `ctx.keyPlaintext` is the DashScope API key (sent as `Bearer ...`).
 *
 * Returns:
 * - {@link TtsResult} with the audio bytes as an `ArrayBuffer`. Body is
 *   decoded from the upstream JSON's `output.audio.data` base64 payload.
 */
export const dashscopeCosyvoiceAdapter: TtsAdapter = {
  id: 'dashscope-cosyvoice',

  async send(input: TtsInput, ctx: TtsAdapterContext): Promise<TtsResult> {
    const model = typeof ctx.adapterParams.model === 'string'
      ? ctx.adapterParams.model
      : DEFAULT_COSYVOICE_MODEL
    const voice = input.voice ?? DEFAULT_COSYVOICE_VOICE
    const format = input.responseFormat ?? DEFAULT_COSYVOICE_FORMAT

    // DashScope multimodal-generation body: `input.text` for the prompt and
    // `parameters` for synthesis options. cosyvoice v1 accepts a `rate`
    // multiplier (defaults to 1.0 server-side when omitted).
    const body: Record<string, unknown> = {
      model,
      input: { text: input.text },
      parameters: {
        voice,
        format,
        ...(input.speed != null ? { rate: input.speed } : {}),
      },
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${ctx.keyPlaintext.toString('utf8')}`,
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
      throw createInternalError(`dashscope-cosyvoice tts fetch failed: ${errorMessageFrom(error) ?? 'unknown'}`)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const err = new Error(`dashscope-cosyvoice tts upstream ${response.status}: ${text.slice(0, 256)}`) as Error & { status?: number }
      err.status = response.status
      throw err
    }

    // cosyvoice v1 synthesize mode returns JSON. The audio payload sits under
    // `output.audio.data` as a base64 string. We decode to ArrayBuffer here so
    // the router/handler can re-stream identically to the Azure path.
    let payload: unknown
    try {
      payload = await response.json()
    }
    catch (error) {
      throw createInternalError(`dashscope-cosyvoice tts response parse failed: ${errorMessageFrom(error) ?? 'unknown'}`)
    }

    const audioData = extractCosyvoiceAudioBase64(payload)
    if (!audioData) {
      const err = new Error('dashscope-cosyvoice tts upstream returned no audio data') as Error & { status?: number }
      err.status = response.status
      throw err
    }

    const buf = Buffer.from(audioData, 'base64')
    // Slice avoids returning a view over the larger pooled Node buffer.
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const contentType = formatToMime(format)

    return { contentType, body: arrayBuffer }
  },

  getVoiceCatalog() {
    // TODO(U6): replace with `import voices from './voices/dashscope-cosyvoice.json' with { type: 'json' }`.
    return []
  },
}

/**
 * Pulls the base64 audio string out of a cosyvoice JSON response. Returns
 * `null` if the response shape doesn't match (e.g. error envelope) so the
 * caller can surface a clear upstream error.
 */
function extractCosyvoiceAudioBase64(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object')
    return null
  const output = (payload as Record<string, unknown>).output
  if (!output || typeof output !== 'object')
    return null
  const audio = (output as Record<string, unknown>).audio
  if (!audio || typeof audio !== 'object')
    return null
  const data = (audio as Record<string, unknown>).data
  return typeof data === 'string' ? data : null
}

/**
 * Maps cosyvoice's `format` (`mp3` / `wav` / `pcm`) to a MIME type for the
 * gateway response.
 */
function formatToMime(format: string): string {
  if (format === 'mp3')
    return 'audio/mpeg'
  if (format === 'wav')
    return 'audio/wav'
  if (format === 'pcm')
    return 'audio/L16'
  return 'application/octet-stream'
}
