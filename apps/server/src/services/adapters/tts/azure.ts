import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult } from './types'

import { errorMessageFrom } from '@moeru/std'

import azureVoices from './voices/azure.json' with { type: 'json' }

import { createBadRequestError, createInternalError } from '../../../utils/error'

// NOTICE:
// Voice IDs Azure accepts are stable strings like `en-US-AvaMultilingualNeural`.
// We allow the canonical Microsoft pattern only — letters/digits/hyphens.
// Without this guard a malicious `voice` field can break out of `name='...'`
// in the SSML envelope and inject arbitrary `<voice>` / `<lexicon>` elements,
// running under our Azure credential.
// Source: codex review 2026-05-15 HIGH #3.
const AZURE_VOICE_ID = /^[a-z0-9-]+$/i

/**
 * Default Azure voice when the caller doesn't pick one. Microsoft markets this
 * as a general-purpose multilingual neural voice, which matches our hosted
 * default behavior for unspecified voice.
 *
 * NOTICE:
 * Hardcoded near use because there is no operator-tunable default voice yet;
 * promote to configKV when ops need per-tenant defaults.
 */
const DEFAULT_AZURE_VOICE = 'en-US-AvaMultilingualNeural'

/**
 * Default Azure output format header value.
 *
 * Maps to OpenAI's `mp3` response format at the adapter boundary so callers
 * who don't pin `response_format` get a sensible mp3 stream. Callers can
 * still override via `input.responseFormat`.
 */
const DEFAULT_AZURE_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

/**
 * Resolves a caller's `responseFormat` to the Azure `X-Microsoft-OutputFormat`
 * header value Azure expects.
 *
 * Before:
 * - `"mp3"`
 * - `"wav"`
 * - `"audio-24khz-48kbitrate-mono-mp3"` (already an Azure format key)
 *
 * After:
 * - `"audio-24khz-48kbitrate-mono-mp3"`
 * - `"riff-24khz-16bit-mono-pcm"`
 * - `"audio-24khz-48kbitrate-mono-mp3"`
 */
function resolveAzureFormat(responseFormat: string | undefined): string {
  if (!responseFormat)
    return DEFAULT_AZURE_FORMAT
  // Caller already supplied an Azure-native format key; pass through.
  if (responseFormat.includes('-'))
    return responseFormat
  if (responseFormat === 'mp3')
    return 'audio-24khz-48kbitrate-mono-mp3'
  if (responseFormat === 'wav')
    return 'riff-24khz-16bit-mono-pcm'
  if (responseFormat === 'opus')
    return 'ogg-24khz-16bit-mono-opus'
  // Unknown short codes: pass through verbatim — Azure will 400 if invalid and
  // the router maps that error.
  return responseFormat
}

/**
 * Normalizes a numeric speed multiplier into Azure's SSML `prosody rate`
 * percent string. `1.0` returns empty (caller skips the `<prosody>` wrapper).
 *
 * Before:
 * - `1.0`
 * - `1.2`
 * - `0.8`
 *
 * After:
 * - `""`
 * - `"+20%"`
 * - `"-20%"`
 */
function speedToProsodyRate(speed: number | undefined): string {
  if (speed == null || speed === 1)
    return ''
  // Math: SSML accepts non-zero percentages relative to native rate;
  // `(speed - 1) * 100` gives the delta. Sign prefix is required.
  const delta = Math.round((speed - 1) * 100)
  if (delta === 0)
    return ''
  return delta > 0 ? `+${delta}%` : `${delta}%`
}

/**
 * Minimal XML escape for text injected into SSML. Azure rejects malformed XML
 * (raw `<`, `&`, etc.) — we escape only the five XML-mandated entities and
 * leave the rest of the text intact.
 */
function escapeForSsml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;')
}

