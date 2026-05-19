import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult } from './types'

import { Buffer } from 'node:buffer'

import { errorMessageFrom } from '@moeru/std'

import cosyvoiceVoices from './voices/dashscope-cosyvoice.json' with { type: 'json' }

import { createInternalError } from '../../../utils/error'

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
 * Hard cap on the audio bytes we will pull from the `output.audio.url`
 * follow-up fetch. CosyVoice non-streaming responses for normal TTS prompts
 * stay well under this; the limit exists so a misbehaving / hijacked URL
 * cannot exhaust memory on the gateway instance.
 */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

/**
 * DashScope cosyvoice non-streaming REST adapter.
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

    // v2 / v3 request shape: voice / format / sample_rate live under `input`
    // (NOT `parameters`, which was the v1 multimodal-generation schema). Speed
    // is currently dropped on v2 non-streaming — there is no documented field
    // for it on this endpoint; SSML rate is the supported substitute on
    // SSML-enabled voices.
    const body: Record<string, unknown> = {
      model,
      input: {
        text: input.text,
        voice,
        format,
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

    let payload: unknown
    try {
      payload = await response.json()
    }
    catch (error) {
      throw createInternalError(`dashscope-cosyvoice tts response parse failed: ${errorMessageFrom(error) ?? 'unknown'}`)
    }

    const audioUrl = extractCosyvoiceAudioUrl(payload)
    if (!audioUrl) {
      // Could be a request-mode mismatch (SSE was enabled, response shape
      // changed) or an upstream-policy reject that returned 200 with an empty
      // envelope. Treat as a recoverable upstream error so the router can
      // try the next key / upstream.
      const err = new Error(`dashscope-cosyvoice tts upstream returned no audio.url (envelope: ${stringifyEnvelope(payload)})`) as Error & { status?: number }
      err.status = response.status
      throw err
    }

    let audioBytes: ArrayBuffer
    try {
      audioBytes = await fetchAudioBytes(ctx.fetchImpl, audioUrl, ctx.abortSignal)
    }
    catch (error) {
      throw createInternalError(`dashscope-cosyvoice tts audio download failed: ${errorMessageFrom(error) ?? 'unknown'}`)
    }

    const contentType = formatToMime(format)
    return { contentType, body: audioBytes }
  },

  getVoiceCatalog() {
    return cosyvoiceVoices as Voice[]
  },
}

/**
 * Pulls the `output.audio.url` short-lived signed URL out of a cosyvoice
 * non-streaming JSON envelope. Returns `null` if the response shape doesn't
 * match (e.g. error envelope, SSE leak, or v1-style `audio.data` payload),
 * so the caller can surface a clear upstream error.
 */
function extractCosyvoiceAudioUrl(payload: unknown): string | null {
  if (payload == null || typeof payload !== 'object')
    return null
  const output = (payload as { output?: unknown }).output
  if (output == null || typeof output !== 'object')
    return null
  const audio = (output as { audio?: unknown }).audio
  if (audio == null || typeof audio !== 'object')
    return null
  const url = (audio as { url?: unknown }).url
  if (typeof url !== 'string' || url.length === 0)
    return null
  return url
}

/**
 * Stringify just enough of the upstream JSON to make the "no audio.url" error
 * actionable, without leaking secrets like API keys. Keeps the snippet small
 * so it fits inside the router's bodySnippet propagation path.
 */
function stringifyEnvelope(payload: unknown): string {
  try {
    return JSON.stringify(payload).slice(0, 256)
  }
  catch {
    return '<unserializable>'
  }
}

/**
 * Follow-up GET against the short-lived signed URL the cosyvoice endpoint
 * returns. Streamed into an ArrayBuffer with a hard size cap so a misbehaving
 * URL cannot exhaust memory on the gateway.
 */
async function fetchAudioBytes(fetchImpl: typeof fetch, url: string, abortSignal: AbortSignal | undefined): Promise<ArrayBuffer> {
  const audioResp = await fetchImpl(url, { method: 'GET', signal: abortSignal })
  if (!audioResp.ok) {
    const err = new Error(`audio.url responded ${audioResp.status}`) as Error & { status?: number }
    err.status = audioResp.status
    throw err
  }

  if (audioResp.body == null) {
    throw new Error('audio.url response had no body')
  }

  const reader = audioResp.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let drained = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        drained = true
        break
      }
      total += value.length
      if (total > MAX_AUDIO_BYTES)
        throw new Error(`audio payload exceeded ${MAX_AUDIO_BYTES} bytes`)
      chunks.push(value)
    }
  }
  finally {
    // Cancel only if we exited early; double-cancel after a clean drain is
    // a no-op in spec but `reader.closed` is a Promise (always truthy), so
    // we track the drain explicitly instead of testing `closed`.
    if (!drained)
      reader.cancel().catch(() => {})
  }

  const buf = Buffer.concat(chunks.map(c => Buffer.from(c)))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
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
