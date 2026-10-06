import type { SpeechProvider } from '@xsai-ext/providers/utils'
import type { GenerateSpeechOptions } from '@xsai/generate-speech'

import type { ProviderInstance } from './types'

import { generateSpeech } from '@xsai/generate-speech'

/** One batch speech request. The provider owns the wire protocol. */
export interface SpeechExecutionInput {
  model: string
  text: string
  voice: string
  speed?: number
  /** Provider-defined format name. Providers accept formats beyond the OpenAI list. */
  responseFormat?: string
  /** Provider-specific options. The provider definition documents the accepted fields. */
  providerOptions?: object
  abortSignal?: AbortSignal
  /** Used when the provider has no transport of its own. A provider transport takes precedence. */
  fetch?: typeof fetch
}

/** The provider answered with a non-2xx status. The host decides whether to retry. */
export class SpeechUpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly headers: Headers,
    readonly body: string,
    options?: ErrorOptions,
  ) {
    super(`Speech provider responded with ${status}`, options)
    this.name = 'SpeechUpstreamError'
  }
}

/** The audio bytes and the media type that the provider response declared. */
export interface SpeechExecutionResult {
  contentType: string | undefined
  body: ArrayBuffer
}

/**
 * Runs one batch speech request on a provider instance in Browser and Node.js.
 *
 * Use when:
 * - A host created a provider from its definition and needs the audio bytes.
 *
 * Expects:
 * - The caller owns provider selection, credentials, retries, and billing.
 *
 * Returns:
 * - The audio bytes and the response media type, when the provider declares one.
 *
 * @throws {SpeechUpstreamError} When the provider answers with a non-2xx status.
 * @throws {Error} When the instance cannot synthesize speech.
 */
export async function executeSpeech(provider: ProviderInstance, input: SpeechExecutionInput): Promise<SpeechExecutionResult> {
  if (!('speech' in provider) || typeof provider.speech !== 'function')
    throw new Error('This provider instance does not support speech synthesis.')

  // NOTICE:
  // `ProviderInstance` types the extra options of every speech provider as `undefined`.
  // Each SDK provider declares its own option type, so the union cannot accept one shared type.
  // Source: `SpeechProviderWithExtraOptions` in @xsai-ext/providers.
  // Remove when AIRI defines its own speech provider contract with typed provider options.
  const speech = provider.speech as (model: string, options?: object) => ReturnType<SpeechProvider['speech']>
  const request = speech(input.model, input.providerOptions)
  const providerFetch = request.fetch ?? input.fetch ?? globalThis.fetch
  let contentType: string | undefined
  let failure: Response | undefined

  const generated = generateSpeech({
    ...request,
    abortSignal: input.abortSignal,
    fetch: async (url: URL, init: RequestInit) => {
      const response = await providerFetch(url, init)
      contentType = response.headers.get('content-type') ?? undefined
      if (!response.ok)
        failure = response.clone()
      return response
    },
    input: input.text,
    // NOTICE:
    // xsAI narrows `responseFormat` to the OpenAI list, but it sends any string unchanged.
    // Source: generateSpeech in @xsai/generate-speech.
    // Remove when xsAI types the format as an open string.
    responseFormat: input.responseFormat as GenerateSpeechOptions['responseFormat'],
    speed: input.speed,
    voice: input.voice,
  })

  try {
    const body = await generated
    return { contentType, body }
  }
  catch (error) {
    if (failure === undefined)
      throw error
    throw new SpeechUpstreamError(failure.status, failure.headers, await failure.text(), { cause: error })
  }
}
