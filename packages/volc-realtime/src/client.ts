import type { ConnectionState, VolcRealtimeClientOptions } from './types'

import { Buffer } from 'node:buffer'

import { useLogg } from '@guiiai/logg'
import { WebSocket } from 'ws'

import {
  ASR_ENDED,
  ASR_INFO,
  ASR_RESPONSE,
  AudioData,
  CHAT_RESPONSE,
  ConnectionStarted,
  FinishSession,
  SessionStarted,
  StartConnection,
  StartSession,
  TTS_ENDED,
  TTS_SENTENCE_START,
} from './events'
import { decodeFrame, encodeFrame, MessageType } from './protocol'

const WS_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'

const MAX_RECONNECT_DELAY = 30_000
const BASE_RECONNECT_DELAY = 1_000

export class VolcRealtimeClient {
  private ws: WebSocket | null = null
  private state: ConnectionState = 'disconnected'
  private sessionId: string | null = null
  private sequence = 0
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private shouldReconnect = false
  private logger = useLogg('VolcRealtimeClient').useGlobalConfig()

  constructor(private options: VolcRealtimeClientOptions) {}

  get connectionState(): ConnectionState {
    return this.state
  }

  async connect(): Promise<void> {
    if (this.ws) {
      this.logger.warn('Already connected or connecting')
      return
    }

    this.shouldReconnect = true
    this.setState('connecting')

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: {
          'X-Api-App-Key': this.options.appKey,
          'X-Api-Resource-Id': this.options.resourceId,
          'X-Api-Access-Key': this.options.accessKey,
        },
      })

      ws.binaryType = 'nodebuffer'

      ws.on('open', () => {
        this.ws = ws
        this.logger.log('WebSocket connected, sending StartConnection')
        this.sendStartConnection()
      })

      ws.on('message', (data: Buffer) => {
        try {
          const frame = decodeFrame(Buffer.from(data))
          this.handleFrame(frame.eventId, frame.payload, resolve)
        }
        catch (err) {
          this.logger.error('Failed to decode frame', err)
          this.options.onError(err instanceof Error ? err : new Error(String(err)))
        }
      })

      ws.on('error', (err) => {
        this.logger.error('WebSocket error', String(err))
        this.options.onError(err)
        reject(err)
      })

      ws.on('close', (code, reason) => {
        this.logger.log(`WebSocket closed: ${code} ${reason.toString('utf-8')}`)
        this.ws = null
        this.sessionId = null

        if (this.shouldReconnect && this.state !== 'disconnected') {
          this.setState('error')
          this.scheduleReconnect()
        }
        else {
          this.setState('disconnected')
        }
      })
    })
  }

  sendAudio(pcm: Int16Array): void {
    if (!this.ws || this.state !== 'streaming') {
      this.logger.warn('Cannot send audio: not in streaming state')
      return
    }

    const buf = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    this.sequence++

    const frame = encodeFrame(AudioData, buf, {
      messageType: MessageType.AUDIO_ONLY_CLIENT,
      sequence: this.sequence,
      sessionId: this.sessionId ?? undefined,
    })

    this.ws.send(frame)
  }

  async disconnect(): Promise<void> {
    this.shouldReconnect = false

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws && this.sessionId) {
      this.logger.log('Sending FinishSession')
      const payload = Buffer.from(JSON.stringify({}))
      const frame = encodeFrame(FinishSession, payload, {
        sessionId: this.sessionId,
      })
      this.ws.send(frame)
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.sessionId = null
    this.sequence = 0
    this.reconnectAttempts = 0
    this.setState('disconnected')
  }

  private setState(state: ConnectionState): void {
    if (this.state === state)
      return
    this.state = state
    this.options.onStateChange?.(state)
  }

  private sendStartConnection(): void {
    const payload = Buffer.from(JSON.stringify({
      app: {
        appid: this.options.appId,
      },
    }))

    const frame = encodeFrame(StartConnection, payload)
    this.ws!.send(frame)
  }

  private sendStartSession(): void {
    const payload = Buffer.from(JSON.stringify({
      audio: {
        format: 'pcm',
        sample_rate: 16000,
        bits: 16,
        channel: 1,
      },
      dialog: {
        model: this.options.dialogModel,
      },
      tts: {
        speaker: this.options.speaker,
      },
    }))

    const frame = encodeFrame(StartSession, payload, {
      sessionId: this.sessionId ?? undefined,
    })
    this.ws!.send(frame)
  }

  private handleFrame(
    eventId: number,
    payload: Buffer | Uint8Array,
    connectResolve?: (value: void) => void,
  ): void {
    switch (eventId) {
      case ConnectionStarted: {
        this.logger.log('ConnectionStarted received')
        try {
          const data = JSON.parse(Buffer.from(payload).toString('utf-8'))
          this.sessionId = data.session_id ?? null
        }
        catch {
          // session_id may not be in ConnectionStarted
        }
        this.setState('connected')
        this.sendStartSession()
        break
      }

      case SessionStarted: {
        this.logger.log('SessionStarted received')
        try {
          const data = JSON.parse(Buffer.from(payload).toString('utf-8'))
          if (data.session_id)
            this.sessionId = data.session_id
        }
        catch {
          // ignore parse errors
        }
        this.reconnectAttempts = 0
        this.setState('streaming')
        connectResolve?.()
        break
      }

      case ASR_INFO:
      case ASR_RESPONSE: {
        try {
          const data = JSON.parse(Buffer.from(payload).toString('utf-8'))
          const text = data.text ?? data.result ?? ''
          const isFinal = data.is_final !== undefined ? Boolean(data.is_final) : data.definite === true
          this.options.onAsrResult(text, isFinal)
        }
        catch (err) {
          this.logger.error('Failed to parse ASR response', err)
        }
        break
      }

      case ASR_ENDED: {
        try {
          const data = JSON.parse(Buffer.from(payload).toString('utf-8'))
          const fullText = data.text ?? data.result ?? ''
          this.options.onAsrEnded(fullText)
        }
        catch (err) {
          this.logger.error('Failed to parse ASR_ENDED', err)
        }
        break
      }

      case TTS_SENTENCE_START: {
        this.options.onTtsStart()
        break
      }

      case TTS_ENDED: {
        this.options.onTtsEnd()
        break
      }

      case CHAT_RESPONSE: {
        try {
          const data = JSON.parse(Buffer.from(payload).toString('utf-8'))
          const text = data.text ?? data.content ?? ''
          this.options.onChatResponse(text)
        }
        catch (err) {
          this.logger.error('Failed to parse CHAT_RESPONSE', err)
        }
        break
      }

      case AudioData: {
        // Server sending audio data (TTS PCM)
        const pcm = new Int16Array(
          payload.buffer,
          payload.byteOffset,
          payload.byteLength / 2,
        )
        this.options.onAudioReceived(pcm)
        break
      }

      default: {
        this.logger.log(`Unhandled event: ${eventId}`)
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer)
      return

    const delay = Math.min(
      BASE_RECONNECT_DELAY * 2 ** this.reconnectAttempts,
      MAX_RECONNECT_DELAY,
    )
    this.reconnectAttempts++

    this.logger.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        this.ws = null
        await this.connect()
      }
      catch (err) {
        this.logger.error('Reconnect failed', err)
      }
    }, delay)
  }
}
