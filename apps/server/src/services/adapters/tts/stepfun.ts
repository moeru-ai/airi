import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult, TtsVoiceCatalogContext } from './types'

import { isPlainObject } from 'es-toolkit'

import { audioMimeFromFormat } from './audio-format'
import { listVoicesViaUnSpeech, sendSpeechViaUnSpeech } from './unspeech'

const STEPFUN_DEFAULT_MODEL = 'stepaudio-2.5-tts'
const STEPFUN_DEFAULT_FORMAT = 'mp3'
const STEPFUN_DEFAULT_VOICE = 'cixingnansheng'

/**
 * StepFun TTS adapter.
 *
 * Use when:
 * - Routing hosted speech synthesis to StepFun through unspeech's
 *   OpenAI-compatible `stepfun/*` backend.
 *
 * Expects:
 * - `ctx.unspeechBaseURL` points at an unspeech deployment that includes the
 *   StepFun backend.
 * - `ctx.keyPlaintext` is the StepFun API key.
 * - `ctx.adapterParams.model` optionally selects `stepaudio-2.5-tts`,
 *   `step-tts-2`, or `step-tts-mini`.
 *
 * Returns:
 * - {@link TtsResult} with the upstream audio body and content type.
 */
export const stepfunAdapter: TtsAdapter = {
  id: 'stepfun',

  async send(input: TtsInput, ctx: TtsAdapterContext): Promise<TtsResult> {
    const model = typeof ctx.adapterParams.model === 'string' && ctx.adapterParams.model
      ? ctx.adapterParams.model
      : STEPFUN_DEFAULT_MODEL
    const voice = input.voice ?? (typeof ctx.adapterParams.defaultVoice === 'string' && ctx.adapterParams.defaultVoice
      ? ctx.adapterParams.defaultVoice
      : STEPFUN_DEFAULT_VOICE)
    const responseFormat = input.responseFormat ?? (typeof ctx.adapterParams.responseFormat === 'string' && ctx.adapterParams.responseFormat
      ? ctx.adapterParams.responseFormat
      : STEPFUN_DEFAULT_FORMAT)

    return sendSpeechViaUnSpeech({
      ctx,
      model: `stepfun/${model}`,
      input: input.text,
      voice,
      speed: input.speed,
      responseFormat,
      extraBody: buildExtraBody(input, ctx),
      fallbackContentType: audioMimeFromFormat(responseFormat),
      providerLabel: 'stepfun',
    })
  },

  async getVoiceCatalog(ctx: TtsVoiceCatalogContext): Promise<Voice[]> {
    return listVoicesViaUnSpeech({
      ctx,
      query: 'provider=stepfun',
      providerLabel: 'stepfun',
    })
  },
}

function buildExtraBody(input: TtsInput, ctx: TtsAdapterContext): Record<string, unknown> {
  const extraOptions = input.extraOptions ?? {}
  const body: Record<string, unknown> = {}

  if (typeof extraOptions.volume === 'number' && Number.isFinite(extraOptions.volume))
    body.volume = extraOptions.volume
  else if (typeof ctx.adapterParams.volume === 'number' && Number.isFinite(ctx.adapterParams.volume))
    body.volume = ctx.adapterParams.volume

  if (typeof extraOptions.sample_rate === 'number' && Number.isFinite(extraOptions.sample_rate))
    body.sample_rate = extraOptions.sample_rate
  else if (typeof extraOptions.sampleRate === 'number' && Number.isFinite(extraOptions.sampleRate))
    body.sample_rate = extraOptions.sampleRate
  else if (typeof ctx.adapterParams.sampleRate === 'number' && Number.isFinite(ctx.adapterParams.sampleRate))
    body.sample_rate = ctx.adapterParams.sampleRate

  if (isPlainObject(extraOptions.pronunciation_map))
    body.pronunciation_map = extraOptions.pronunciation_map
  else if (isPlainObject(extraOptions.pronunciationMap))
    body.pronunciation_map = extraOptions.pronunciationMap

  if (typeof extraOptions.markdown_filter === 'boolean')
    body.markdown_filter = extraOptions.markdown_filter
  else if (typeof extraOptions.markdownFilter === 'boolean')
    body.markdown_filter = extraOptions.markdownFilter

  if (typeof extraOptions.instruction === 'string' && extraOptions.instruction)
    body.instruction = extraOptions.instruction
  else if (typeof ctx.adapterParams.instruction === 'string' && ctx.adapterParams.instruction)
    body.instruction = ctx.adapterParams.instruction

  if (isPlainObject(extraOptions.voice_label))
    body.voice_label = extraOptions.voice_label
  else if (isPlainObject(extraOptions.voiceLabel))
    body.voice_label = extraOptions.voiceLabel

  return body
}
