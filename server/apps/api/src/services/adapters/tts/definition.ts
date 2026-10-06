import type { ProviderDefinition } from '@proj-airi/provider-inference'

import type { TtsAdapterContext, TtsResult } from './types'

import { errorMessageFrom } from '@moeru/std'
import { executeSpeech, SpeechUpstreamError } from '@proj-airi/provider-inference'

import { createInternalError } from '../../../utils/error'
import { audioMimeFromFormat } from './audio-format'
import { TtsUpstreamResponseError } from './types'

interface DefinitionSpeechRequest {
  /** Names the provider in error messages. */
  label: string
  /** The shared definition. Its config is `{ apiKey, baseUrl }` for an unspeech instance. */
  definition: ProviderDefinition<{ apiKey: string, baseUrl?: string }>
  ctx: TtsAdapterContext
  model: string
  voice: string
  text: string
  speed?: number
  responseFormat: string
  providerOptions?: object
}

/**
 * Runs one TTS attempt through a shared provider definition.
 *
 * Use when:
 * - A TTS adapter has applied its provider policy and needs the provider protocol to run.
 *
 * Expects:
 * - `ctx.unspeechBaseURL` is the unspeech instance and `ctx.keyPlaintext` is the provider key.
 * - The adapter owns defaults, request validation, and the voice catalog.
 *
 * Returns:
 * - {@link TtsResult} with the provider audio and its media type.
 */
export async function sendViaDefinition(request: DefinitionSpeechRequest): Promise<TtsResult> {
  const { ctx, label } = request

  try {
    const provider = await request.definition.createProvider({
      apiKey: ctx.keyPlaintext.toString('utf8'),
      baseUrl: `${ctx.unspeechBaseURL.replace(/\/+$/, '')}/v1/`,
    })
    const result = await executeSpeech(provider, {
      model: request.model,
      text: request.text,
      voice: request.voice,
      speed: request.speed,
      responseFormat: request.responseFormat,
      providerOptions: request.providerOptions,
      abortSignal: ctx.abortSignal,
      fetch: ctx.fetchImpl,
    })
    return { contentType: result.contentType ?? audioMimeFromFormat(request.responseFormat), body: result.body }
  }
  catch (error) {
    // The router applies `onTimeout` separately from HTTP fallback, so keep the abort identity.
    if (ctx.abortSignal?.aborted)
      throw error

    if (error instanceof SpeechUpstreamError)
      throw new TtsUpstreamResponseError(new Response(error.body, { status: error.status, headers: error.headers }))

    throw createInternalError(`${label} tts fetch failed: ${errorMessageFrom(error) ?? 'unknown'}`)
  }
}
