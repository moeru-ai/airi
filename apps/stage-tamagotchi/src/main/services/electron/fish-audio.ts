import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { defineInvokeHandler } from '@moeru/eventa'
import { electronFishAudioTTS } from '@proj-airi/stage-ui/stores/providers/fish-audio/ipc'
import { net } from 'electron'

/**
 * Register the Fish Audio TTS IPC handler.
 *
 * The renderer cannot call https://api.fish.audio directly because the CDN
 * does not send CORS headers for browser origins. By routing the request
 * through the main process with net.fetch, we bypass the renderer's CORS
 * enforcement entirely.
 */
export function createFishAudioService(params: {
  context: ReturnType<typeof createContext>['context']
}): void {
  defineInvokeHandler(params.context, electronFishAudioTTS, async (payload) => {
    const response = await net.fetch(`${payload.baseUrl}/v1/tts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${payload.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: payload.text,
        reference_id: payload.referenceId ?? null,
        format: 'mp3',
      }),
    })

    if (!response.ok) {
      throw new Error(`Fish Audio TTS failed: ${response.status} ${response.statusText}`)
    }

    const buffer = await response.arrayBuffer()
    return {
      data: new Uint8Array(buffer),
      contentType: response.headers.get('content-type') ?? 'audio/mpeg',
      status: response.status,
    }
  })
}
