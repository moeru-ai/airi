import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult, TtsVoiceCatalogContext } from './types'

import { errorMessageFrom } from '@moeru/std'
import { isPlainObject } from 'es-toolkit'

import { createInternalError } from '../../../utils/error'
import { audioMimeFromFormat } from './audio-format'
import { listVoicesViaUnSpeech, sendSpeechViaUnSpeech } from './unspeech'

const STEPFUN_DEFAULT_MODEL = 'stepaudio-2.5-tts'
const STEPFUN_DEFAULT_FORMAT = 'mp3'
const STEPFUN_DEFAULT_VOICE = 'cixingnansheng'
const STEPFUN_STEP_PLAN_SPEECH_URL = 'https://api.stepfun.com/step_plan/v1/audio/speech'

/**
 * StepFun TTS adapter.
 *
 * Use when:
 * - Routing pay-as-you-go speech synthesis to StepFun through unspeech's
 *   OpenAI-compatible `stepfun/*` backend.
 * - Routing subscription speech synthesis to the dedicated Step Plan endpoint.
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
    const extraBody = buildExtraBody(input, ctx)

    if (usesStepPlan(ctx)) {
      // NOTICE:
      // StepFun exposes Plan usage through a distinct endpoint while unspeech
      // 0.1.x always targets the ordinary API. Sending Plan credentials through
      // unspeech would therefore bypass the subscription route and consume
      // pay-as-you-go balance.
      // Source/context: `https://platform.stepfun.com/docs/zh/api-reference/audio/create-audio`.
      // Removal condition: the deployed unspeech backend supports an explicit,
      // trusted Step Plan transport mode.
      return sendSpeechToStepfun(input, ctx, model, voice, responseFormat, extraBody)
    }

    return sendSpeechViaUnSpeech({
      ctx,
      model: `stepfun/${model}`,
      input: input.text,
      voice,
      speed: input.speed,
      responseFormat,
      extraBody,
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

function usesStepPlan(ctx: TtsAdapterContext): boolean {
  if (ctx.adapterParams.apiMode === 'step-plan')
    return true
  if (ctx.adapterParams.apiMode === 'pay-as-you-go')
    return false

  return ctx.baseURL === STEPFUN_STEP_PLAN_SPEECH_URL
}

async function sendSpeechToStepfun(
  input: TtsInput,
  ctx: TtsAdapterContext,
  model: string,
  voice: string,
  responseFormat: string,
  extraBody: Record<string, unknown>,
): Promise<TtsResult> {
  let response: Response
  try {
    response = await ctx.fetchImpl(STEPFUN_STEP_PLAN_SPEECH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ctx.keyPlaintext.toString('utf8')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: input.text,
        voice,
        response_format: responseFormat,
        speed: input.speed,
        ...extraBody,
      }),
      signal: ctx.abortSignal,
    })
  }
  catch (error) {
    throw createInternalError(`stepfun tts fetch failed: ${errorMessageFrom(error) ?? 'unknown'}`)
  }

  if (!response.ok) {
    const responseBody = await response.text()
    const error = new Error(`stepfun tts upstream ${response.status}: ${responseBody.slice(0, 256)}`) as Error & { status: number }
    error.status = response.status
    throw error
  }

  return {
    contentType: response.headers.get('content-type') ?? audioMimeFromFormat(responseFormat),
    body: await response.arrayBuffer(),
  }
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
