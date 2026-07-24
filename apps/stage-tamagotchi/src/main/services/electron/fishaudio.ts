import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { Buffer } from 'node:buffer'

import { defineInvokeHandler } from '@moeru/eventa'
import { electronFishAudioTTS } from '@proj-airi/stage-shared'

const FISH_AUDIO_TTS_ENDPOINT = 'v1/tts'

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function buildHeaders(apiKey: string, model: string): Headers {
  const headers = new Headers({
    'Content-Type': 'application/json',
    model,
  })

  if (apiKey) {
    headers.set('Authorization', `Bearer ${apiKey}`)
  }

  return headers
}

/**
 * Registers the Electron main-process Fish Audio TTS bridge.
 *
 * Use when:
 * - renderer-side Fish Audio speech requests need to bypass browser CORS in production
 * - the renderer is using the default Fish Audio cloud endpoint
 *
 * Expects:
 * - \`params.context\` belongs to a window-scoped Electron Eventa context
 * - payloads already contain a normalized Fish Audio request body
 *
 * Returns:
 * - An invoke handler that returns serialized MP3 bytes and response metadata
 */
export function createFishAudioService(params: { context: ReturnType<typeof createContext>['context'] }) {
  defineInvokeHandler(params.context, electronFishAudioTTS, async (payload) => {
    const url = new URL(payload.baseUrl)
    if (url.host !== 'api.fish.audio') {
      throw new Error(`Forbidden: base URL host must be api.fish.audio`)
    }

    const response = await fetch(`${ensureTrailingSlash(payload.baseUrl)}${FISH_AUDIO_TTS_ENDPOINT}`, {
      method: 'POST',
      headers: buildHeaders(payload.apiKey, payload.model),
      body: JSON.stringify({
        text: payload.text,
        format: 'mp3',
        model: payload.model,
        normalize: payload.normalize,
        latency: payload.latency,
        ...(payload.referenceId ? { reference_id: payload.referenceId } : {}),
        ...(typeof payload.chunkLength === 'number' ? { chunk_length: payload.chunkLength } : {}),
        ...(typeof payload.mp3Bitrate === 'number' ? { mp3_bitrate: payload.mp3Bitrate } : {}),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      const details = errorText ? `: ${errorText}` : ''
      throw new Error(`Fish Audio TTS request failed: ${response.status} ${response.statusText}${details}`)
    }

    const audioBuffer = await response.arrayBuffer()

    return {
      audioBase64: Buffer.from(audioBuffer).toString('base64'),
      mimeType: 'audio/mpeg',
      status: response.status,
      statusText: response.statusText,
    }
  })
}
