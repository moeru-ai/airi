import type { WebSocketEvent } from '@proj-airi/server-shared/types'

import process, { env } from 'node:process'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import WebSocket from 'ws'

import { useLogg } from '@guiiai/logg'
import { ContextUpdateStrategy, Client as ServerChannel } from '@proj-airi/server-sdk'
import { WebSocketEventSource } from '@proj-airi/server-shared/types'
import { createOpenAI } from '@xsai-ext/providers/create'
import { generateSpeech } from '@xsai/generate-speech'
import { createUnAlibabaCloud, createUnDeepgram, createUnElevenLabs, createUnMicrosoft, createUnVolcengine } from 'unspeech'

const log = useLogg('QQAdapter').useGlobalConfig()

const QQ_TOKEN_ENDPOINT = 'https://bots.qq.com/app/getAppAccessToken'
const QQ_GATEWAY_ENDPOINT = 'https://api.sgroup.qq.com/gateway'
const QQ_API_BASE_URL = 'https://api.sgroup.qq.com'
const QQ_AIRI_OUTPUT_TIMEOUT_MS = 12_000

const QQ_INTENTS = {
  guildPublicMessage: 1 << 30,
  directMessage: 1 << 12,
  groupAndC2C: 1 << 25,
}

const QQ_MODULE_IDENTITY = {
  id: 'qq-bot-runtime',
  kind: 'plugin',
  plugin: {
    id: 'qq-bot',
    version: '0.1.0',
  },
}

interface QQAdapterConfig {
  airiToken?: string
  airiUrl?: string
  qqToken?: string
}

interface QQModuleConfig {
  enabled?: boolean
  method?: 'official' | 'napcat'
  officialToken?: string
  voiceReplyMode?: QQVoiceReplyMode
  tts?: QQTtsConfig
}

type QQVoiceReplyMode = 'text' | 'voice' | 'both'

interface QQTtsConfig {
  providerId: string
  providerConfig?: Record<string, unknown>
  model: string
  voice: string
  outputFormat?: 'mp3' | 'wav' | 'flac' | 'silk'
  speed?: number
  pitch?: number
}

interface QQTokenResponse {
  access_token: string
  expires_in: number
}

interface QQGatewayResponse {
  url: string
}

interface QQGatewayPayload {
  op: number
  d?: unknown
  s?: number
  t?: string
}

interface QQUser {
  id?: string
  username?: string
  bot?: boolean
  user_openid?: string
  member_openid?: string
}

interface QQMessageBase {
  id: string
  content: string
  timestamp: string
  author: QQUser
}

interface QQC2CMessage extends QQMessageBase {
  author: QQUser & { user_openid: string }
}

interface QQGroupAtMessage extends QQMessageBase {
  group_openid: string
  author: QQUser & { member_openid: string }
}

interface QQChannelAtMessage extends QQMessageBase {
  channel_id: string
  guild_id?: string
}

interface QQInputContext {
  kind: 'c2c' | 'group' | 'channel'
  messageId: string
  userOpenId?: string
  groupOpenId?: string
  channelId?: string
  guildId?: string
}

interface QQAuthState {
  appId: string
  clientSecret: string
  accessToken: string
  expiresAt: number
}

interface AiriOutputInputData {
  qq?: QQInputContext
  sourceTags?: string[]
  overrides?: {
    sessionId?: string
  }
}

interface AiriOutputEventData {
  'message'?: unknown
  'qq'?: QQInputContext
  'sourceTags'?: string[]
  'overrides'?: {
    sessionId?: string
  }
  'gen-ai:chat'?: {
    input?: {
      data?: AiriOutputInputData
    }
  }
}

function isQQModuleConfig(config: unknown): config is QQModuleConfig {
  if (typeof config !== 'object' || config === null)
    return false

  const c = config as Record<string, unknown>
  const enabledOk = typeof c.enabled === 'boolean' || typeof c.enabled === 'undefined'
  const methodOk = c.method === 'official' || c.method === 'napcat' || typeof c.method === 'undefined'
  const tokenOk = typeof c.officialToken === 'string' || typeof c.officialToken === 'undefined'
  const voiceReplyModeOk = c.voiceReplyMode === 'text' || c.voiceReplyMode === 'voice' || c.voiceReplyMode === 'both' || typeof c.voiceReplyMode === 'undefined'
  const ttsOk = typeof c.tts === 'undefined' || isQQTtsConfig(c.tts)
  return enabledOk && methodOk && tokenOk && voiceReplyModeOk && ttsOk
}

function isQQTtsConfig(value: unknown): value is QQTtsConfig {
  if (typeof value !== 'object' || value === null)
    return false
  const v = value as Record<string, unknown>
  const providerOk = typeof v.providerId === 'string' && v.providerId.trim().length > 0
  const modelOk = typeof v.model === 'string' && v.model.trim().length > 0
  const voiceOk = typeof v.voice === 'string' && v.voice.trim().length > 0
  const providerConfigOk = typeof v.providerConfig === 'undefined' || (typeof v.providerConfig === 'object' && v.providerConfig !== null)
  const outputOk = typeof v.outputFormat === 'undefined' || v.outputFormat === 'mp3' || v.outputFormat === 'wav' || v.outputFormat === 'flac' || v.outputFormat === 'silk'
  const speedOk = typeof v.speed === 'undefined' || typeof v.speed === 'number'
  const pitchOk = typeof v.pitch === 'undefined' || typeof v.pitch === 'number'
  return providerOk && modelOk && voiceOk && providerConfigOk && outputOk && speedOk && pitchOk
}

function parseOfficialToken(rawToken: string): { appId: string, clientSecret: string } | null {
  const token = rawToken.trim()
  if (!token)
    return null

  const [appId, clientSecret, ...rest] = token.split(':')
  if (rest.length > 0 || !appId?.trim() || !clientSecret?.trim())
    return null

  return {
    appId: appId.trim(),
    clientSecret: clientSecret.trim(),
  }
}

