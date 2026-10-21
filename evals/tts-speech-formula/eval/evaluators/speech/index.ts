import type { TaskCacheRuntime } from 'vieval/core/runner'

import type { Language } from '../../cases/formula-speech/languages'
import type { OpenAISpeechModelRuntimeConfig, TranscriptionRequestOptions } from './speech-models'

import { Buffer } from 'node:buffer'

import { generateSpeech } from '@xsai/generate-speech'
import { generateTranscription } from '@xsai/generate-transcription'

import { voiceLanguage } from '../../cases/formula-speech/languages'
import { cacheKey } from '../../shared/cache-key'
import { voiceFor } from './speech-models'

export * from './speech-models'

/** One synthesized clip, kept in the vieval cache so that a rerun reuses it. */
export interface SpeechClip {
  /** Cache file of the mp3. Reports copy it as the case artifact. */
  path: string
  bytes: Buffer
  /** True when the clip came from the cache, so this run sent no TTS request for it. */
  cached: boolean
}

/** One transcript of a clip. */
export interface Transcript {
  text: string
  /** True when the transcript came from the cache, so this run sent no ASR request for it. */
  cached: boolean
}

/**
 * Synthesizes the spoken text with the TTS model that the `tts` axis selected.
 * The clip is cached by endpoint, model, voice, and text. A model that takes the language also gets the BCP 47 tag of the
 * case language, and the tag is part of its cache key, so a clip that was read without a language is not reused.
 */
export async function synthesize(speech: OpenAISpeechModelRuntimeConfig, text: string, language: Language, cache: TaskCacheRuntime, signal: AbortSignal): Promise<SpeechClip> {
  const voice = voiceFor(speech, language)
  if (!voice)
    throw new Error(`TTS model ${speech.model} has no voice for ${language}.`)

  const tag = speech.sendsLanguage ? voiceLanguage[language] : undefined
  const keyParts = tag ? [speech.baseURL, voice, text, tag] : [speech.baseURL, voice, text]
  const file = cache.namespace('speech').file({ ext: 'mp3', key: [speech.model, cacheKey(...keyParts)] })
  if (await file.exists())
    return { path: file.path, bytes: await file.readBuffer(), cached: true }

  const audio = await generateSpeech({
    abortSignal: signal,
    apiKey: speech.apiKey,
    baseURL: speech.baseURL,
    input: text,
    model: speech.model,
    responseFormat: 'mp3',
    voice,
    ...(tag ? { extraBody: { language: tag } } : {}),
  })
  const bytes = Buffer.from(audio)
  await file.writeBuffer(bytes)
  return { path: file.path, bytes, cached: false }
}

/**
 * Transcribes a clip with the ASR model that the `asr` axis selected.
 * `modelId` is the registered model id, because an executor model has no endpoint that tells two models apart.
 * The transcript is cached by model id, language, and audio content.
 */
export async function transcribe(transcription: TranscriptionRequestOptions, modelId: string, clip: SpeechClip, language: Language, cache: TaskCacheRuntime, signal: AbortSignal): Promise<Transcript> {
  const file = cache.namespace('transcription').file({ ext: 'json', key: [modelId, cacheKey(language, clip.bytes.toString('base64'))] })
  if (await file.exists())
    return { text: (await file.readJson<{ text: string }>()).text, cached: true }

  const { text } = await generateTranscription({
    ...transcription,
    abortSignal: signal,
    file: new Blob([new Uint8Array(clip.bytes)], { type: 'audio/mpeg' }),
    fileName: 'speech.mp3',
    language,
    // A transcript of the same clip must not change between runs.
    temperature: '0',
  })
  const transcript = text.replace(/\s*\n\s*/g, ' ').trim()
  await file.writeJson({ text: transcript })
  return { text: transcript, cached: false }
}
