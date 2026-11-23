import type { SpeechAudioData } from '@proj-airi/core-agent'

import { decodeWavStream, readWavHeader } from '@proj-airi/audio/encoding'
import { InvalidResponseError, postJSON } from '@xsai/shared'
import { nanoid } from 'nanoid'

type SpeechRequestOptions = Parameters<typeof postJSON>[1] & {
  input: string
  voice: string
  model: string
}

/**
 * Requests speech as WAV and returns it as soon as the first bytes arrive.
 *
 * Use when:
 * - The server streams the audio body, as the official AIRI speech provider does.
 *
 * Expects:
 * - `options` is an xsAI speech request, for example the result of `provider.speech(model, settings)` with
 *   `input`, `voice`, and `abortSignal`.
 *
 * Returns:
 * - A PCM stream when the body is 16-bit PCM WAV. Playback starts on its first block.
 * - A `Blob` with the whole body for any other format, so the browser decodes it as before.
 * - `null` when the server sends no audio, for example HTTP 204 for an automatic request without balance.
 */
export async function requestStreamedSpeechAudio(options: SpeechRequestOptions): Promise<SpeechAudioData | null> {
  let response: Response
  try {
    response = await postJSON('audio/speech', { ...options, responseFormat: 'wav' })
  }
  catch (error) {
    // The server answers 204 without a body when an automatic request has no balance. That is no audio, not a failure.
    if (error instanceof InvalidResponseError && error.reason === 'empty_body' && error.response?.status === 204)
      return null
    throw error
  }
  if (!response.body)
    return null

  const reader = response.body.getReader()
  let head: Uint8Array = new Uint8Array(0)
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (value)
        head = head.length ? new Uint8Array([...head, ...value]) : value
      const header = readWavHeader(head)
      if (header === null || done) {
        // Not WAV, or too short to tell: read the rest and let the browser decode the file.
        const rest = done ? [] : await readRest(reader)
        // `Blob` takes only parts backed by an `ArrayBuffer`, so each part is copied.
        return head.length || rest.length ? new Blob([head, ...rest].map(part => new Uint8Array(part)), { type: response.headers.get('content-type') ?? '' }) : null
      }
      if (header)
        break
    }
  }
  catch (cause) {
    await reader.cancel(cause).catch(() => {})
    throw cause
  }

  const buffered = head
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(buffered)
    },
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done)
        controller.close()
      else
        controller.enqueue(value)
    },
    async cancel(reason) {
      await reader.cancel(reason)
    },
  })
  return decodeWavStream(body, { sourceId: nanoid() })
}

async function readRest(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array[]> {
  const parts: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      return parts
    parts.push(value)
  }
}