function getMessageContent(message: unknown): string {
  if (typeof message === 'string')
    return message
  if (typeof message !== 'object' || !message)
    return ''

  const m = message as { content?: unknown, text?: unknown }
  if (typeof m.text === 'string' && m.text.trim())
    return m.text
  if (typeof m.content === 'string')
    return m.content
  if (Array.isArray(m.content)) {
    return m.content
      .map((part: any) => {
        if (typeof part === 'string')
          return part
        if (part && typeof part === 'object') {
          if (typeof part.text === 'string')
            return part.text
          if (typeof part.content === 'string')
            return part.content
        }
        return ''
      })
      .filter(Boolean)
      .join('')
  }
  return ''
}

function splitMessage(content: string, maxLength = 1900): string[] {
  if (content.length <= maxLength)
    return [content]

  const chunks: string[] = []
  let remaining = content

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining)
      break
    }

    let splitAt = remaining.lastIndexOf('\n', maxLength)
    if (splitAt <= 0 || splitAt < maxLength * 0.4)
      splitAt = remaining.lastIndexOf(' ', maxLength)
    if (splitAt <= 0 || splitAt < maxLength * 0.4)
      splitAt = maxLength

    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }

  return chunks
}

function createSessionIdByContext(context: QQInputContext): string {
  switch (context.kind) {
    case 'c2c':
      return `qq-c2c-${context.userOpenId ?? 'unknown'}`
    case 'group':
      return `qq-group-${context.groupOpenId ?? 'unknown'}`
    case 'channel':
      return `qq-channel-${context.channelId ?? 'unknown'}`
  }
}

function limitReplyChunks(chunks: string[], maxChunks: number): string[] {
  if (chunks.length <= maxChunks)
    return chunks

  const limited = chunks.slice(0, maxChunks)
  const last = limited[limited.length - 1] ?? ''
  limited[limited.length - 1] = `${last.trimEnd()}\n…（后续内容已截断）`.slice(0, 1900)
  return limited
}

type AudioFormat = 'mp3' | 'wav' | 'flac' | 'silk' | 'unknown'

function detectAudioFormat(buffer: Buffer): AudioFormat {
  if (buffer.length >= 12) {
    const header4 = buffer.subarray(0, 4).toString('ascii')
    if (header4 === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE')
      return 'wav'
    if (header4 === 'fLaC')
      return 'flac'
    if (header4 === 'SILK')
      return 'silk'
    if (header4 === 'ID3')
      return 'mp3'
  }

  if (buffer.length >= 2) {
    const b0 = buffer[0]
    const b1 = buffer[1]
    if (b0 === 0xFF && (b1 & 0xE0) === 0xE0)
      return 'mp3'
  }

  return 'unknown'
}

function createStableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16)
}

class Semaphore {
  private active = 0
  private readonly queue: Array<() => void> = []

  constructor(private readonly limit: number) { }

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1
      return () => this.release()
    }

    await new Promise<void>((resolve) => {
      this.queue.push(() => resolve())
    })

    this.active += 1
    return () => this.release()
  }

  private release() {
    this.active = Math.max(0, this.active - 1)
    const next = this.queue.shift()
    if (next)
      next()
  }
}

export class QQAdapter {
  private readonly airiClient: ServerChannel
  private gatewaySocket: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectBackoffMs = 1000
  private lastSequence: number | null = null
  private isStopping = false
  private isGatewayConnecting = false
  private gatewayReady = false
  private moduleEnabled = false
  private method: 'official' | 'napcat' = 'official'
  private configuredToken = ''
  private authState: QQAuthState | null = null
  private voiceReplyMode: QQVoiceReplyMode = 'text'
  private ttsConfig: QQTtsConfig | null = null
  private readonly ttsProviderCache = new Map<string, any>()
  private readonly voiceSendQueueByMessage = new Map<string, Promise<void>>()
  private readonly ttsSemaphore = new Semaphore(2)
  private readonly tempAudioDir = join(tmpdir(), 'airi-qq-tts')
  private readonly qqContextBySessionId = new Map<string, QQInputContext>()
  private readonly replySeqByMessageId = new Map<string, number>()
  private readonly recentlySentFingerprints = new Map<string, number>()
  private readonly recentlyForwardedMessageIds = new Map<string, number>()
  private readonly recentlyRepliedMessageIds = new Map<string, number>()
  private readonly pendingAiriOutputFallbackByTurn = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(config: QQAdapterConfig) {
    this.configuredToken = config.qqToken?.trim() ?? ''
    this.authState = this.buildInitialAuthState(this.configuredToken)
    this.moduleEnabled = !!this.authState

    this.airiClient = new ServerChannel({
      name: 'qq',
      possibleEvents: [
        'input:text',
        'module:configure',
        'module:status',
        'output:gen-ai:chat:message',
        'output:gen-ai:chat:complete',
      ],
      token: config.airiToken,
      url: config.airiUrl,
      onError: (error) => {
        const message = error instanceof Error
          ? error.message
          : String(error)
        log.withError(error as Error).error('AIRI websocket error')
        this.emitModuleStatus('failed', `AIRI websocket error: ${message}`)
      },
      onClose: () => {
        log.warn('AIRI websocket closed')
        this.emitModuleStatus('failed', 'AIRI websocket closed')
        this.scheduleReconnect()
      },
      onAnyMessage: (event) => {
        log.log(`[AIRI<-] ${event.type}`)
      },
      onAnySend: (event) => {
        log.log(`[AIRI->] ${event.type}`)
      },
    })

    this.setupEventHandlers()
  }

  private buildInitialAuthState(rawToken: string): QQAuthState | null {
    const parsed = parseOfficialToken(rawToken)
    if (!parsed)
      return null

    return {
      appId: parsed.appId,
      clientSecret: parsed.clientSecret,
      accessToken: '',
      expiresAt: 0,
    }
  }

