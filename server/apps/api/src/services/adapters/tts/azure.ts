import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult, TtsVoiceCatalogContext } from './types'

import { inferMicrosoftContentType, isMicrosoftVoiceId, resolveMicrosoftOutputFormat } from 'unspeech'

import { createBadRequestError, createInternalError, createServiceUnavailableError } from '../../../utils/error'
import { listVoicesViaUnSpeech, sendSpeechViaUnSpeech } from './unspeech'

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
    const defaultVoice = typeof ctx.adapterParams.defaultVoice === 'string'
      ? ctx.adapterParams.defaultVoice
      : undefined
    const voice = input.voice ?? defaultVoice
    if (!voice)
      throw createBadRequestError('azure voice is required when adapterParams.defaultVoice is not configured', 'BAD_REQUEST')
    if (!isMicrosoftVoiceId(voice))
      throw createBadRequestError(`azure voice id contains unsupported characters: ${voice}`, 'BAD_REQUEST', { voice })
    const outputFormat = resolveMicrosoftOutputFormat(input.responseFormat)
    const disableSsml = input.extraOptions?.disableSsml === true

    const ssml = disableSsml
      ? input.text
      : buildAzureSsml(input.text, voice, input.speed, {
          pitch: typeof input.extraOptions?.pitch === 'number' ? input.extraOptions.pitch : undefined,
          volume: typeof input.extraOptions?.volume === 'number' ? input.extraOptions.volume : undefined,
        })

    const region = ctx.adapterParams?.region
    if (typeof region !== 'string' || !region)
      throw createInternalError('azure tts upstream is missing adapterParams.region')

    return sendSpeechViaUnSpeech({
      ctx,
      model: 'microsoft/v1',
      input: ssml,
      voice,
      responseFormat: outputFormat,
      extraBody: { region, disable_ssml: true },
      fallbackContentType: inferMicrosoftContentType(outputFormat),
      providerLabel: 'azure',
    })
  },

  async getVoiceCatalog(ctx: TtsVoiceCatalogContext): Promise<Voice[]> {
    // Azure has no static catalog. Voices live at Microsoft's `voices/list`
    // REST endpoint, which we reach via the unspeech `microsoft` backend
    // because unspeech already maps the proprietary response shape to
    // `types.Voice` (full formats table, masterpiece preview URLs, locale
    // metadata). Calling unspeech also keeps a single integration point for
    // every other provider that could grow this way later.
    if (!ctx.region)
      throw createServiceUnavailableError('azure tts region not configured', 'AZURE_TTS_NOT_CONFIGURED')
    if (!ctx.keyPlaintext)
      throw createServiceUnavailableError('azure tts key not configured', 'AZURE_TTS_NOT_CONFIGURED')

    return listVoicesViaUnSpeech({
      ctx,
      query: `provider=microsoft&region=${encodeURIComponent(ctx.region)}`,
      providerLabel: 'azure',
    })
  },
}

/**
 * Builds Azure-compatible SSML, preserving Voice Pack prosody settings.
 *
 * NOTICE:
 * `unspeech` owns the canonical Microsoft helpers, but the currently consumed
 * helper surface only lets AIRI pass speed. Voice Pack pitch and volume must be
 * encoded before the request reaches unspeech because AIRI sends pre-built SSML
 * with `disable_ssml: true`.
 * Source/context: this adapter's `extraOptions.pitch` and `extraOptions.volume`
 * contract, covered by `azureAdapter.send` tests.
 * Removal condition: delete this helper once `unspeech` exposes a
 * `buildMicrosoftSsml` overload that accepts pitch and volume.
 */
function buildAzureSsml(
  text: string,
  voice: string,
  speed: number | undefined,
  options: {
    pitch?: number
    volume?: number
  },
): string {
  const safe = escapeForSsml(text)
  const rate = speedToProsodyRate(speed)
  const pitch = percentToProsodyValue(options.pitch)
  const volume = percentToProsodyValue(options.volume)
  const prosodyAttrs = [
    rate ? `rate='${rate}'` : undefined,
    pitch ? `pitch='${pitch}'` : undefined,
    volume ? `volume='${volume}'` : undefined,
  ].filter(Boolean).join(' ')
  const inner = prosodyAttrs
    ? `<prosody ${prosodyAttrs}>${safe}</prosody>`
    : safe

  return `<speak version='1.0' xml:lang='en-US'><voice name='${voice}'>${inner}</voice></speak>`
}

function speedToProsodyRate(speed: number | undefined): string {
  if (speed == null || speed === 1)
    return ''
  const delta = Math.round((speed - 1) * 100)
  if (delta === 0)
    return ''
  return delta > 0 ? `+${delta}%` : `${delta}%`
}

function percentToProsodyValue(value: number | undefined): string {
  if (value == null)
    return ''
  if (value > 0)
    return `+${value}%`
  if (value < 0)
    return `${value}%`
  return '0%'
}

function escapeForSsml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;')
}
