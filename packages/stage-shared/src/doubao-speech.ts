import type { InferOutput } from 'valibot'

import { defineInvokeEventa } from '@moeru/eventa'
import {
  check,
  finite,
  integer,
  maxLength,
  maxValue,
  minLength,
  minValue,
  number,
  optional,
  picklist,
  pipe,
  safeParse,
  strictObject,
  string,
  trim,
  union,
} from 'valibot'

const speechFormatSchema = picklist(['mp3', 'pcm', 'ogg_opus', 'wav'])
const resourceIdSchema = picklist(['seed-tts-2.0', 'seed-icl-2.0'])
const sampleRateSchema = picklist([8000, 16000, 22050, 24000, 32000, 44100, 48000])
/** The only upstream address that the desktop IPC boundary accepts. */
export const DOUBAO_SPEECH_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection'
const languageSchema = picklist([
  '',
  'zh-cn',
  'en',
  'ja',
  'es-mx',
  'id',
  'pt-br',
  'pt',
  'ko',
  'it',
  'de',
  'fr',
  'th',
  'vi',
  'ru',
  'fil',
  'ms',
  'ar',
  'pl',
  'tr',
  'sv',
])
const dialectSchema = picklist(['', 'beijing', 'dongbei', 'henan', 'shaanxi', 'shanghai', 'sichuan', 'tianjin', 'yue'])

/** Validates credentials and native StartSession settings before main-process network access. */
export const DoubaoSpeechSessionConfigSchema = pipe(strictObject({
  apiKey: pipe(string(), trim(), minLength(1), maxLength(4096)),
  baseUrl: picklist([DOUBAO_SPEECH_ENDPOINT]),
  resourceId: resourceIdSchema,
  speaker: pipe(string(), trim(), minLength(1), maxLength(512)),
  audio: strictObject({
    format: speechFormatSchema,
    sampleRate: sampleRateSchema,
    speechRate: pipe(number(), finite(), integer(), minValue(-50), maxValue(100)),
    loudnessRate: pipe(number(), finite(), integer(), minValue(-50), maxValue(100)),
    pitch: pipe(number(), finite(), integer(), minValue(-12), maxValue(12)),
  }),
  explicitLanguage: optional(languageSchema),
  explicitDialect: optional(dialectSchema),
  voiceInstruction: optional(pipe(string(), trim(), maxLength(2048))),
}), check(
  config => config.audio.format !== 'ogg_opus' || config.audio.sampleRate === 48000,
  'The ogg_opus format requires a 48000 Hz sample rate.',
))

export type DoubaoSpeechSessionConfig = InferOutput<typeof DoubaoSpeechSessionConfigSchema>

/** Validates the ordered request messages in one renderer-owned synthesis session. */
export const DoubaoSpeechRequestSchema = union([
  strictObject({
    type: picklist(['start']),
    config: DoubaoSpeechSessionConfigSchema,
  }),
  strictObject({
    type: picklist(['text']),
    text: pipe(string(), maxLength(10000)),
  }),
  strictObject({ type: picklist(['finish']) }),
  strictObject({ type: picklist(['cancel']) }),
])

export type DoubaoSpeechRequest = InferOutput<typeof DoubaoSpeechRequestSchema>

/** Audio and lifecycle messages returned to the renderer for one session. */
export type DoubaoSpeechResponse
  = | { type: 'audio', data: Uint8Array }
    | { type: 'control', event: 'session.started' | 'sentence.start' | 'sentence.end' | 'subtitle' | 'session.finished', payload?: Record<string, unknown> }

/** Bidirectional Electron contract for one authenticated Doubao synthesis session. */
export const doubaoSpeechStream = defineInvokeEventa<DoubaoSpeechResponse, DoubaoSpeechRequest>(
  'eventa:invoke:electron:doubao-speech:stream',
)

/** Validates one renderer-to-main request chunk at the Electron boundary. */
export function parseDoubaoSpeechRequest(value: unknown) {
  const result = safeParse(DoubaoSpeechRequestSchema, value)
  if (!result.success)
    throw new TypeError('Invalid Doubao speech stream request.')
  return result.output
}
