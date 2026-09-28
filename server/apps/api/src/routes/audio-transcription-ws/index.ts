import type { AudioTranscriptionClientControlMessage, AudioTranscriptionServerMessage } from '@proj-airi/server-sdk-shared'
import type { WSContext, WSEvents } from 'hono/ws'

import type { ConfigKVService } from '../../services/adapters/config-kv'
import type { ProviderCatalogService } from '../../services/domain/provider-catalog'
import type { EnvelopeCrypto } from '../../utils/envelope-crypto'
import type { AliyunNlsSession } from './session'

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'

import { useLogger } from '@guiiai/logg'
import { literal, safeParse, strictObject, variant } from 'valibot'

import { resolveOfficialAliyunNlsCredentialsFromConfig } from './config'
import { createAliyunNlsSession } from './session'

const log = useLogger('audio-transcription-ws').useGlobalConfig()
const MAX_AUDIO_BYTES = 16000 * 2 * 60
const STARTUP_TIMEOUT_MS = 30_000
const SESSION_TIMEOUT_MS = 75_000

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
    let totalAudioBytes = 0
    let sessionTimer: ReturnType<typeof setTimeout> | undefined
    let usageRecorded = false
    const requestId = randomUUID()

    function recordUsage(outcome: 'completed' | 'cancelled' | 'disconnected' | 'failed') {
      if (usageRecorded)
        return
      usageRecorded = true
      // Count only PCM bytes forwarded to Aliyun. The log has no transcript or
      // credentials. Pricing remains a separate policy decision.
      log.withFields({
        userId,
        requestId,
        outcome,
        audioBytes: totalAudioBytes,
        audioDurationMs: Math.ceil(totalAudioBytes / 32),
      }).log('ASR usage recorded')
    }

    function clearSessionTimer() {
      if (sessionTimer)
        clearTimeout(sessionTimer)
      sessionTimer = undefined
    }

    function scheduleSessionTimeout(durationMs: number) {
      clearSessionTimer()
      sessionTimer = setTimeout(closeWithError, durationMs, 'session_timeout', 'The ASR session timed out.')
      sessionTimer.unref()
    }

    function send(message: AudioTranscriptionServerMessage) {
      client?.send(JSON.stringify(message))
    }

    function closeWithError(code: string, message: string, closeCode: number = 1011) {
      if (state === 'finished')
        return
      log.withFields({ userId, code, totalAudioBytes }).warn('ASR session failed')
      recordUsage('failed')
      state = 'finished'
      clearSessionTimer()
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
            scheduleSessionTimeout(SESSION_TIMEOUT_MS)
            send({ event: 'session.started' })
          },
          onTranscriptSnapshot(text, isFinal, durationMilliseconds) {
            send({ event: 'transcript.text.snapshot', text, isFinal, durationMilliseconds })
          },
          onTranscriptDone() {
            send({ event: 'transcript.text.done' })
          },
          onFinished() {
            if (state === 'finished')
              return
            state = 'finished'
            clearSessionTimer()
            recordUsage('completed')
            send({ event: 'session.finished' })
            client?.close(1000, 'completed')
          },
          onError(error) {
            log.withFields({ userId, errorName: error.name }).warn('ASR upstream failed')
            closeWithError('upstream_error', 'The ASR upstream failed.')
          },
        })
        await upstream.start()
      }
      catch (error) {
        log.withFields({ userId, errorName: error instanceof Error ? error.name : 'unknown' }).warn('ASR session failed to start')
        closeWithError('session_start_failed', 'The ASR session failed to start.')
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
          scheduleSessionTimeout(STARTUP_TIMEOUT_MS)
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
            log.withFields({ userId, errorName: error instanceof Error ? error.name : 'unknown' }).warn('ASR upstream did not stop')
            closeWithError('session_stop_failed', 'The ASR session did not stop.')
          }
          break
        case 'cancel':
          if (state === 'finished')
            return
          state = 'finished'
          clearSessionTimer()
          recordUsage('cancelled')
          upstream?.cancel()
          client?.close(1000, 'cancelled')
          break
      }
    }

    return {
      onOpen(_event, ws) {
        client = ws
        scheduleSessionTimeout(10_000)
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
        if (chunk && totalAudioBytes + chunk.byteLength > MAX_AUDIO_BYTES) {
          closeWithError('audio_limit_exceeded', 'The ASR audio limit was exceeded.', 1009)
          return
        }
        if (!chunk || state !== 'ready' || !upstream) {
          closeWithError('invalid_audio_frame', 'The audio frame is not valid in the current state.', 1008)
          return
        }

        try {
          upstream.sendAudio(chunk)
          totalAudioBytes += chunk.byteLength
        }
        catch (error) {
          log.withFields({ userId, errorName: error instanceof Error ? error.name : 'unknown' }).warn('ASR audio forwarding failed')
          closeWithError('audio_forward_failed', 'The audio frame was not sent.')
        }
      },
      onClose() {
        if (state === 'finished')
          return
        state = 'finished'
        clearSessionTimer()
        recordUsage('disconnected')
        upstream?.cancel()
      },
      onError(_event, ws) {
        log.withFields({ userId }).warn('ASR client WebSocket failed')
        state = 'finished'
        clearSessionTimer()
        recordUsage('failed')
        upstream?.cancel()
        try {
          ws.close(1011, 'client_error')
        }
        catch {}
      },
    }
  }
}
