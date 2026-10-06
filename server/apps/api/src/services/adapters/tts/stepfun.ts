import type { StepfunSpeechOptions } from '@proj-airi/provider-inference'
import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult, TtsVoiceCatalogContext } from './types'

import { providerStepfunSpeech } from '@proj-airi/provider-inference'
import { isPlainObject } from 'es-toolkit'

import { sendViaDefinition } from './definition'
import { listVoicesViaUnSpeech } from './unspeech'

const STEPFUN_DEFAULT_MODEL = 'stepaudio-2.5-tts'
const STEPFUN_DEFAULT_FORMAT = 'mp3'
const STEPFUN_DEFAULT_VOICE = 'cixingnansheng'

/**
 * StepFun TTS adapter.
 *
 * Use when:
 * - Routing speech synthesis to StepFun through unspeech's OpenAI-compatible
 *   `stepfun/*` backend.
 *
 * Expects:
 * - `ctx.unspeechBaseURL` points at an unspeech deployment that includes the
 *   StepFun backend.
 * - `ctx.keyPlaintext` is the StepFun API key.
 * - `ctx.adapterParams.model` optionally selects `stepaudio-2.5-tts`,
 *   `step-tts-2`, or `step-tts-mini`.
 * - `ctx.adapterParams.endpointProfile` optionally selects a provider-owned
 *   endpoint profile such as `step-plan`; AIRI never owns the endpoint URL.
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

    return sendViaDefinition({
      label: 'stepfun',
      definition: providerStepfunSpeech,
      ctx,
      model,
      text: input.text,
      voice,
      speed: input.speed,
      responseFormat,
      providerOptions: buildSpeechOptions(input, ctx),
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

function buildSpeechOptions(input: TtsInput, ctx: TtsAdapterContext): StepfunSpeechOptions {
  const extraOptions = input.extraOptions ?? {}
  const options: StepfunSpeechOptions = {}

  if (typeof ctx.adapterParams.endpointProfile === 'string' && ctx.adapterParams.endpointProfile)
    options.endpointProfile = ctx.adapterParams.endpointProfile

  if (typeof extraOptions.volume === 'number' && Number.isFinite(extraOptions.volume))
    options.volume = extraOptions.volume
  else if (typeof ctx.adapterParams.volume === 'number' && Number.isFinite(ctx.adapterParams.volume))
    options.volume = ctx.adapterParams.volume

  if (typeof extraOptions.sample_rate === 'number' && Number.isFinite(extraOptions.sample_rate))
    options.sampleRate = extraOptions.sample_rate
  else if (typeof extraOptions.sampleRate === 'number' && Number.isFinite(extraOptions.sampleRate))
    options.sampleRate = extraOptions.sampleRate
  else if (typeof ctx.adapterParams.sampleRate === 'number' && Number.isFinite(ctx.adapterParams.sampleRate))
    options.sampleRate = ctx.adapterParams.sampleRate

  if (isPlainObject(extraOptions.pronunciation_map))
    options.pronunciationMap = extraOptions.pronunciation_map as StepfunSpeechOptions['pronunciationMap']
  else if (isPlainObject(extraOptions.pronunciationMap))
    options.pronunciationMap = extraOptions.pronunciationMap as StepfunSpeechOptions['pronunciationMap']

  if (typeof extraOptions.markdown_filter === 'boolean')
    options.markdownFilter = extraOptions.markdown_filter
  else if (typeof extraOptions.markdownFilter === 'boolean')
    options.markdownFilter = extraOptions.markdownFilter

  if (typeof extraOptions.instruction === 'string' && extraOptions.instruction)
    options.instruction = extraOptions.instruction
  else if (typeof ctx.adapterParams.instruction === 'string' && ctx.adapterParams.instruction)
    options.instruction = ctx.adapterParams.instruction

  if (isPlainObject(extraOptions.voice_label))
    options.voiceLabel = extraOptions.voice_label as StepfunSpeechOptions['voiceLabel']
  else if (isPlainObject(extraOptions.voiceLabel))
    options.voiceLabel = extraOptions.voiceLabel as StepfunSpeechOptions['voiceLabel']

  return options
}