  private setupEventHandlers(): void {
    this.airiClient.onEvent('module:authenticated', (event) => {
      log.log(`AIRI websocket authenticated=${event.data.authenticated}`)
      if (event.data.authenticated) {
        this.emitModuleStatus('preparing', 'AIRI websocket connected')
      }
    })

    this.airiClient.onEvent('module:configure', async (event) => {
      if (!isQQModuleConfig(event.data.config)) {
        log.warn('Ignored invalid QQ module configuration payload.')
        this.emitModuleStatus('failed', 'Invalid QQ module configuration payload')
        return
      }

      await this.applyConfiguration(event.data.config)
    })

    this.airiClient.onEvent('output:gen-ai:chat:message', async (event) => {
      await this.handleAiriOutput(event as any)
    })

    this.airiClient.onEvent('output:gen-ai:chat:complete', async (event) => {
      await this.handleAiriOutput(event as any)
    })
  }

  private emitModuleStatus(phase: 'preparing' | 'configured' | 'ready' | 'failed', reason?: string, details?: Record<string, unknown>) {
    this.airiClient.send({
      type: 'module:status',
      data: {
        identity: QQ_MODULE_IDENTITY,
        phase,
        reason,
        details,
      },
    } as WebSocketEvent)
  }

  private async applyConfiguration(config: QQModuleConfig): Promise<void> {
    log.log(`Received QQ module config: enabled=${config.enabled !== false}, method=${config.method ?? 'official'}, hasOfficialToken=${Boolean(config.officialToken?.trim())}`)
    this.moduleEnabled = config.enabled !== false
    this.method = config.method ?? 'official'
    this.configuredToken = config.officialToken?.trim() ?? ''
    this.voiceReplyMode = config.voiceReplyMode ?? 'text'
    this.ttsConfig = config.tts ?? null

    if (!this.moduleEnabled) {
      log.log('QQ module disabled by configuration.')
      this.emitModuleStatus('configured', 'QQ module disabled')
      this.gatewayReady = false
      await this.disconnectGateway()
      return
    }

    if (this.method !== 'official') {
      log.warn('QQ module is configured with NapCat method. Official adapter will stay idle.')
      this.emitModuleStatus('configured', 'NapCat mode selected, official runtime idle')
      this.gatewayReady = false
      await this.disconnectGateway()
      return
    }

    const parsed = parseOfficialToken(this.configuredToken)
    if (!parsed) {
      log.warn('QQ official token missing or invalid. Expected format: AppID:AppSecret')
      this.emitModuleStatus('failed', 'QQ official token missing or invalid. Expected format: AppID:AppSecret')
      await this.disconnectGateway()
      return
    }

    this.authState = {
      appId: parsed.appId,
      clientSecret: parsed.clientSecret,
      accessToken: '',
      expiresAt: 0,
    }

    log.log(`QQ official credentials loaded: appId=${parsed.appId}`)
    this.emitModuleStatus('configured', 'QQ official credentials accepted')
    await this.connectGateway()
  }

