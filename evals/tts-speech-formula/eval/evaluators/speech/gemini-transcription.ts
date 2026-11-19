import type { TranscriptionExecutor } from './speech-models'

import { Buffer } from 'node:buffer'

// NOTICE:
// This module has no runtime relative import, because `eval/tasks/read-aloud/config.ts` imports it through the package
// export `./gemini-transcription`. Vieval loads configs with Node type stripping, which cannot follow an extensionless
// relative import. Type imports are stripped, so they are safe.
// Source: the same constraint as `speech-models.ts`, see eval/index.ts.
// Remove this notice when vieval loads configs with an extension-resolving loader.

/** The text part of a Gemini `generateContent` answer. Thought parts carry the reasoning, not the transcript. */
interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string, thought?: boolean }> } }>
}

/**
 * Tells the model to act as a speech recognizer. The listener turns the words into notation later, so this step
 * must keep the spoken words and must not use what it knows about formulas to fix or complete them.
 */
function transcriptionPrompt(language: string | undefined): string {
  const spoken = language ? `The speech is in the language with the BCP 47 code "${language}".` : ''
  return [
    `Transcribe this audio verbatim, as a speech recognizer does. ${spoken}`,
    'Write the words that you hear. Do not convert spoken math into notation or LaTeX.',
    'Do not correct, complete, or explain anything. Output only the transcript.',
    'If you hear no intelligible speech, output nothing.',
  ].join('\n')
}

function requiredParameter(parameters: Readonly<Record<string, unknown>>, name: string, model: string): string {
  const value = parameters[name]
  if (typeof value !== 'string' || !value)
    throw new Error(`Gemini transcription model "${model}" has no "${name}" parameter. Set it on its speech provider, for example through its env.`)
  return value
}

/**
 * Creates a transcription executor for Gemini models, through the Gemini `generateContent` API.
 *
 * Use when:
 * - the `asr` axis selects a Gemini model. Gemini has no `/audio/transcriptions` endpoint, so the executor's `fetch`
 *   turns the xsai transcription request into one `generateContent` call with the clip as inline audio.
 *
 * Expects:
 * - the provider parameters `baseURL`, the Gemini API root such as `https://generativelanguage.googleapis.com/v1beta/`,
 *   and `apiKey`
 *
 * Returns:
 * - an executor whose `fetch` answers `{ text }`, as an OpenAI-compatible transcription endpoint does. A failed upstream
 *   response is returned unchanged, so xsai reports its status and vieval can retry a rate limit.
 */
export function createGeminiTranscription(): TranscriptionExecutor {
  return {
    id: 'gemini',
    transcription: ({ model, parameters }) => {
      const apiKey = requiredParameter(parameters, 'apiKey', model)
      const baseURL = requiredParameter(parameters, 'baseURL', model)
      const root = baseURL.endsWith('/') ? baseURL : `${baseURL}/`

      return {
        baseURL: root,
        model,
        fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
          // xsai sends the clip and its options as multipart form data. See `generateTranscription` of @xsai/generate-transcription.
          if (!(init?.body instanceof FormData))
            throw new TypeError('Gemini transcription expects the multipart request of xsai.')
          const file = init.body.get('file')
          if (!(file instanceof Blob))
            throw new TypeError('Gemini transcription request has no audio file.')
          const language = init.body.get('language')

          const response = await fetch(new URL(`models/${model}:generateContent`, root), {
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: transcriptionPrompt(typeof language === 'string' ? language : undefined) },
                  { inline_data: { data: Buffer.from(await file.arrayBuffer()).toString('base64'), mime_type: file.type || 'audio/mpeg' } },
                ],
              }],
              // A transcript of the same clip must not change between runs.
              generationConfig: { temperature: 0 },
            }),
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            method: 'POST',
            signal: init.signal,
          })
          if (!response.ok)
            return response

          const answer = await response.json() as GenerateContentResponse
          const parts = answer.candidates?.[0]?.content?.parts
          // No candidate means the model heard nothing to transcribe, so the transcript is empty and the listener marks the case `unclear`.
          const text = parts == null
            ? ''
            : parts.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('').trim()
          return new Response(JSON.stringify({ text }), { headers: { 'Content-Type': 'application/json' } })
        },
      }
    },
  }
}
