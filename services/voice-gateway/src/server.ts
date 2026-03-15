import type { ServerMessage } from './types'

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'

import WebSocket, { WebSocketServer } from 'ws'

import { useLogg } from '@guiiai/logg'
import { decodeFrame, encodeFrame, MessageType } from '@proj-airi/volc-realtime/protocol'

import * as Events from '@proj-airi/volc-realtime/events'

import { env } from './env'
import { OpenClawClient } from './openclaw-client'
import { detectTask } from './task-detector'
import { synthesizeSpeech } from './tts-adapter'

const log = useLogg('voice-gateway').useGlobalConfig()

interface SessionConfig {
  volcAppId: string
  volcAccessKey: string
  volcAppKey: string
  volcResourceId: string
  volcSpeaker: string
  volcDialogModel: string
}

interface Session {
  volcWs: WebSocket | null
  openClawClient: OpenClawClient | null
  sessionId: string
  lastAsrText: string
  lastChatResponse: string
  config: SessionConfig
  _audioCount?: number
}

function getSessionConfig(clientConfig?: Partial<SessionConfig>): SessionConfig {
  // Client-sent credentials take priority over server .env.
  // Core credentials (AppId, AccessKey, AppKey) have NO hardcoded defaults —
  // users must provide their own via the settings page or server .env.
  return {
    volcAppId: clientConfig?.volcAppId || env.VOLC_APP_ID,
    volcAccessKey: clientConfig?.volcAccessKey || env.VOLC_ACCESS_KEY,
    volcAppKey: clientConfig?.volcAppKey || env.VOLC_APP_KEY,
    volcResourceId: clientConfig?.volcResourceId || env.VOLC_RESOURCE_ID || 'volc.speech.dialog',
    volcSpeaker: clientConfig?.volcSpeaker || env.VOLC_SPEAKER || 'zh_female_vv_jupiter_bigtts',
    volcDialogModel: clientConfig?.volcDialogModel || env.VOLC_DIALOG_MODEL || '1.2.1.1',
  }
}

function validateSessionConfig(config: SessionConfig): string | null {
  if (!config.volcAppId)
    return 'Missing Volcengine App ID'
  if (!config.volcAccessKey)
    return 'Missing Volcengine Access Key'
  if (!config.volcAppKey)
    return 'Missing Volcengine App Key'
  return null
}