  private async ensureAccessToken(): Promise<string> {
    if (!this.authState)
      throw new Error('QQ auth state unavailable')

    const now = Date.now()
    if (this.authState.accessToken && now < this.authState.expiresAt - 60_000) {
      log.log(`Reuse QQ access token (appId=${this.authState.appId})`)
      return this.authState.accessToken
    }

    log.log(`Refreshing QQ access token (appId=${this.authState.appId})`)

    const response = await fetch(QQ_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appId: this.authState.appId,
        clientSecret: this.authState.clientSecret,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Failed to fetch QQ access token (${response.status}): ${text.slice(0, 300)}`)
    }

    const tokenBody = await response.json() as QQTokenResponse
    if (!tokenBody.access_token)
      throw new Error('QQ access token response is missing access_token')

    this.authState.accessToken = tokenBody.access_token
    this.authState.expiresAt = Date.now() + (tokenBody.expires_in || 7200) * 1000
    log.log(`QQ access token refreshed, expiresAt=${new Date(this.authState.expiresAt).toISOString()}`)
    return this.authState.accessToken
  }

  private async requestGatewayUrl(accessToken: string): Promise<string> {
    if (!this.authState?.appId)
      throw new Error('QQ auth state unavailable: missing appId for gateway request')

    const headerStrategies: Array<Record<string, string>> = [
      {
        'Authorization': `QQBot ${accessToken}`,
        'X-Union-Appid': this.authState.appId,
      },
      {
        'Authorization': `QQBot ${this.authState.appId}.${accessToken}`,
        'X-Union-Appid': this.authState.appId,
      },
      {
        Authorization: `QQBot ${accessToken}`,
      },
      {
        Authorization: `QQBot ${this.authState.appId}.${accessToken}`,
      },
    ]

    let lastError = ''
    for (const headers of headerStrategies) {
      const response = await fetch(QQ_GATEWAY_ENDPOINT, {
        method: 'GET',
        headers,
      })

      if (response.ok) {
        const data = await response.json() as QQGatewayResponse
        if (!data.url)
          throw new Error('QQ gateway response missing URL')
        return data.url
      }

      const text = await response.text()
      lastError = `Failed to fetch QQ gateway URL (${response.status}): ${text.slice(0, 300)}`
      log.warn(`${lastError}, trying gateway auth fallback`)
    }

    throw new Error(`${lastError} (all gateway auth strategies failed)`)
  }

  private async connectGateway(): Promise<void> {
    if (this.isStopping || !this.moduleEnabled || this.method !== 'official')
      return
    if (this.isGatewayConnecting)
      return
    if (this.gatewaySocket?.readyState === WebSocket.OPEN) {
      if (this.gatewayReady)
        this.emitModuleStatus('ready', 'QQ gateway connected and AIRI websocket connected')
      return
    }
    if (!this.authState)
      return

    this.isGatewayConnecting = true
    log.log(`Connecting QQ gateway (appId=${this.authState.appId})...`)
    try {
      const accessToken = await this.ensureAccessToken()
      const gatewayUrl = await this.requestGatewayUrl(accessToken)
      log.log(`QQ gateway url received: ${gatewayUrl}`)
      await this.openSocket(gatewayUrl)
      this.reconnectBackoffMs = 1000
    }
    catch (error) {
      log.withError(error as Error).error('Failed to connect QQ gateway')
      this.emitModuleStatus('failed', error instanceof Error ? error.message : String(error))
      this.scheduleReconnect()
    }
    finally {
      this.isGatewayConnecting = false
    }
  }

  private async openSocket(gatewayUrl: string): Promise<void> {
    if (!this.authState)
      return

    await this.disconnectGateway()

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(gatewayUrl)
      this.gatewaySocket = socket

      socket.once('open', () => {
        log.log('QQ gateway websocket connected')
        resolve()
      })

      socket.once('error', (error) => {
        reject(error)
      })

      socket.on('message', async (raw) => {
        try {
          const payload = JSON.parse(raw.toString()) as QQGatewayPayload
          log.log(`[QQ<-] op=${payload.op} t=${payload.t ?? 'N/A'} s=${payload.s ?? 'N/A'}`)
          await this.handleGatewayPayload(payload)
        }
        catch (error) {
          log.withError(error as Error).error('Failed to process QQ gateway payload')
        }
      })

      socket.on('close', () => {
        log.warn('QQ gateway websocket closed')
        this.cleanupSocketState()
        if (!this.isStopping)
          this.scheduleReconnect()
      })

      socket.on('error', (error) => {
        log.withError(error as Error).error('QQ gateway socket error')
      })
    })
  }

  private cleanupSocketState(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    this.gatewaySocket = null
    this.gatewayReady = false
  }

  private scheduleReconnect(): void {
    if (this.isStopping || !this.moduleEnabled || this.method !== 'official')
      return

    if (this.reconnectTimer)
      clearTimeout(this.reconnectTimer)

    const delay = this.reconnectBackoffMs
    this.reconnectBackoffMs = Math.min(this.reconnectBackoffMs * 2, 30_000)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connectGateway()
    }, delay)

    log.warn(`QQ gateway reconnect scheduled in ${delay}ms`)
  }

  private async handleGatewayPayload(payload: QQGatewayPayload): Promise<void> {
    const { op, d, s, t } = payload
    if (typeof s === 'number')
      this.lastSequence = s

    if (!this.authState)
      return

    if (op === 10) {
      const hello = d as { heartbeat_interval?: number } | undefined
      log.log(`QQ hello received, heartbeat_interval=${hello?.heartbeat_interval ?? 30_000}`)
      this.sendToGateway({
        op: 2,
        d: {
          token: `QQBot ${this.authState.accessToken}`,
          intents: QQ_INTENTS.groupAndC2C | QQ_INTENTS.directMessage | QQ_INTENTS.guildPublicMessage,
          shard: [0, 1],
        },
      })

      if (this.heartbeatTimer)
        clearInterval(this.heartbeatTimer)

      const heartbeatInterval = hello?.heartbeat_interval ?? 30_000
      this.heartbeatTimer = setInterval(() => {
        this.sendToGateway({ op: 1, d: this.lastSequence })
      }, heartbeatInterval)
      return
    }

    if (op === 7 || op === 9) {
      log.warn(`QQ gateway reconnect requested, op=${op}`)
      await this.disconnectGateway()
      this.scheduleReconnect()
      return
    }

    if (op !== 0 || !t)
      return

    switch (t) {
      case 'READY':
        log.log('QQ gateway session is ready')
        this.gatewayReady = true
        this.emitModuleStatus('ready', 'QQ gateway connected and AIRI websocket connected')
        return
      case 'C2C_MESSAGE_CREATE':
        await this.handleC2CMessage(d as QQC2CMessage)
        return
      case 'GROUP_AT_MESSAGE_CREATE':
        await this.handleGroupAtMessage(d as QQGroupAtMessage)
        return
      case 'AT_MESSAGE_CREATE': {
        await this.handleChannelAtMessage(d as QQChannelAtMessage)
        break
      }
      default: {
        break
      }
    }
  }

  private sendToGateway(payload: Record<string, unknown>): void {
    if (!this.gatewaySocket || this.gatewaySocket.readyState !== WebSocket.OPEN)
      return

    log.log(`[QQ->] op=${String(payload.op ?? 'N/A')}`)
    this.gatewaySocket.send(JSON.stringify(payload))
  }

  private cleanMentionContent(text: string): string {
    return text.replace(/<@!?\d+>/g, '').trim()
  }

  private markRecent(map: Map<string, number>, key: string, ttlMs: number) {
    const now = Date.now()
    for (const [k, ts] of map.entries()) {
      if (now - ts > ttlMs) {
        map.delete(k)
      }
    }

    const ts = map.get(key)
    if (typeof ts === 'number' && now - ts <= ttlMs) {
      return true
    }

    map.set(key, now)
    return false
  }

  private isDuplicateInboundMessage(context: QQInputContext) {
    const key = `${context.kind}:${context.messageId}`
    return this.markRecent(this.recentlyForwardedMessageIds, key, 2 * 60_000)
  }

  private isDuplicateTurnReply(context: QQInputContext) {
    const key = `${context.kind}:${context.messageId}`
    return this.markRecent(this.recentlyRepliedMessageIds, key, 10 * 60_000)
  }

  private clearAiriOutputFallback(context: QQInputContext) {
    const turnKey = `${context.kind}:${context.messageId}`
    const timer = this.pendingAiriOutputFallbackByTurn.get(turnKey)
    if (!timer)
      return

    clearTimeout(timer)
    this.pendingAiriOutputFallbackByTurn.delete(turnKey)
  }

  private clearAllAiriOutputFallbacks() {
    for (const timer of this.pendingAiriOutputFallbackByTurn.values()) {
      clearTimeout(timer)
    }
    this.pendingAiriOutputFallbackByTurn.clear()
  }

  private sendInputEventToAiri(params: {
    content: string
    rawContent: string
    context: QQInputContext
    senderDisplayName: string
    sessionId: string
    useAnycastRoute: boolean
  }) {
    const { content, rawContent, context, senderDisplayName, sessionId, useAnycastRoute } = params
    const contextNotice = `Source: QQ (${context.kind}), messageId=${context.messageId}.`

    this.airiClient.send({
      type: 'input:text',
      route: useAnycastRoute
        ? {
            destinations: [
              `plugin:${WebSocketEventSource.StageTamagotchi}`,
              `plugin:${WebSocketEventSource.StageWeb}`,
            ],
            strategy: 'anycast',
          }
        : undefined,
      data: {
        text: content,
        textRaw: rawContent,
        overrides: {
          sessionId,
          messagePrefix: `[QQ:${senderDisplayName}] `,
        },
        contextUpdates: [{
          strategy: ContextUpdateStrategy.AppendSelf,
          text: contextNotice,
          content: contextNotice,
          metadata: {
            qq: context,
          },
        }],
        qq: context,
        sourceTags: ['qq'],
      } as any,
    } as any)
  }

  private scheduleAiriOutputFallback(params: {
    content: string
    rawContent: string
    context: QQInputContext
    senderDisplayName: string
    sessionId: string
  }) {
    const turnKey = `${params.context.kind}:${params.context.messageId}`
    this.clearAiriOutputFallback(params.context)

    const timer = setTimeout(() => {
      this.pendingAiriOutputFallbackByTurn.delete(turnKey)
      log.warn(`No AIRI output in ${QQ_AIRI_OUTPUT_TIMEOUT_MS}ms, retrying QQ input once with broadcast route: kind=${params.context.kind}, messageId=${params.context.messageId}, sessionId=${params.sessionId}`)
      this.sendInputEventToAiri({
        ...params,
        useAnycastRoute: false,
      })
    }, QQ_AIRI_OUTPUT_TIMEOUT_MS)

    this.pendingAiriOutputFallbackByTurn.set(turnKey, timer)
  }

  private async handleC2CMessage(event: QQC2CMessage): Promise<void> {
    const userOpenId = event.author?.user_openid
    if (!userOpenId)
      return

    const text = event.content?.trim()
    if (!text)
      return

    const context: QQInputContext = {
      kind: 'c2c',
      messageId: event.id,
      userOpenId,
    }
    log.log(`Received QQ C2C message: messageId=${event.id}, userOpenId=${userOpenId}, len=${text.length}`)
    await this.sendInputToAiri({
      content: text,
      rawContent: event.content,
      context,
      senderDisplayName: event.author?.username ?? 'QQ User',
    })
  }

  private async handleGroupAtMessage(event: QQGroupAtMessage): Promise<void> {
    if (event.author?.bot)
      return

    const groupOpenId = event.group_openid
    if (!groupOpenId)
      return

    const content = this.cleanMentionContent(event.content)
    if (!content)
      return

    const context: QQInputContext = {
      kind: 'group',
      messageId: event.id,
      groupOpenId,
      userOpenId: event.author?.member_openid,
    }
    log.log(`Received QQ Group@ message: messageId=${event.id}, groupOpenId=${groupOpenId}, len=${content.length}`)
    await this.sendInputToAiri({
      content,
      rawContent: event.content,
      context,
      senderDisplayName: event.author?.username ?? 'QQ Group User',
    })
  }

  private async handleChannelAtMessage(event: QQChannelAtMessage): Promise<void> {
    if (event.author?.bot)
      return

    const channelId = event.channel_id
    if (!channelId)
      return

    const content = this.cleanMentionContent(event.content)
    if (!content)
      return

    const context: QQInputContext = {
      kind: 'channel',
      messageId: event.id,
      channelId,
      guildId: event.guild_id,
      userOpenId: event.author?.id,
    }
    log.log(`Received QQ Channel@ message: messageId=${event.id}, channelId=${channelId}, len=${content.length}`)
    await this.sendInputToAiri({
      content,
      rawContent: event.content,
      context,
      senderDisplayName: event.author?.username ?? 'QQ Channel User',
    })
  }

  private async sendInputToAiri(params: {
    content: string
    rawContent: string
    context: QQInputContext
    senderDisplayName: string
  }): Promise<void> {
    const { content, rawContent, context, senderDisplayName } = params
    if (this.isDuplicateInboundMessage(context)) {
      log.warn(`Skipped duplicate QQ inbound message: kind=${context.kind}, messageId=${context.messageId}`)
      return
    }

    const sessionId = createSessionIdByContext(context)
    const outboundText = content.trim()
    this.qqContextBySessionId.set(sessionId, context)
    log.log(`[QQ->AIRI:text] ${outboundText || '00000'}`)
    log.log(`Forwarding QQ message to AIRI: kind=${context.kind}, sessionId=${sessionId}, messageId=${context.messageId}`)
    this.sendInputEventToAiri({
      content: outboundText,
      rawContent,
      context,
      senderDisplayName,
      sessionId,
      useAnycastRoute: true,
    })
    this.scheduleAiriOutputFallback({
      content: outboundText,
      rawContent,
      context,
      senderDisplayName,
      sessionId,
    })
  }

  private async handleAiriOutput(event: {
    data: AiriOutputEventData
  }): Promise<void> {
    if (!this.moduleEnabled || this.method !== 'official')
      return

    const outputInputData = event.data['gen-ai:chat']?.input?.data
    const sourceTags = [
      ...(Array.isArray(outputInputData?.sourceTags) ? outputInputData.sourceTags : []),
      ...(Array.isArray(event.data.sourceTags) ? event.data.sourceTags : []),
    ]
    const sessionId = outputInputData?.overrides?.sessionId ?? event.data.overrides?.sessionId
    const qqContext = outputInputData?.qq
      ?? event.data.qq
      ?? (sessionId?.startsWith('qq-') ? this.qqContextBySessionId.get(sessionId) : undefined)
    const isQqOutput = sourceTags.includes('qq') || Boolean(outputInputData?.qq) || Boolean(event.data.qq) || Boolean(sessionId?.startsWith('qq-'))
    if (!isQqOutput)
      return

    if (!qqContext) {
      log.warn(`Skipped AIRI output for QQ: context missing (sessionId=${sessionId ?? 'none'})`)
      return
    }

    this.clearAiriOutputFallback(qqContext)

    const content = getMessageContent(event.data.message).trim()
    if (!content)
      return

    log.log(`[AIRI->QQ:text] ${content}`)

    const turnKey = `${qqContext.kind}:${qqContext.messageId}`
    if (this.markRecent(this.recentlyRepliedMessageIds, turnKey, 10 * 60_000)) {
      log.warn(`Skipped duplicate AIRI reply turn for QQ: kind=${qqContext.kind}, messageId=${qqContext.messageId}`)
      return
    }

    const replyFingerprint = `${qqContext.kind}:${qqContext.messageId}:${content}`
    if (this.isDuplicateReply(replyFingerprint)) {
      log.warn(`Skipped duplicate AIRI reply for QQ: kind=${qqContext.kind}, messageId=${qqContext.messageId}`)
      return
    }

    try {
      log.debug('[AIRI<-] output:text', { text: content })
      log.log(`Received AIRI reply for QQ: kind=${qqContext.kind}, messageId=${qqContext.messageId}, len=${content.length}`)
      const accessToken = await this.ensureAccessToken()
      const chunks = limitReplyChunks(splitMessage(content), 5)
      log.log(`Sending QQ reply in ${chunks.length} chunk(s)`)
      for (const chunk of chunks) {
        await this.sendQQReply(accessToken, qqContext, chunk)
      }
    }
    catch (error) {
      this.recentlyRepliedMessageIds.delete(turnKey)
      log.withError(error as Error).error('[AIRI<-] output:error', error)
    }
  }

  private async sendQQReply(accessToken: string, context: QQInputContext, content: string): Promise<void> {
    const normalizedContent = content.trim()
    if (!normalizedContent)
      return

    const mode = this.voiceReplyMode
    const wantsText = mode === 'text' || mode === 'both'
    const wantsVoice = mode === 'voice' || mode === 'both'

    if (wantsText) {
      await this.sendQQText(accessToken, context, normalizedContent)
    }

    if (!wantsVoice)
      return

    const key = `${context.kind}:${context.messageId}`
    void this.enqueueVoiceSend(key, async () => {
      await this.generateAndSendVoiceOrFallback(accessToken, context, normalizedContent, mode)
    })
  }

  private enqueueVoiceSend(key: string, task: () => Promise<void>): Promise<void> {
    const prev = this.voiceSendQueueByMessage.get(key) ?? Promise.resolve()
    const next = prev.catch(() => { }).then(task)
    this.voiceSendQueueByMessage.set(key, next)
    void next.finally(() => {
      if (this.voiceSendQueueByMessage.get(key) === next)
        this.voiceSendQueueByMessage.delete(key)
    })
    return next
  }

  private async generateAndSendVoiceOrFallback(accessToken: string, context: QQInputContext, content: string, mode: QQVoiceReplyMode): Promise<void> {
    const replyFingerprint = `voice:${context.kind}:${context.messageId}:${content}`
    if (this.isDuplicateReply(replyFingerprint))
      return

    if (!this.ttsConfig) {
      log.warn('[tts] skipped: tts config missing, fallback to text')
      if (mode === 'voice')
        await this.sendQQText(accessToken, context, content)
      return
    }

    if (context.kind === 'channel') {
      log.warn('[tts] skipped: rich media voice not supported in channel, fallback to text')
      if (mode === 'voice')
        await this.sendQQText(accessToken, context, content)
      return
    }

    const release = await this.ttsSemaphore.acquire()
    try {
      log.log('[tts] generating')
      const audio = await this.generateSpeechAudio(content, this.ttsConfig)
      if (!audio) {
        log.warn('未配置tts语音模块，不进行语音的发送')
        if (mode === 'voice')
          await this.sendQQText(accessToken, context, content)
        return
      }

      log.log('[tts] generated')
      await this.sendQQVoice(accessToken, context, audio)
      log.log('[tts] sent')
    }
    catch (error) {
      log.withError(error as Error).warn('[tts] failed')
      if (mode === 'voice') {
        try {
          await this.sendQQText(accessToken, context, content)
        }
        catch (fallbackError) {
          log.withError(fallbackError as Error).error('[tts] fallback:text failed')
        }
      }
    }
    finally {
      release()
    }
  }

  private async generateSpeechAudio(text: string, config: QQTtsConfig): Promise<Buffer | null> {
    const provider = await this.getOrCreateTtsProvider(config)
    if (!provider || typeof provider.speech !== 'function')
      return null

    const providerConfig = config.providerConfig ?? {}
    const outputFormat = config.outputFormat ?? (detectAudioFormatFromProviderConfig(providerConfig) ?? undefined)
    const speechOptions: Record<string, unknown> = {
      ...providerConfig,
      ...(typeof config.speed === 'number' ? { speed: config.speed } : {}),
      ...(typeof config.pitch === 'number' ? { pitch: config.pitch } : {}),
      ...(outputFormat ? { response_format: outputFormat } : {}),
    }

    const result = await generateSpeech({
      ...provider.speech(config.model, speechOptions),
      input: text,
      voice: config.voice,
    } as any)

    const buf = Buffer.from(result)
    const format = detectAudioFormat(buf)
    const ext = (format === 'unknown' ? (outputFormat ?? 'mp3') : format)
    try {
      const filePath = await this.writeTempAudioFile(buf, ext)
      await this.safeUnlink(filePath)
    }
    catch { }
    return buf
  }

  private async getOrCreateTtsProvider(config: QQTtsConfig): Promise<any | null> {
    const cacheKey = `${config.providerId}:${createStableHash(config.providerConfig)}`
    if (this.ttsProviderCache.has(cacheKey))
      return this.ttsProviderCache.get(cacheKey)

    const providerId = config.providerId
    const providerConfig = config.providerConfig ?? {}

    let provider: any | null = null
    const apiKey = typeof providerConfig.apiKey === 'string' ? providerConfig.apiKey.trim() : ''
    const baseUrlRaw = typeof providerConfig.baseUrl === 'string' ? providerConfig.baseUrl.trim() : ''
    const baseUrl = baseUrlRaw && baseUrlRaw.endsWith('/') ? baseUrlRaw : (baseUrlRaw ? `${baseUrlRaw}/` : '')

    if (providerId === 'openai-audio-speech' || providerId === 'openai-compatible-audio-speech' || providerId === 'app-local-audio-speech' || providerId === 'browser-local-audio-speech') {
      if (!apiKey || !baseUrl)
        return null
      provider = await createOpenAI(apiKey, baseUrl)
    }
    else if (providerId === 'elevenlabs') {
      if (!apiKey || !baseUrl)
        return null
      provider = createUnElevenLabs(apiKey, baseUrl)
    }
    else if (providerId === 'deepgram-tts') {
      if (!apiKey || !baseUrl)
        return null
      provider = createUnDeepgram(apiKey, baseUrl)
    }
    else if (providerId === 'microsoft-speech' || providerId === 'azure-speech') {
      if (!apiKey || !baseUrl)
        return null
      provider = createUnMicrosoft(apiKey, baseUrl)
    }
    else if (providerId === 'alibaba-cloud-model-studio') {
      if (!apiKey || !baseUrl)
        return null
      provider = createUnAlibabaCloud(apiKey, baseUrl)
    }
    else if (providerId === 'volcengine') {
      if (!apiKey || !baseUrl)
        return null
      provider = createUnVolcengine(apiKey, baseUrl)
    }
    else {
      return null
    }

    this.ttsProviderCache.set(cacheKey, provider)
    return provider
  }

  private async writeTempAudioFile(buffer: Buffer, ext: string): Promise<string> {
    await mkdir(this.tempAudioDir, { recursive: true })
    const fileName = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
    const filePath = join(this.tempAudioDir, fileName)
    await writeFile(filePath, buffer)
    return filePath
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await unlink(filePath)
    }
    catch { }
  }

  private async cleanupTempAudioFiles(maxAgeMs = 6 * 60 * 60 * 1000): Promise<void> {
    try {
      const entries = await readdir(this.tempAudioDir)
      const now = Date.now()
      await Promise.all(entries.map(async (entry) => {
        const full = join(this.tempAudioDir, entry)
        try {
          const s = await stat(full)
          if (now - s.mtimeMs > maxAgeMs)
            await unlink(full)
        }
        catch { }
      }))
    }
    catch { }
  }

  private async sendQQVoice(accessToken: string, context: QQInputContext, audio: Buffer): Promise<void> {
    if (context.kind === 'c2c' && !context.userOpenId)
      throw new Error('QQ voice send failed: missing userOpenId')
    if (context.kind === 'group' && !context.groupOpenId)
      throw new Error('QQ voice send failed: missing groupOpenId')

    const base64 = audio.toString('base64')
    const uploadPath = context.kind === 'c2c'
      ? `/v2/users/${context.userOpenId}/files`
      : `/v2/groups/${context.groupOpenId}/files`

    const upload = await this.qqApiRequestJson<{ file_info?: string }>(accessToken, 'POST', uploadPath, {
      file_type: 3,
      srv_send_msg: false,
      file_data: base64,
    })

    const fileInfo = upload?.file_info
    if (!fileInfo)
      throw new Error('QQ upload returned empty file_info')

    const msgPath = context.kind === 'c2c'
      ? `/v2/users/${context.userOpenId}/messages`
      : `/v2/groups/${context.groupOpenId}/messages`

    const msgSeq = this.nextReplySeq(context)
    await this.qqApiRequest(accessToken, 'POST', msgPath, {
      msg_type: 7,
      msg_seq: msgSeq,
      msg_id: context.messageId,
      media: {
        file_info: fileInfo,
      },
    })
  }

  private async qqApiRequestJson<T>(accessToken: string, method: 'POST' | 'GET', path: string, body?: unknown): Promise<T> {
    if (!this.authState?.appId) {
      throw new Error('QQ auth state unavailable: missing appId for OpenAPI request')
    }

    const headerStrategies: Array<Record<string, string>> = [
      {
        'Authorization': `QQBot ${accessToken}`,
        'X-Union-Appid': this.authState.appId,
      },
      {
        'Authorization': `QQBot ${this.authState.appId}.${accessToken}`,
        'X-Union-Appid': this.authState.appId,
      },
      {
        Authorization: `QQBot ${accessToken}`,
      },
      {
        Authorization: `QQBot ${this.authState.appId}.${accessToken}`,
      },
    ]

    let lastError = ''
    for (const headers of headerStrategies) {
      const options: RequestInit = {
        method,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      }

      if (method !== 'GET' && body !== undefined)
        options.body = JSON.stringify(body)

      const response = await fetch(`${QQ_API_BASE_URL}${path}`, options)
      if (response.ok) {
        return await response.json() as T
      }

      const text = await response.text()
      lastError = `QQ API error (${method} ${path} ${response.status}): ${text.slice(0, 300)}`
      log.warn(`${lastError}, trying API auth fallback`)
    }

    throw new Error(`${lastError} (all API auth strategies failed)`)
  }

  private async sendQQText(accessToken: string, context: QQInputContext, content: string): Promise<void> {
    const normalizedContent = content.trim()
    log.debug('[QQ:send:text] payload', { content: normalizedContent, context })
    log.log(`[QQ:send:text] ${normalizedContent || '正在进行文本发送至qq，当前文本字段为空，请检查openAI接口！'}`)
    if (!normalizedContent)
      return

    switch (context.kind) {
      case 'c2c':
        if (!context.userOpenId)
          return
        {
          const msgSeq = this.nextReplySeq(context)
          log.log(`正在进行文本私聊发送，这是调试日志 qq用户openid=${context.userOpenId}, 消息id=${context.messageId}, 序列id，消息去重=${msgSeq}, len=${normalizedContent.length}`)
          let ops: any = {
            content: normalizedContent,
            msg_type: 0,
            stream: {
              state: 10,
              index: 0,
            },
          }

          if (context.messageId) {
            ops = {
              ...ops,
              msg_seq: msgSeq,
              msg_id: context.messageId,
            }
          }
          await this.qqApiRequest(accessToken, 'POST', `/v2/users/${context.userOpenId}/messages`, ops)
        }
        log.log('QQ C2C message sent successfully')
        return
      case 'group':
        if (!context.groupOpenId)
          return
        {
          const msgSeq = this.nextReplySeq(context)
          log.log(`Sending QQ Group message: groupOpenId=${context.groupOpenId}, replyTo=${context.messageId}, seq=${msgSeq}, len=${normalizedContent.length}`)
          await this.qqApiRequest(accessToken, 'POST', `/v2/groups/${context.groupOpenId}/messages`, {
            content: normalizedContent,
            msg_type: 0,
            msg_seq: msgSeq,
            msg_id: context.messageId,
          })
        }
        log.log('QQ Group message sent successfully')
        return
      case 'channel':
        if (!context.channelId)
          return
        log.log(`Sending QQ Channel message: channelId=${context.channelId}, replyTo=${context.messageId}, len=${normalizedContent.length}`)
        await this.qqApiRequest(accessToken, 'POST', `/channels/${context.channelId}/messages`, {
          content: normalizedContent,
          msg_id: context.messageId,
        })
        log.log('QQ Channel message sent successfully')
    }
  }

  private isDuplicateReply(fingerprint: string): boolean {
    const now = Date.now()
    const expireBefore = now - 60_000

    for (const [key, at] of this.recentlySentFingerprints.entries()) {
      if (at < expireBefore)
        this.recentlySentFingerprints.delete(key)
    }

    if (this.recentlySentFingerprints.has(fingerprint))
      return true

    this.recentlySentFingerprints.set(fingerprint, now)
    return false
  }

  private nextReplySeq(context: QQInputContext): number {
    const key = `${context.kind}:${context.messageId}`
    const nextSeq = (this.replySeqByMessageId.get(key) ?? 0) + 1
    this.replySeqByMessageId.set(key, nextSeq)
    return nextSeq
  }

  private async qqApiRequest(accessToken: string, method: 'POST' | 'GET', path: string, body?: unknown): Promise<void> {
    if (!this.authState?.appId) {
      throw new Error('QQ auth state unavailable: missing appId for OpenAPI request')
    }

    const headerStrategies: Array<Record<string, string>> = [
      {
        'Authorization': `QQBot ${accessToken}`,
        'X-Union-Appid': this.authState.appId,
      },
      {
        'Authorization': `QQBot ${this.authState.appId}.${accessToken}`,
        'X-Union-Appid': this.authState.appId,
      },
      {
        Authorization: `QQBot ${accessToken}`,
      },
      {
        Authorization: `QQBot ${this.authState.appId}.${accessToken}`,
      },
    ]

    let lastError = ''
    for (const headers of headerStrategies) {
      const options: RequestInit = {
        method,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
      }

      if (method !== 'GET' && body !== undefined)
        options.body = JSON.stringify(body)

      const response = await fetch(`${QQ_API_BASE_URL}${path}`, options)
      if (response.ok)
        return

      const text = await response.text()
      lastError = `QQ API error (${method} ${path} ${response.status}): ${text.slice(0, 300)}`
      log.warn(`${lastError}, trying API auth fallback`)
    }

    throw new Error(`${lastError} (all API auth strategies failed)`)
  }

  private async disconnectGateway(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    if (this.gatewaySocket) {
      try {
        log.log('Closing QQ gateway websocket...')
        this.gatewaySocket.close()
      }
      catch (error) {
        log.withError(error as Error).warn('Failed to close QQ gateway socket cleanly')
      }
      this.gatewaySocket = null
    }
  }

  async start(): Promise<void> {
    log.log('Starting QQ official adapter...')
    await mkdir(this.tempAudioDir, { recursive: true })
    await this.cleanupTempAudioFiles()
    if (this.moduleEnabled && this.method === 'official' && this.authState) {
      await this.connectGateway()
    }
    else {
      log.warn('QQ official adapter is idle, waiting for module configuration.')
      this.emitModuleStatus('preparing', 'QQ adapter started, waiting for module configuration')
    }
  }

  async stop(): Promise<void> {
    this.isStopping = true
    this.clearAllAiriOutputFallbacks()
    await this.disconnectGateway()
    this.airiClient.close()
    log.log('QQ official adapter stopped')
  }
}

function detectAudioFormatFromProviderConfig(config: Record<string, unknown>): AudioFormat | null {
  const responseFormat = typeof config.response_format === 'string' ? config.response_format : ''
  const format = typeof config.format === 'string' ? config.format : ''
  const candidate = responseFormat || format
  if (candidate === 'mp3' || candidate === 'wav' || candidate === 'flac' || candidate === 'silk')
    return candidate
  return null
}

export async function runAdapter() {
  const adapter = new QQAdapter({
    qqToken: env.QQ_OFFICIAL_TOKEN || '',
    airiToken: env.AIRI_TOKEN || 'abcd',
    airiUrl: env.AIRI_URL || 'ws://localhost:6121/ws',
  })

  await adapter.start()

  async function gracefulShutdown(signal: string) {
    log.log(`Received ${signal}, shutting down QQ official adapter...`)
    await adapter.stop()
    process.exit(0)
  }

  process.on('SIGINT', async () => {
    await gracefulShutdown('SIGINT')
  })

  process.on('SIGTERM', async () => {
    await gracefulShutdown('SIGTERM')
  })
}