/**
 * Builds an Azure-compatible SSML envelope for a `{text, voice, speed}` triple.
 *
 * Use when:
 * - Wrapping a hosted user prompt before POSTing to Azure REST TTS.
 *
 * Expects:
 * - `text` is plain text (already-built SSML must be sent via
 *   `extraOptions.disableSsml = true` and bypass this function).
 *
 * Returns:
 * - A self-contained `<speak>` document string Azure accepts as
 *   `Content-Type: application/ssml+xml`.
 */
function buildAzureSsml(text: string, voice: string, speed: number | undefined): string {
  const safe = escapeForSsml(text)
  const rate = speedToProsodyRate(speed)
  const inner = rate
    ? `<prosody rate='${rate}'>${safe}</prosody>`
    : safe
  // xml:lang on <speak> is required by Azure; voice's own language wins for
  // pronunciation, but the root attribute must still be present.
  return `<speak version='1.0' xml:lang='en-US'><voice name='${voice}'>${inner}</voice></speak>`
}

/**
 * Azure Cognitive Services REST adapter.
 *
 * Use when:
 * - The router routes a hosted TTS request to an Azure upstream (e.g.
 *   `https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1`).
 *
 * Expects:
 * - `ctx.baseURL` is the full Azure REST endpoint (region-prefixed).
 * - `ctx.keyPlaintext` is the subscription key string the gateway will send as
 *   `Ocp-Apim-Subscription-Key`.
 *
 * Returns:
 * - {@link TtsResult} with the audio bytes as an `ArrayBuffer`. The
 *   `contentType` is taken from the upstream `content-type` header when
 *   present, otherwise inferred from the requested format.
 */
export const azureAdapter: TtsAdapter = {
  id: 'azure',

  async send(input: TtsInput, ctx: TtsAdapterContext): Promise<TtsResult> {
    const voice = input.voice ?? DEFAULT_AZURE_VOICE
    if (!AZURE_VOICE_ID.test(voice))
      throw createBadRequestError(`azure voice id contains unsupported characters: ${voice}`, 'BAD_REQUEST', { voice })
    const outputFormat = resolveAzureFormat(input.responseFormat)
    const disableSsml = input.extraOptions?.disableSsml === true

    // When disableSsml is set the caller is responsible for shipping valid
    // SSML themselves; we forward as-is to support callers wiring their own
    // <speak> documents.
    const body = disableSsml
      ? input.text
      : buildAzureSsml(input.text, voice, input.speed)

    const headers: Record<string, string> = {
      'Ocp-Apim-Subscription-Key': ctx.keyPlaintext.toString('utf8'),
      'X-Microsoft-OutputFormat': outputFormat,
      'Content-Type': 'application/ssml+xml',
    }

    let response: Response
    try {
      response = await ctx.fetchImpl(ctx.baseURL, {
        method: 'POST',
        headers,
        body,
        signal: ctx.abortSignal,
      })
    }
    catch (error) {
      // Network-level failure (DNS, connection reset, abort). Re-throw so the
      // router can decide to fall back or surface as 502/504.
      throw createInternalError(`azure tts fetch failed: ${errorMessageFrom(error) ?? 'unknown'}`)
    }

    if (!response.ok) {
      // Bubble the upstream status. Router (U3) maps to fallback or 5xx.
      const text = await response.text().catch(() => '')
      const err = new Error(`azure tts upstream ${response.status}: ${text.slice(0, 256)}`) as Error & { status?: number }
      err.status = response.status
      throw err
    }

    const arrayBuffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') ?? inferContentTypeFromAzureFormat(outputFormat)

    return { contentType, body: arrayBuffer }
  },

  getVoiceCatalog() {
    return azureVoices as Voice[]
  },
}

/**
 * Maps Azure's output format key to a MIME type for the gateway response when
 * the upstream omits `content-type` (rare but defensive).
 */
function inferContentTypeFromAzureFormat(format: string): string {
  if (format.includes('mp3'))
    return 'audio/mpeg'
  if (format.includes('opus'))
    return 'audio/ogg'
  if (format.includes('pcm') || format.startsWith('riff'))
    return 'audio/wav'
  return 'application/octet-stream'
}
