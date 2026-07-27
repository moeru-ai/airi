import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { errorMessageFromValue } from '@proj-airi/stage-shared'

import { decodeAudioFileToMonoFloat32 } from '../../../libs/audio/decode-audio-file'
import { getWhisperAdapter } from '../../../libs/inference/adapters/whisper'
import { MODEL_NAMES } from '../../../libs/inference/constants'

export interface BrowserLocalTranscriptionExtraOptions {
  language?: string
  abortSignal?: AbortSignal
}

/**
 * In-browser Whisper transcription provider (no API key / base URL).
 *
 * Implements the OpenAI-compatible FormData transcription contract expected by
 * `@xsai/generate-transcription`, then runs inference through the local Whisper
 * worker instead of a remote endpoint.
 */
export function createBrowserLocalTranscriptionProvider(
  config: { language?: string } = {},
): TranscriptionProviderWithExtraOptions<string, BrowserLocalTranscriptionExtraOptions> {
  return {
    transcription: (model: string, extraOptions?: BrowserLocalTranscriptionExtraOptions) => {
      return {
        baseURL: 'http://browser-local-audio-transcription/v1/',
        model: model || MODEL_NAMES.WHISPER,
        fetch: async (_request: RequestInfo | URL, init?: RequestInit) => {
          try {
            const body = init?.body
            if (!(body instanceof FormData)) {
              throw new TypeError('Browser local transcription expects a FormData body with an audio file.')
            }

            const fileEntry = body.get('file')
            if (!(fileEntry instanceof Blob)) {
              throw new TypeError('Browser local transcription requires an audio file in the FormData body.')
            }

            const languageFromForm = body.get('language')
            const language = (
              typeof languageFromForm === 'string' && languageFromForm.trim()
                ? languageFromForm.trim()
                : extraOptions?.language || config.language || 'en'
            )

            const adapter = await getWhisperAdapter()
            if (adapter.state !== 'ready')
              await adapter.load(undefined, { signal: extraOptions?.abortSignal ?? init?.signal ?? undefined })

            const audioFloat32 = await decodeAudioFileToMonoFloat32(fileEntry)
            const text = await adapter.transcribe(
              { audioFloat32, language },
              { signal: extraOptions?.abortSignal ?? init?.signal ?? undefined },
            )

            return new Response(JSON.stringify({ text }), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
              },
            })
          }
          catch (error) {
            const message = errorMessageFromValue(error)
            return new Response(JSON.stringify({ error: { message } }), {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
              },
            })
          }
        },
      }
    },
  }
}
