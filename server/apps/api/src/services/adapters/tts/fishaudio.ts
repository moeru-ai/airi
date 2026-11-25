import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult, TtsVoiceCatalogContext } from './types'

import { createBadRequestError } from '@proj-airi/http-shared'
import { boolean, integer, maxValue, minLength, minValue, number, object, optional, picklist, pipe, safeParse, string, trim } from 'valibot'

import { audioMimeFromFormat } from './audio-format'
import { listVoicesViaUnSpeech, sendSpeechViaUnSpeech } from './unspeech'

/** `s1` retires on 2026-12-31, so the adapter names the model on every request. */
const FISHAUDIO_DEFAULT_MODEL = 's2.1-pro'
/** Fish Audio `latency`. `balanced` gave a first byte in about 280 ms from Singapore on 2026-11-22. */
const FISHAUDIO_DEFAULT_LATENCY = 'balanced'
const FISHAUDIO_DEFAULT_FORMAT = 'mp3'

const optionalText = optional(pipe(string(), trim(), minLength(1)))

/**
 * `tts.upstreams[i].adapterParams` of a `fishaudio` model.
 *
 * - `model`: Fish Audio model, sent in the `model` header by unspeech.
 * - `defaultVoice`: voice model id (`reference_id`) when the request has no voice.
 * - `latency`: `low`, `balanced`, or `normal`. `normal` has the best quality and the slowest first byte.
 * - `voiceLanguage` and `voiceSelf`: filters for the voice catalog.
 */
const fishAudioAdapterParamsSchema = object({
  model: optionalText,
  defaultVoice: optionalText,
  responseFormat: optional(picklist(['mp3', 'wav', 'pcm', 'opus'])),
  latency: optional(picklist(['low', 'balanced', 'normal'])),
  sampleRate: optional(pipe(number(), integer(), minValue(8000), maxValue(48000))),
  mp3Bitrate: optional(picklist([64, 128, 192])),
  chunkLength: optional(pipe(number(), integer(), minValue(100), maxValue(300))),
  normalize: optional(boolean()),
  temperature: optional(pipe(number(), minValue(0), maxValue(1))),
  topP: optional(pipe(number(), minValue(0), maxValue(1))),
  voiceLanguage: optionalText,
  voiceSelf: optional(boolean()),
})

function readAdapterParams(adapterParams: Record<string, unknown>) {
  const parsed = safeParse(fishAudioAdapterParamsSchema, adapterParams)
  if (!parsed.success) {
    throw createBadRequestError(
      `fishaudio adapterParams invalid: ${parsed.issues.map(issue => issue.message).join('; ')}`,
      'BAD_REQUEST',
    )
  }
  return parsed.output
}

/**
 * Builds the unspeech `extra_body` for Fish Audio.
 *
 * @example
 * fishAudioExtraBody({ latency: 'low' })
 * // => { latency: 'low' }
 */
function fishAudioExtraBody(params: ReturnType<typeof readAdapterParams>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    latency: params.latency ?? FISHAUDIO_DEFAULT_LATENCY,
  }
  if (params.sampleRate != null)
    body.sample_rate = params.sampleRate
  if (params.mp3Bitrate != null)
    body.mp3_bitrate = params.mp3Bitrate
  if (params.chunkLength != null)
    body.chunk_length = params.chunkLength
  if (params.normalize != null)
    body.normalize = params.normalize
  if (params.temperature != null)
    body.temperature = params.temperature
  if (params.topP != null)
    body.top_p = params.topP
  return body
}

/**
 * Fish Audio TTS adapter.
 *
 * Use when:
 * - Routing speech synthesis to Fish Audio through unspeech's `fishaudio/*` backend.
 *
 * Expects:
 * - `ctx.unspeechBaseURL` points at an unspeech deployment with the Fish Audio backend.
 * - `ctx.keyPlaintext` is the Fish Audio API key.
 * - The request voice, or `adapterParams.defaultVoice`, is a Fish Audio voice model id.
 *
 * Returns:
 * - {@link TtsResult} with the upstream audio body and content type.
 */
export const fishAudioAdapter: TtsAdapter = {
  id: 'fishaudio',

  async send(input: TtsInput, ctx: TtsAdapterContext): Promise<TtsResult> {
    const params = readAdapterParams(ctx.adapterParams)
    const voice = input.voice ?? params.defaultVoice
    if (!voice)
      throw createBadRequestError('fishaudio requires a voice or adapterParams.defaultVoice', 'BAD_REQUEST')

    const responseFormat = input.responseFormat ?? params.responseFormat ?? FISHAUDIO_DEFAULT_FORMAT

    return sendSpeechViaUnSpeech({
      ctx,
      model: `fishaudio/${params.model ?? FISHAUDIO_DEFAULT_MODEL}`,
      input: input.text,
      voice,
      speed: input.speed,
      responseFormat,
      extraBody: fishAudioExtraBody(params),
      fallbackContentType: audioMimeFromFormat(responseFormat),
      providerLabel: 'fishaudio',
    })
  },

  async getVoiceCatalog(ctx: TtsVoiceCatalogContext): Promise<Voice[]> {
    const params = readAdapterParams(ctx.adapterParams)
    const query = new URLSearchParams({ provider: 'fishaudio' })
    if (params.voiceLanguage)
      query.set('language', params.voiceLanguage)
    if (params.voiceSelf)
      query.set('self', 'true')

    return listVoicesViaUnSpeech({
      ctx,
      query: query.toString(),
      providerLabel: 'fishaudio',
    })
  },
}