function sendJSON(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function sendBinary(ws: WebSocket, type: string, data: Buffer): void {
  if (ws.readyState === WebSocket.OPEN) {
    const header = Buffer.from(JSON.stringify({ type }))
    const headerLen = Buffer.alloc(4)
    headerLen.writeUInt32BE(header.length, 0)
    ws.send(Buffer.concat([headerLen, header, data]))
  }
}

function buildStartSessionPayload(config: SessionConfig): Buffer {
  const payload = {
    tts: {
      audio_config: {
        channel: 1,
        format: 'pcm_s16le',
        sample_rate: 24000,
      },
      speaker: config.volcSpeaker,
    },
    asr: {
      audio_info: {
        format: 'pcm',
        sample_rate: 16000,
        channel: 1,
      },
      extra: {
        end_smooth_window_ms: 1500,
        enable_custom_vad: false,
      },
    },
    dialog: {
      bot_name: '月見八千代',
      dialog_id: '',
      system_message: '你是月見八千代（つきみ やちよ / Tsukimi Yachiyo），来自月球的公主，拥有操控月光的能力。你的性格温柔而坚强，对地球的文化充满好奇。说话风格优雅温和，偶尔带有古风用语。对人类世界的科技和食物特别感兴趣，有时会不经意流露出思乡之情。你来自作品《超时空辉夜姬》。请用简短自然的口语回复，适合语音对话的节奏。',
      extra: {
        model: config.volcDialogModel,
        input_mod: 'keep_alive',
      },
    },
  }

  return Buffer.from(JSON.stringify(payload), 'utf-8')
}

function connectToVolc(browserWs: WebSocket, session: Session): void {
  const config = session.config

  // Validate credentials before attempting connection
  const validationError = validateSessionConfig(config)
  if (validationError) {
    log.error(`Cannot connect to Volcengine: ${validationError}`)
    sendJSON(browserWs, { type: 'error', message: validationError })
    return
  }

  // Correct URL per official docs
  const volcUrl = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'
  const volcWs = new WebSocket(volcUrl, {
    headers: {
      'X-Api-App-ID': config.volcAppId,
      'X-Api-Access-Key': config.volcAccessKey,
      'X-Api-Resource-Id': config.volcResourceId,
      'X-Api-App-Key': config.volcAppKey,
    },
  })

  session.volcWs = volcWs

  volcWs.on('open', () => {
    log.log('Connected to Volcengine WSS')
    sendJSON(browserWs, { type: 'state', state: 'connected' })

    // Send StartConnection with empty payload {} (connect-level event)
    const emptyPayload = Buffer.from('{}', 'utf-8')
    volcWs.send(encodeFrame(Events.StartConnection, emptyPayload))
  })

  volcWs.on('message', (raw: Buffer) => {
    const rawBuf = Buffer.from(raw)
    const frame = decodeFrame(rawBuf)

    // Log ALL incoming frames for debugging
    log.log(`[VOLC-IN] eventId=${frame.eventId}, msgType=0x${frame.messageType?.toString(16)}, payloadLen=${frame.payload?.length || 0}, rawLen=${rawBuf.length}`)

    switch (frame.eventId) {
      case Events.ConnectionStarted: {
        log.log('Volcengine connection established')
        // Send StartSession with TTS/ASR/dialog config (session-level event)
        const payload = buildStartSessionPayload(session.config)
        volcWs.send(encodeFrame(Events.StartSession, payload, {
          sessionId: session.sessionId,
        }))
        break
      }

      case Events.ConnectionFailed: {
        try {
          const data = JSON.parse(frame.payload.toString('utf-8'))
          log.error(`Volcengine connection failed: ${data.error || 'unknown'}`)
        }
        catch {
          log.error('Volcengine connection failed')
        }
        sendJSON(browserWs, { type: 'error', message: 'Volcengine connection failed' })
        break
      }

      case Events.SessionStarted: {
        let dialogId = ''
        try {
          const data = JSON.parse(frame.payload.toString('utf-8'))
          dialogId = data.dialog_id || ''
        }
        catch { /* ignore */ }
        log.log(`Session started, dialog_id: ${dialogId}`)
        sendJSON(browserWs, { type: 'state', state: 'streaming' })
        break
      }

      case Events.SessionFailed: {
        try {
          const data = JSON.parse(frame.payload.toString('utf-8'))
          log.error(`Session failed: ${data.error || 'unknown'}`)
        }
        catch {
          log.error('Session failed')
        }
        sendJSON(browserWs, { type: 'error', message: 'Session failed' })
        break
      }

      case Events.ASRResponse: {
        try {
          const data = JSON.parse(frame.payload.toString('utf-8'))
          const results = data.results || []
          if (results.length > 0) {
            const text = results[0].text || ''
            const isFinal = !(results[0].is_interim ?? true)
            sendJSON(browserWs, { type: 'asr', text, isFinal })
            if (isFinal) {
              session.lastAsrText = text
            }
          }
        }
        catch { /* ignore parse errors */ }
        break
      }

      case Events.ASRInfo: {
        // User started speaking - notify browser to interrupt playback
        sendJSON(browserWs, { type: 'state', state: 'listening' })
        break
      }

      case Events.ASREnded: {
        // ASR recognition ended
        break
      }

      case Events.ChatResponse: {
        try {
          const data = JSON.parse(frame.payload.toString('utf-8'))
          const text = data.content || ''
          session.lastChatResponse += text
          log.log(`ChatResponse: "${text}"`)
          sendJSON(browserWs, { type: 'chat', text })
        }
        catch { /* ignore */ }
        break
      }

      case Events.ChatEnded: {
        log.log(`ChatEnded: full response="${session.lastChatResponse}"`)
        // Chat response complete, notify browser and check for task
        sendJSON(browserWs, { type: 'chat_ended' })
        handleTaskDetection(browserWs, session)
        session.lastChatResponse = ''
        break
      }

      case Events.TTSSentenceStart: {
        // TTS audio will follow
        break
      }

      case Events.TTSResponse: {
        // Audio binary data from TTS (event 352)
        log.log(`TTSResponse: ${frame.payload?.length || 0} bytes audio`)
        if (frame.payload && frame.payload.length > 0) {
          sendBinary(browserWs, 'audio', Buffer.from(frame.payload))
        }
        break
      }

      case Events.TTSEnded: {
        // TTS finished for this turn
        break
      }

      case Events.DialogCommonError: {
        try {
          const data = JSON.parse(frame.payload.toString('utf-8'))
          log.error(`Dialog error: ${data.status_code} - ${data.message}`)
        }
        catch {
          log.error('Dialog error (unparseable)')
        }
        break
      }

      default: {
        // Check if it's an audio-only server response (messageType 0x0B)
        if (frame.messageType === MessageType.AUDIO_ONLY_SERVER && frame.payload && frame.payload.length > 0) {
          sendBinary(browserWs, 'audio', Buffer.from(frame.payload))
        }
        else {
          log.log(`Unhandled event: id=${frame.eventId}, msgType=0x${frame.messageType?.toString(16)}, payload=${frame.payload?.length || 0} bytes`)
          if (frame.payload && frame.payload.length > 0 && frame.payload.length < 500) {
            try {
              log.log(`  payload: ${frame.payload.toString('utf-8').slice(0, 200)}`)
            }
            catch { /* binary */ }
          }
        }
        break
      }
    }
  })

  volcWs.on('error', (err) => {
    log.error('Volcengine WebSocket error:', String(err))
    sendJSON(browserWs, { type: 'error', message: 'Volcengine connection error' })
  })

  volcWs.on('close', (code, reason) => {
    log.log(`Volcengine WebSocket closed: ${code} ${reason}`)
    session.volcWs = null
    sendJSON(browserWs, { type: 'state', state: 'disconnected' })
  })
}

async function handleTaskDetection(browserWs: WebSocket, session: Session): Promise<void> {
  const result = detectTask(session.lastAsrText, session.lastChatResponse)
  if (!result.isTask)
    return

  log.log(`Task detected: "${result.taskText}" (confidence: ${result.confidence})`)
  sendJSON(browserWs, { type: 'task_started', taskText: result.taskText })

  // Async offload to OpenClaw
  try {
    if (!session.openClawClient) {
      session.openClawClient = new OpenClawClient({
        gatewayUrl: env.OPENCLAW_GATEWAY_URL,
        token: env.OPENCLAW_TOKEN,
        sessionKey: env.OPENCLAW_SESSION_KEY,
      })
      await session.openClawClient.connect()
    }

    const taskResult = await session.openClawClient.chatSend(result.taskText)
    log.log(`Task result: ${taskResult.slice(0, 100)}`)
    sendJSON(browserWs, { type: 'task_result', text: taskResult })

    // Synthesize task result via TTS and push audio to browser
    const ttsGen = synthesizeSpeech(taskResult, {
      appId: session.config.volcAppId,
      accessKey: session.config.volcAccessKey,
      speaker: env.TTS_SPEAKER,
      speakerId: env.TTS_SPEAKER_ID || undefined,
    })

    for await (const chunk of ttsGen) {
      sendBinary(browserWs, 'audio_task', chunk)
    }
  }
  catch (err) {
    log.error('Task execution failed:', String(err))
    sendJSON(browserWs, { type: 'error', message: 'Task execution failed' })
  }
}

export function createVoiceGateway(port: number): void {
  const wss = new WebSocketServer({ port })

  log.log(`Voice gateway listening on ws://0.0.0.0:${port}`)

  wss.on('connection', (browserWs: WebSocket) => {
    log.log('Browser client connected')

    const session: Session = {
      volcWs: null,
      openClawClient: null,
      sessionId: randomUUID(),
      lastAsrText: '',
      lastChatResponse: '',
      config: getSessionConfig(),
    }

    // Don't connect to Volcengine immediately — wait for config message from browser
    // If no config arrives, the first audio frame will trigger connection with .env defaults

    browserWs.on('message', (raw: Buffer | string) => {
      // Try JSON first (control messages)
      if (typeof raw === 'string' || (Buffer.isBuffer(raw) && raw[0] === 0x7B)) {
        try {
          const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'))

          // Handle config message — browser sends credentials on connect
          if (msg.type === 'config') {
            log.log('Received config from browser client')
            session.config = getSessionConfig(msg)
            // Now connect to Volcengine with the provided credentials
            connectToVolc(browserWs, session)
            return
          }

          if (msg.type === 'control') {
            if (msg.action === 'stop' && session.volcWs) {
              session.volcWs.send(encodeFrame(Events.FinishSession, Buffer.from('{}'), {
                sessionId: session.sessionId,
              }))
            }
            return
          }
          // Text input - send as ChatTextQuery (event 501) to Volcengine
          if (msg.type === 'text' && msg.text && session.volcWs && session.volcWs.readyState === WebSocket.OPEN) {
            log.log(`Text query: "${msg.text}"`)
            const textPayload = Buffer.from(JSON.stringify({ text: msg.text }), 'utf-8')
            const frame = encodeFrame(Events.ChatTextQuery, textPayload, {
              sessionId: session.sessionId,
            })
            session.volcWs.send(frame)
            return
          }
        }
        catch { /* not JSON, treat as binary audio */ }
      }

      // Binary audio - relay to Volcengine as TaskRequest (event 200, audio-only)
      // If Volcengine not yet connected (no config received), connect with .env defaults
      if (!session.volcWs) {
        log.log('Audio arrived before config, connecting with .env defaults')
        connectToVolc(browserWs, session)
      }
      if (session.volcWs && session.volcWs.readyState === WebSocket.OPEN) {
        const audioBuffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as string)
        if (!session._audioCount)
          session._audioCount = 0
        session._audioCount++

        const encodedFrame = encodeFrame(Events.TaskRequest, audioBuffer, {
          messageType: MessageType.AUDIO_ONLY_CLIENT,
          sessionId: session.sessionId,
        })

        // Log amplitude for every 50th frame to detect if audio is silence
        if (session._audioCount % 50 === 1 || session._audioCount === 1) {
          const int16View = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2)
          let maxVal = 0
          for (let i = 0; i < int16View.length; i++) {
            const abs = Math.abs(int16View[i])
            if (abs > maxVal)
              maxVal = abs
          }
          log.log(`[AUDIO] #${session._audioCount}: ${audioBuffer.length}B, maxAmp=${maxVal}, encoded=${encodedFrame.length}B`)
        }
        session.volcWs.send(encodedFrame)
      }
      else {
        log.log(`[DEBUG] Cannot relay audio: volcWs=${session.volcWs ? 'exists' : 'null'}, state=${session.volcWs?.readyState}`)
      }
    })

    browserWs.on('close', () => {
      log.log('Browser client disconnected')

      if (session.volcWs) {
        // Graceful shutdown: FinishSession → FinishConnection → close
        try {
          session.volcWs.send(encodeFrame(Events.FinishSession, Buffer.from('{}'), {
            sessionId: session.sessionId,
          }))
          session.volcWs.send(encodeFrame(Events.FinishConnection, Buffer.from('{}')))
        }
        catch { /* ignore if already closed */ }
        session.volcWs.close()
        session.volcWs = null
      }

      if (session.openClawClient) {
        session.openClawClient.disconnect()
        session.openClawClient = null
      }
    })

    browserWs.on('error', (err) => {
      log.error('Browser WebSocket error:', String(err))
    })
  })

  wss.on('error', (err) => {
    log.error('WebSocket server error:', String(err))
  })
}
