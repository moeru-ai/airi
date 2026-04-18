import type { Buffer } from 'node:buffer'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { createOpenAI } from '@xsai-ext/providers/create'
import { generateTranscription } from '@xsai/generate-transcription'

const log = useLogg('STT:OpenAI').useGlobalConfig()

export interface OpenAITranscribeOptions {
  /**
   * Base URL of an OpenAI-compatible transcription provider, e.g.
   * `https://api.openai.com/v1/` or `http://localhost:8090/v1/`.
   */
  baseUrl: string
  /**
   * API key for the provider. Local servers may accept any non-empty string.
   */
  apiKey: string
  /**
   * Model name to use for transcription, e.g. `whisper-1`.
   */
  model: string
}

/**
 * Sends a WAV buffer to an OpenAI-compatible transcription provider and returns
 * the recognised text (empty string on error or empty transcription).
 *
 * Use when:
 * - Converting short voice segments captured from Discord into text that can be
 *   forwarded to the AIRI pipeline as `input:text` / `input:text:voice`.
 *
 * Expects:
 * - `wavBuffer` is a valid `audio/wav` payload.
 *
 * Returns:
 * - The recognised transcription string, or `''` if transcription failed.
 */
export async function openaiTranscribe(
  wavBuffer: Buffer,
  options: OpenAITranscribeOptions,
): Promise<string> {
  log.withField('bytes', wavBuffer.length).log('Transcribing audio')

  const wavFile = new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' })
  const openai = createOpenAI(options.apiKey, options.baseUrl)

  try {
    const result = await generateTranscription({
      ...openai.transcription(options.model),
      file: wavFile,
    })

    log.withField('result', result.text).log('Transcription result')
    return result.text ?? ''
  }
  catch (error) {
    log
      .withError(error)
      .withField('message', errorMessageFrom(error) ?? 'unknown error')
      .error('Failed to transcribe audio')
    return ''
  }
}

/**
 * Returns true iff a transcription string looks like real speech (non-empty and
 * not a well-known "no speech" marker emitted by Whisper-style models).
 */
export function isUsefulTranscription(text: string): boolean {
  if (!text)
    return false
  if (text.includes('[BLANK_AUDIO]'))
    return false
  if (!text.trim())
    return false
  return true
}
