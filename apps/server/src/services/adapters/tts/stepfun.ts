import type { Voice } from 'unspeech'

import type { TtsAdapter, TtsAdapterContext, TtsInput, TtsResult, TtsVoiceCatalogContext } from './types'

import { errorMessageFrom } from '@moeru/std'
import { isPlainObject } from 'es-toolkit'

import { createInternalError } from '../../../utils/error'
import { audioMimeFromFormat } from './audio-format'
import { sendSpeechViaUnSpeech } from './unspeech'

const STEPFUN_DEFAULT_MODEL = 'stepaudio-2.5-tts'
const STEPFUN_TTS_2_MODEL = 'step-tts-2'
const STEPFUN_TTS_MINI_MODEL = 'step-tts-mini'
const STEPFUN_DEFAULT_FORMAT = 'mp3'
const STEPFUN_DEFAULT_VOICE = 'cixingnansheng'
const STEPFUN_STEP_PLAN_SPEECH_URL = 'https://api.stepfun.com/step_plan/v1/audio/speech'

const STEPFUN_LANGUAGES = [
  { code: 'zh-CN', title: 'Chinese' },
  { code: 'en', title: 'English' },
  { code: 'ja', title: 'Japanese' },
]

const STEPFUN_FORMATS = [
  { name: 'MP3', extension: '.mp3', mime_type: 'audio/mpeg', sample_rate: 24000, bitrate: 0, format_code: 'mp3' },
  { name: 'WAV', extension: '.wav', mime_type: 'audio/wav', sample_rate: 24000, bitrate: 0, format_code: 'wav' },
  { name: 'FLAC', extension: '.flac', mime_type: 'audio/flac', sample_rate: 24000, bitrate: 0, format_code: 'flac' },
  { name: 'Opus', extension: '.opus', mime_type: 'audio/opus', sample_rate: 24000, bitrate: 0, format_code: 'opus' },
  { name: 'PCM', extension: '.pcm', mime_type: 'audio/L16', sample_rate: 24000, bitrate: 0, format_code: 'pcm' },
]

const ALL_STEPFUN_TTS_MODELS = [STEPFUN_DEFAULT_MODEL, STEPFUN_TTS_2_MODEL, STEPFUN_TTS_MINI_MODEL]
const STEP_AUDIO_25_AND_TTS_2 = [STEPFUN_DEFAULT_MODEL, STEPFUN_TTS_2_MODEL]

