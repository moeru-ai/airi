import type { AudioTranscriptionClientControlMessage, AudioTranscriptionServerMessage } from '@proj-airi/server-sdk-shared'
import type { WSContext, WSEvents } from 'hono/ws'

import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { ProviderCatalogService } from '../../services/domain/provider-catalog'
import type { EnvelopeCrypto } from '../../utils/envelope-crypto'
import type { AliyunNlsSession } from './session'

import { Buffer } from 'node:buffer'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { literal, safeParse, strictObject, variant } from 'valibot'

import { resolveOfficialAliyunNlsCredentialsFromConfig } from './config'
import { createAliyunNlsSession } from './session'

const log = useLogger('audio-transcription-ws').useGlobalConfig()

const AudioTranscriptionClientControlMessageSchema = variant('event', [
  strictObject({
    event: literal('start'),
    model: literal('auto'),
    format: literal('pcm'),
    sample_rate: literal(16000),
  }),
  strictObject({ event: literal('stop') }),
  strictObject({ event: literal('cancel') }),
])

type ClientState = 'waiting' | 'starting' | 'ready' | 'stopping' | 'finished'

// The client may send PCM only in ready and stop only once. Disconnect,
// cancel, and errors finish the connection and cancel any upstream task.

function parseControlMessage(data: string): AudioTranscriptionClientControlMessage | undefined {
  let value: unknown
  try {
    value = JSON.parse(data)
  }
  catch {
    return undefined
  }

  const result = safeParse(AudioTranscriptionClientControlMessageSchema, value)
  return result.success ? result.output : undefined
}

function toUint8Array(data: unknown): Uint8Array | undefined {
  if (data instanceof Buffer)
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  if (data instanceof ArrayBuffer)
    return new Uint8Array(data)
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return undefined
}

/** Builds one authenticated ASR WebSocket handler set per client connection. */
export function createAudioTranscriptionWsHandlers(options: {
  configKV: ConfigKVService
  envelopeCrypto: EnvelopeCrypto
  providerCatalogService: ProviderCatalogService
}) {
  return function setupPeer(userId: string): WSEvents {
    let client: WSContext | undefined
    let upstream: AliyunNlsSession | undefined
    let state: ClientState = 'waiting'

    function send(message: AudioTranscriptionServerMessage) {
      client?.send(JSON.stringify(message))
    }

    function closeWithError(code: string, message: string, closeCode: number = 1011) {
      if (state === 'finished')
        return
      state = 'finished'
      send({ event: 'error', code, message })
      upstream?.cancel()
      try {
        client?.close(closeCode, code)
      }
      catch {}
    }

    async function startSession() {
      try {
        const credentials = await resolveOfficialAliyunNlsCredentialsFromConfig(options)
        if (state !== 'starting')
          return
        if (!credentials) {
          closeWithError('official_asr_not_configured', 'Official ASR is not configured.', 1008)
          return
        }

        upstream = createAliyunNlsSession({
          credentials,
          onStarted() {
            if (state !== 'starting') {
              closeWithError('invalid_upstream_state', 'The ASR upstream started in an invalid state.')
              return
            }
            state = 'ready'
            send({ event: 'session.started' })
          },
          onTranscriptDelta(delta) {
            send({ event: 'transcript.text.delta', delta })
          },
          onTranscriptDone() {
            send({ event: 'transcript.text.done' })
          },
          onFinished() {
            if (state === 'finished')
              return
            state = 'finished'
            send({ event: 'session.finished' })
            client?.close(1000, 'completed')
          },
          onError(error) {
            log.withError(error).withFields({ userId }).warn('ASR upstream failed')
            closeWithError('upstream_error', error.message)
          },
        })
        await upstream.start()
      }
      catch (error) {
        log.withError(error).withFields({ userId }).warn('ASR session failed to start')
        closeWithError('session_start_failed', errorMessageFrom(error) ?? 'The ASR session failed to start.')
      }
    }

    function handleControl(message: AudioTranscriptionClientControlMessage) {
      switch (message.event) {
        case 'start':
          if (state !== 'waiting') {
            closeWithError('invalid_start_frame', 'The start frame is not valid in the current state.', 1008)
            return
          }
          state = 'starting'
          void startSession()
          break
        case 'stop':
          if (state !== 'ready' || !upstream) {
            closeWithError('invalid_stop_frame', 'The stop frame is not valid in the current state.', 1008)
            return
          }
          state = 'stopping'
          try {
            upstream.stop()
          }
          catch (error) {
            closeWithError('session_stop_failed', errorMessageFrom(error) ?? 'The ASR session did not stop.')
          }
          break
        case 'cancel':
          if (state === 'finished')
            return
          state = 'finished'
          upstream?.cancel()
          client?.close(1000, 'cancelled')
          break
      }
    }

    return {
      onOpen(_event, ws) {
        client = ws
      },
      onMessage(message) {
        if (state === 'finished')
          return

        if (typeof message.data === 'string') {
          const control = parseControlMessage(message.data)
          if (!control) {
            closeWithError('invalid_control_frame', 'The control frame is invalid.', 1008)
            return
          }
          handleControl(control)
          return
        }

        const chunk = toUint8Array(message.data)
        if (!chunk || state !== 'ready' || !upstream) {
          closeWithError('invalid_audio_frame', 'The audio frame is not valid in the current state.', 1008)
          return
        }

        try {
          upstream.sendAudio(chunk)
        }
        catch (error) {
          closeWithError('audio_forward_failed', errorMessageFrom(error) ?? 'The audio frame was not sent.')
        }
      },
      onClose() {
        if (state === 'finished')
          return
        state = 'finished'
        upstream?.cancel()
      },
      onError(event, ws) {
        log.withFields({ userId, event: String(event) }).warn('ASR client WebSocket failed')
        state = 'finished'
        upstream?.cancel()
        try {
          ws.close(1011, 'client_error')
        }
        catch {}
      },
    }
  }
}
