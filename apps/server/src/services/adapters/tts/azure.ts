import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult, TtsVoiceCatalogContext } from './types'

import { buildMicrosoftSsml, inferMicrosoftContentType, isMicrosoftVoiceId, resolveMicrosoftOutputFormat } from 'unspeech'

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
      : buildMicrosoftSsml(input.text, voice, input.speed)

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
