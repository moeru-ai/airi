import type { WSEvents } from 'hono/ws'

import type { AudioSpeechSessionAnalytics } from './session'
import type { AudioSpeechWsHandlersOptions } from './types'

import { useLogger } from '@guiiai/logg'

import { createSessionState } from './session'

const log = useLogger('audio-speech-ws').useGlobalConfig()

export type { AudioSpeechWsHandlersOptions } from './types'

/**
 * Build the per-user setup function for the bidirectional streaming TTS proxy.
 *
 * Use when:
 * - Wiring `/api/v1/audio/speech/ws` in {@link app.ts}. The factory returns a
 *   curried `setupPeer(userId)` that produces hono `WSEvents`, mirroring the
 *   shape of {@link createChatWsHandlers} so app.ts wires both routes the
 *   same way.
 *
 * Expects:
 * - The route handler has already resolved auth via the `?token=` query
 *   (see app.ts wiring) and passes a verified `userId` in.
 * - The client sends a `start` control frame first. The session validates the
 *   requested streaming model and voice before dialing upstream.
 *
 * Returns:
 * - A function that takes `userId` and returns hono `WSEvents`. Each call
 *   produces a fresh closure scoped to one connection — there is no global
 *   peer registry because streaming TTS is single-session per connection.
 */
export function createAudioSpeechWsHandlers(opts: AudioSpeechWsHandlersOptions) {
  return function setupPeer(userId: string, analytics?: AudioSpeechSessionAnalytics): WSEvents {
    const sessionState = createSessionState(userId, opts, analytics)

    return {
      onOpen(_event, ws) {
        sessionState.attachClient(ws)
      },
      onMessage(message, ws) {
        sessionState.handleClientMessage(message, ws)
      },
      onClose(_event, _ws) {
        sessionState.handleClientClose()
      },
      onError(event, ws) {
        log.withFields({ userId, event: String(event) }).warn('client ws error')
        sessionState.handleClientClose()
        try {
          ws.close(1011, 'internal_error')
        }
        catch {}
      },
    }
  }
}