// NOTICE:
// Plan-only deployments cannot rely on unspeech for voice discovery. Keep this
// catalog aligned with StepFun's official voice guide and unspeech's embedded
// StepFun catalog.
// Source/context:
// `https://platform.stepfun.com/docs/zh/guides/developer/tts`
// `https://github.com/moeru-ai/unspeech/blob/main/pkg/backend/stepfun/voices.go`
// Removal condition: StepFun exposes an authenticated official-voice listing
// endpoint for both ordinary API and Step Plan transports.
const STEPFUN_VOICE_CATALOG: Voice[] = ([
  ['vibrant-youth', 'Vibrant Youth', STEP_AUDIO_25_AND_TTS_2, '有声书、视频配音'],
  ['lively-girl', 'Lively Girl', STEP_AUDIO_25_AND_TTS_2, '有声书、视频配音'],
  ['soft-spoken-gentleman', 'Soft-spoken Gentleman', STEP_AUDIO_25_AND_TTS_2, '情感陪伴、有声书'],
  ['magnetic-voiced-male', 'Magnetic-voiced Male', STEP_AUDIO_25_AND_TTS_2, '有声书、视频配音'],
  ['zixinnansheng', '自信男声', STEP_AUDIO_25_AND_TTS_2, '有声书、情感陪伴、教育与培训、营销'],
  ['elegantgentle-female', '气质温婉', ALL_STEPFUN_TTS_MODELS, '客服与业务办理、口播（解说、新闻）、教育与培训、情感陪伴'],
  ['livelybreezy-female', '活力轻快', ALL_STEPFUN_TTS_MODELS, '情感陪伴、客服与业务办理、教育与培训、营销'],
  ['wenrounansheng', '温柔男声', ALL_STEPFUN_TTS_MODELS, '口播（解说、新闻）、情感陪伴、客服与业务办理、教育与培训'],
  ['wenrougongzi', '温柔公子', ALL_STEPFUN_TTS_MODELS, '情感陪伴、有声书'],
  ['yuanqinansheng', '元气男声', ALL_STEPFUN_TTS_MODELS, '有声书、口播（解说、新闻）、客服与业务办理'],
  ['jingdiannvsheng', '经典女声', ALL_STEPFUN_TTS_MODELS, '客服与业务办理、情感陪伴'],
  ['wenroushunv', '温柔熟女', ALL_STEPFUN_TTS_MODELS, '客服与业务办理、口播（解说、新闻）、教育与培训'],
  ['tianmeinvsheng', '甜美女声', ALL_STEPFUN_TTS_MODELS, '情感陪伴、客服与业务办理'],
  ['qingchunshaonv', '清纯少女', ALL_STEPFUN_TTS_MODELS, '客服与业务办理、语音助手'],
  ['cixingnansheng', '磁性男声', ALL_STEPFUN_TTS_MODELS, '有声书、情感陪伴'],
  ['yuanqishaonv', '元气少女', ALL_STEPFUN_TTS_MODELS, '有声书、情感陪伴、语音助手'],
  ['linjiajiejie', '邻家姐姐', ALL_STEPFUN_TTS_MODELS, '口播（解说、新闻）、情感陪伴、语音助手、视频配音'],
  ['zhengpaiqingnian', '正派青年', ALL_STEPFUN_TTS_MODELS, '营销、有声书'],
  ['qingniandaxuesheng', '青年大学生', ALL_STEPFUN_TTS_MODELS, '口播（解说、新闻）'],
  ['boyinnansheng', '播音男声', ALL_STEPFUN_TTS_MODELS, '有声书、口播（解说、新闻）'],
  ['ruyananshi', '儒雅男士', ALL_STEPFUN_TTS_MODELS, '有声书、情感陪伴、口播（解说、新闻）、语音助手'],
  ['shenchennanyin', '深沉男音', ALL_STEPFUN_TTS_MODELS, '情感陪伴、有声书'],
  ['qinqienvsheng', '亲切女声', ALL_STEPFUN_TTS_MODELS, '口播（解说、新闻）'],
  ['wenrounvsheng', '温柔女声', ALL_STEPFUN_TTS_MODELS, '有声书、情感陪伴'],
  ['jilingshaonv', '机灵少女', ALL_STEPFUN_TTS_MODELS, '语音助手、口播（解说、新闻）'],
  ['ruanmengnvsheng', '软萌女声', ALL_STEPFUN_TTS_MODELS, '情感陪伴、语音助手、视频配音'],
  ['youyanvsheng', '优雅女声', ALL_STEPFUN_TTS_MODELS, '视频配音'],
  ['lengyanyujie', '冷艳御姐', ALL_STEPFUN_TTS_MODELS, '视频配音'],
  ['shuangkuaijiejie', '爽快姐姐', ALL_STEPFUN_TTS_MODELS, '口播（解说、新闻）'],
  ['wenjingxuejie', '文静学姐', ALL_STEPFUN_TTS_MODELS, '口播（解说、新闻）'],
  ['linjiameimei', '邻家妹妹', ALL_STEPFUN_TTS_MODELS, '视频配音、口播（解说、新闻）、语音助手'],
  ['zhixingjiejie', '知性姐姐', ALL_STEPFUN_TTS_MODELS, '视频配音、口播（解说、新闻）、语音助手'],
  ['shuangkuainansheng', '爽快男声', STEP_AUDIO_25_AND_TTS_2, '客服与业务办理、语音助手'],
  ['ganliannvsheng', '干练女声', STEP_AUDIO_25_AND_TTS_2, '客服与业务办理、语音助手'],
  ['qinhenvsheng', '亲和女声', STEP_AUDIO_25_AND_TTS_2, '客服与业务办理、语音助手'],
  ['huolinvsheng', '活力女声', STEP_AUDIO_25_AND_TTS_2, '客服与业务办理、语音助手'],
] as const).map(([id, name, compatibleModels, description]) => ({
  id,
  name,
  description,
  compatible_models: [...compatibleModels],
  labels: { provider: 'stepfun' },
  tags: description.split('、'),
  languages: STEPFUN_LANGUAGES,
  formats: STEPFUN_FORMATS,
}))

/**
 * StepFun TTS adapter.
 *
 * Use when:
 * - Routing pay-as-you-go speech synthesis to StepFun through unspeech's
 *   OpenAI-compatible `stepfun/*` backend.
 * - Routing subscription speech synthesis to the dedicated Step Plan endpoint.
 *
 * Expects:
 * - For pay-as-you-go requests, `ctx.unspeechBaseURL` points at an unspeech
 *   deployment that includes the StepFun backend.
 * - `ctx.keyPlaintext` is the StepFun API key.
 * - `ctx.adapterParams.model` optionally selects `stepaudio-2.5-tts`,
 *   `step-tts-2`, or `step-tts-mini`.
 *
 * Returns:
 * - {@link TtsResult} with the upstream audio body and content type.
 */
export const stepfunAdapter: TtsAdapter = {
  id: 'stepfun',
  requiresUnspeech: ctx => !usesStepPlan(ctx),
  requiresUnspeechForVoiceCatalog: false,

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

  async getVoiceCatalog(_ctx: TtsVoiceCatalogContext): Promise<Voice[]> {
    return STEPFUN_VOICE_CATALOG
  },
}

function usesStepPlan(ctx: Pick<TtsAdapterContext, 'adapterParams' | 'baseURL'>): boolean {
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
    if (ctx.abortSignal?.aborted)
      throw error
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
