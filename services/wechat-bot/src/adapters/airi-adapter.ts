import type { WebSocketEvent } from '@proj-airi/server-shared/types'
import type { WeixinMessage } from 'openilink-sdk-node'

import process from 'node:process'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import QRCode from 'qrcode'

import { useLogg } from '@guiiai/logg'
import { ContextUpdateStrategy, Client as ServerChannel } from '@proj-airi/server-sdk'
import { WebSocketEventSource } from '@proj-airi/server-shared/types'
import { createOpenAI } from '@xsai-ext/providers/create'
import { generateSpeech } from '@xsai/generate-speech'
import {
  buildCdnDownloadUrl,
  Client,
  ENCRYPT_AES128_ECB,
  extractText,
  ITEM_TYPE_IMAGE,
  ITEM_TYPE_VIDEO,
  ITEM_TYPE_VOICE,
  MEDIA_VOICE,
  mediaAesKeyHex,
  MESSAGE_STATE_FINISH,
  MESSAGE_TYPE_BOT,
  MESSAGE_TYPE_USER,
  NoContextTokenError,
} from 'openilink-sdk-node'
import { createUnAlibabaCloud, createUnDeepgram, createUnElevenLabs, createUnMicrosoft, createUnVolcengine } from 'unspeech'

const log = useLogg('WeChatAdapter').useGlobalConfig()

const WECHAT_MODULE_IDENTITY = {
  id: 'wechat-bot-runtime',
  kind: 'plugin' as const,
  plugin: {
    id: 'wechat-bot',
    version: '0.1.0',
  },
}

const MAX_WECHAT_REPLY_ITEMS = 5
const RECOMMENDED_WECHAT_TEXT_REPLY_ITEMS = 3
const MIN_REPLY_INTERVAL_MS = 1000
const MAX_REPLY_INTERVAL_MS = 3000
const WECHAT_MULTI_MESSAGE_STYLE_NOTICE = [
  '请模拟微信聊天中的真人聊天回复习惯。',
  `建议文本回复简短，不超过 ${RECOMMENDED_WECHAT_TEXT_REPLY_ITEMS} 个自然段；必要时可扩展到最多 ${MAX_WECHAT_REPLY_ITEMS} 段。`,
  '若拆分多条，请使用两个空行 (\\n\\n) 进行分段。',
  '不要输出任何像 [msg] 这样的控制标签。',
].join('\n')

interface PersistedWeChatSessionState {
  token: string
  baseUrl?: string
  botId?: string
  userId?: string
  updatesBuf?: string
  contextTokens?: Record<string, string>
  updatedAt: string
}

type WeChatVoiceReplyMode = 'text' | 'voice' | 'both'

interface WeChatMemeImageConfig {
  id: string
  name: string
  mimeType: string
  dataBase64: string
}

interface WeChatEmotionMemePackConfig {
  state: string
  images: WeChatMemeImageConfig[]
}

interface WeChatTtsConfig {
  providerId: string
  providerConfig?: Record<string, unknown>
  model: string
  voice: string
  outputFormat?: 'mp3' | 'wav' | 'flac' | 'silk'
  speed?: number
  pitch?: number
}

interface WeChatModuleConfig {
  enabled?: boolean
  voiceReplyMode?: WeChatVoiceReplyMode
  aiGirlfriendEnabled?: boolean
  memeProbability?: number
  emotionMemePacks?: WeChatEmotionMemePackConfig[]
  mainUserId?: string
  boundUserIds?: string[]
  tts?: WeChatTtsConfig
  vision?: WeChatVisionConfig
}

interface WeChatInputContext {
  userId: string
  messageId?: string
}

interface AiriOutputInputData {
  wechat?: WeChatInputContext
  sourceTags?: string[]
  overrides?: {
    sessionId?: string
  }
}

interface AiriOutputEventData {
  'message'?: unknown
  'toolCalls'?: unknown
  'wechat'?: WeChatInputContext
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

interface WeChatSkillDirective {
  name: string
  payload: Record<string, unknown>
}

interface WeChatVisionConfig {
  providerId?: string
  model?: string
  supportsImageInput?: boolean
  supportsVideoInput?: boolean
}

interface WeChatInboundMediaAttachment {
  kind: 'image' | 'video'
  url?: string
}

type AiriInputAttachmentPart
  = | {
    type: 'image_url'
    image_url: {
      detail?: 'auto' | 'high' | 'low'
      url: string
    }
  }
  | {
    type: 'input_video'
    input_video: {
      url: string
    }
  }

type AudioFormat = 'mp3' | 'wav' | 'flac' | 'silk' | 'unknown'
const WECHAT_VISION_DOWNGRADE_NOTICE = '【系统提示：当前模型暂不支持图片/视频理解，本条消息中的相关媒体已降级为文本占位（如 [图片消息]/[视频消息]）。请基于当前文字上下文自然回复。】'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message
  return String(error)
}

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

function decodePossibleBase64Audio(raw: string): Buffer | null {
  const trimmed = raw.trim()
  if (!trimmed)
    return null

  const dataUrlMatch = trimmed.match(/^data:audio\/[a-z0-9.+-]+;base64,([A-Z0-9+/=\r\n]+)$/i)
  const payload = dataUrlMatch ? dataUrlMatch[1] : trimmed
  if (payload.length < 16 || payload.length % 4 !== 0)
    return null
  if (!/^[A-Z0-9+/=\r\n]+$/i.test(payload))
    return null

  try {
    const decoded = Buffer.from(payload, 'base64')
    return decoded.length > 0 ? decoded : null
  }
  catch {
    return null
  }
}

function normalizeSpeechResultToBuffer(result: unknown): Buffer {
  if (Buffer.isBuffer(result))
    return result

  if (result instanceof ArrayBuffer)
    return Buffer.from(result)

  if (ArrayBuffer.isView(result))
    return Buffer.from(result.buffer, result.byteOffset, result.byteLength)

  if (typeof result === 'string') {
    const decoded = decodePossibleBase64Audio(result)
    if (decoded)
      return decoded

    try {
      const parsed = JSON.parse(result) as Record<string, unknown>
      const candidates: unknown[] = [
        parsed.audio,
        parsed.audio_base64,
        parsed.audioBase64,
        parsed.content,
        parsed.data,
      ]
      for (const candidate of candidates) {
        if (typeof candidate !== 'string')
          continue
        const nestedDecoded = decodePossibleBase64Audio(candidate)
        if (nestedDecoded)
          return nestedDecoded
      }
    }
    catch {}

    return Buffer.from(result)
  }

  if (typeof result === 'object' && result !== null) {
    const record = result as Record<string, unknown>
    const candidates: unknown[] = [
      record.audio,
      record.audio_base64,
      record.audioBase64,
      record.content,
      record.data,
    ]
    for (const candidate of candidates) {
      if (typeof candidate !== 'string')
        continue
      const decoded = decodePossibleBase64Audio(candidate)
      if (decoded)
        return decoded
    }
  }

  throw new Error(`Unsupported speech result payload type: ${typeof result}`)
}

function createStableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractWeChatInboundMediaAttachments(message: WeixinMessage, cdnBaseUrl: string): WeChatInboundMediaAttachment[] {
  const attachments: WeChatInboundMediaAttachment[] = []
  const seen = new Set<string>()
  const items = Array.isArray(message.item_list) ? message.item_list : []

  for (const item of items) {
    if (!isRecord(item))
      continue

    if (item.type === ITEM_TYPE_IMAGE) {
      const imageItem = isRecord(item.image_item) ? item.image_item : {}
      const directUrl = typeof imageItem.url === 'string'
        ? imageItem.url.trim()
        : ''
      const media = isRecord(imageItem.media) ? imageItem.media : {}
      const encryptedQueryParam = typeof media.encrypt_query_param === 'string'
        ? media.encrypt_query_param.trim()
        : ''
      const url = directUrl || (encryptedQueryParam ? buildCdnDownloadUrl(cdnBaseUrl, encryptedQueryParam) : '')
      const key = `image:${url}`
      if (seen.has(key))
        continue
      seen.add(key)
      attachments.push({
        kind: 'image',
        url: url || undefined,
      })
      continue
    }

    if (item.type === ITEM_TYPE_VIDEO) {
      const videoItem = isRecord(item.video_item) ? item.video_item : {}
      const media = isRecord(videoItem.media) ? videoItem.media : {}
      const encryptedQueryParam = typeof media.encrypt_query_param === 'string'
        ? media.encrypt_query_param.trim()
        : ''
      const url = encryptedQueryParam ? buildCdnDownloadUrl(cdnBaseUrl, encryptedQueryParam) : ''
      const key = `video:${url}`
      if (seen.has(key))
        continue
      seen.add(key)
      attachments.push({
        kind: 'video',
        url: url || undefined,
      })
    }
  }

  return attachments
}

function buildWeChatInboundTextWithMedia(options: {
  text: string
  mediaAttachments: WeChatInboundMediaAttachment[]
  supportsImageInput: boolean
  supportsVideoInput: boolean
}): { text: string, attachments: AiriInputAttachmentPart[], extraSystemInstruction?: string } {
  const normalizedText = options.text.trim()
  if (options.mediaAttachments.length === 0) {
    return {
      text: normalizedText,
      attachments: [],
    }
  }

  const resolvedAttachments: AiriInputAttachmentPart[] = []
  const downgradedPlaceholders: string[] = []
  let hasVisionDowngrade = false

  for (const mediaAttachment of options.mediaAttachments) {
    const trimmedUrl = mediaAttachment.url?.trim() ?? ''
    if (mediaAttachment.kind === 'image') {
      if (options.supportsImageInput && trimmedUrl) {
        resolvedAttachments.push({
          type: 'image_url',
          image_url: {
            url: trimmedUrl,
          },
        })
      }
      else {
        downgradedPlaceholders.push('[图片消息]')
        if (!options.supportsImageInput)
          hasVisionDowngrade = true
      }
      continue
    }

    if (options.supportsVideoInput && trimmedUrl) {
      resolvedAttachments.push({
        type: 'input_video',
        input_video: {
          url: trimmedUrl,
        },
      })
    }
    else {
      downgradedPlaceholders.push('[视频消息]')
      if (!options.supportsVideoInput)
        hasVisionDowngrade = true
    }
  }

  const allPlaceholders = options.mediaAttachments
    .map(item => item.kind === 'image' ? '[图片消息]' : '[视频消息]')
    .join('')
  const downgradeText = downgradedPlaceholders.join('')
  const resolvedText = [normalizedText, downgradeText].filter(Boolean).join('\n') || allPlaceholders

  return {
    text: resolvedText,
    attachments: resolvedAttachments,
    ...(hasVisionDowngrade ? { extraSystemInstruction: WECHAT_VISION_DOWNGRADE_NOTICE } : {}),
  }
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

function splitByMsgTag(content: string): string[] {
  const chunks = content.split(/\n\s*\n/)
  return chunks.map(c => c.trim()).filter(Boolean)
}

function pushTextReplyItems(items: string[], content: string, maxItems: number) {
  if (items.length >= maxItems)
    return

  const chunks = splitMessage(content)
  for (const chunk of chunks) {
    const normalized = chunk.trim()
    if (!normalized)
      continue
    items.push(normalized)
    if (items.length >= maxItems)
      return
  }
}

function parseReplyItems(content: string, maxItems = MAX_WECHAT_REPLY_ITEMS): string[] {
  const textBlocks = splitByMsgTag(content)
  const items: string[] = []

  for (const block of textBlocks) {
    if (items.length >= maxItems)
      break

    const normalizedBlock = block.trim()
    if (!normalizedBlock)
      continue

    pushTextReplyItems(items, normalizedBlock, maxItems)
  }

  return items.slice(0, maxItems)
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

class SessionQueue {
  private queue = Promise.resolve()

  enqueue(task: () => Promise<void>) {
    this.queue = this.queue.then(async () => {
      try {
        await task()
      }
      catch (error) {
        log.withError(error as Error).error('WeChat SessionQueue task failed')
      }
    })
    return this.queue
  }
}

function getMessageType(message: WeixinMessage): number | undefined {
  if (typeof message.message_type === 'number')
    return message.message_type

  const maybeLegacyType = (message as Record<string, unknown>).type
  if (typeof maybeLegacyType === 'number')
    return maybeLegacyType

  return undefined
}

function extractOutgoingText(message: unknown): string {
  if (typeof message === 'string')
    return message.trim()

  if (!isRecord(message))
    return ''

  if (typeof message.text === 'string' && message.text.trim().length > 0)
    return message.text.trim()

  if (typeof message.content === 'string')
    return message.content.trim()

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string')
          return part

        if (!isRecord(part))
          return ''

        if (typeof part.text === 'string')
          return part.text

        if (typeof part.content === 'string')
          return part.content

        return ''
      })
      .filter(Boolean)
      .join('')
      .trim()
  }

  return ''
}

function buildSessionStoragePath(): string {
  const fromEnv = process.env.AIRI_WECHAT_SESSION_PATH?.trim()
  if (fromEnv)
    return fromEnv

  return join(process.cwd(), '.airi', 'wechat-session.json')
}

function normalizePersistedSessionState(raw: unknown): PersistedWeChatSessionState | null {
  if (!isRecord(raw))
    return null

  if (typeof raw.token !== 'string' || raw.token.trim().length === 0)
    return null

  const contextTokens = isRecord(raw.contextTokens)
    ? Object.entries(raw.contextTokens)
        .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
        .reduce<Record<string, string>>((all, [userId, token]) => {
          if (userId.trim().length > 0 && token.trim().length > 0)
            all[userId] = token
          return all
        }, {})
    : {}

  return {
    token: raw.token,
    baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : undefined,
    botId: typeof raw.botId === 'string' ? raw.botId : undefined,
    userId: typeof raw.userId === 'string' ? raw.userId : undefined,
    updatesBuf: typeof raw.updatesBuf === 'string' ? raw.updatesBuf : undefined,
    contextTokens,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  }
}

async function loadPersistedSessionState(path: string): Promise<PersistedWeChatSessionState | null> {
  try {
    const content = await readFile(path, 'utf-8')
    return normalizePersistedSessionState(JSON.parse(content))
  }
  catch {
    return null
  }
}

async function persistSessionState(path: string, state: PersistedWeChatSessionState) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(state, null, 2), 'utf-8')
}

async function clearPersistedSessionState(path: string) {
  try {
    await rm(path, { force: true })
  }
  catch {
    // no-op
  }
}

function isWeChatMemeImageConfig(value: unknown): value is WeChatMemeImageConfig {
  if (!isRecord(value))
    return false

  return typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.mimeType === 'string'
    && typeof value.dataBase64 === 'string'
}

function isWeChatEmotionMemePackConfig(value: unknown): value is WeChatEmotionMemePackConfig {
  if (!isRecord(value))
    return false

  return typeof value.state === 'string'
    && Array.isArray(value.images)
    && value.images.every(isWeChatMemeImageConfig)
}

function isWeChatTtsConfig(value: unknown): value is WeChatTtsConfig {
  if (!isRecord(value))
    return false

  const providerOk = typeof value.providerId === 'string' && value.providerId.trim().length > 0
  const modelOk = typeof value.model === 'string' && value.model.trim().length > 0
  const voiceOk = typeof value.voice === 'string' && value.voice.trim().length > 0
  const providerConfigOk = typeof value.providerConfig === 'undefined' || isRecord(value.providerConfig)
  const outputOk = typeof value.outputFormat === 'undefined' || value.outputFormat === 'mp3' || value.outputFormat === 'wav' || value.outputFormat === 'flac' || value.outputFormat === 'silk'
  const speedOk = typeof value.speed === 'undefined' || typeof value.speed === 'number'
  const pitchOk = typeof value.pitch === 'undefined' || typeof value.pitch === 'number'

  return providerOk && modelOk && voiceOk && providerConfigOk && outputOk && speedOk && pitchOk
}

function isWeChatVisionConfig(value: unknown): value is WeChatVisionConfig {
  if (!isRecord(value))
    return false

  const providerOk = typeof value.providerId === 'string' || typeof value.providerId === 'undefined'
  const modelOk = typeof value.model === 'string' || typeof value.model === 'undefined'
  const imageSupportOk = typeof value.supportsImageInput === 'boolean' || typeof value.supportsImageInput === 'undefined'
  const videoSupportOk = typeof value.supportsVideoInput === 'boolean' || typeof value.supportsVideoInput === 'undefined'
  return providerOk && modelOk && imageSupportOk && videoSupportOk
}

function isWeChatModuleConfig(config: unknown): config is WeChatModuleConfig {
  if (!isRecord(config))
    return false

  const enabledOk = typeof config.enabled === 'boolean' || typeof config.enabled === 'undefined'
  const voiceModeOk = config.voiceReplyMode === 'text' || config.voiceReplyMode === 'voice' || config.voiceReplyMode === 'both' || typeof config.voiceReplyMode === 'undefined'
  const aiGirlfriendEnabledOk = typeof config.aiGirlfriendEnabled === 'boolean' || typeof config.aiGirlfriendEnabled === 'undefined'
  const memeProbabilityOk = typeof config.memeProbability === 'number' || typeof config.memeProbability === 'undefined'
  const emotionMemePacksOk = typeof config.emotionMemePacks === 'undefined' || (Array.isArray(config.emotionMemePacks) && config.emotionMemePacks.every(isWeChatEmotionMemePackConfig))
  const mainUserIdOk = typeof config.mainUserId === 'string' || typeof config.mainUserId === 'undefined'
  const boundUserIdsOk = typeof config.boundUserIds === 'undefined' || (Array.isArray(config.boundUserIds) && config.boundUserIds.every(item => typeof item === 'string'))
  const ttsOk = typeof config.tts === 'undefined' || isWeChatTtsConfig(config.tts)
  const visionOk = typeof config.vision === 'undefined' || isWeChatVisionConfig(config.vision)

  return enabledOk
    && voiceModeOk
    && aiGirlfriendEnabledOk
    && memeProbabilityOk
    && emotionMemePacksOk
    && mainUserIdOk
    && boundUserIdsOk
    && ttsOk
    && visionOk
}

export async function runAdapter() {
  const airiUrl = process.env.AIRI_URL
  const airiToken = process.env.AIRI_TOKEN

  if (!airiUrl) {
    log.error('AIRI_URL is not set. Use env var to pass AIRI connection info.')
    return
  }

  log.log(`Connecting to AIRI at ${airiUrl}`)
  const airiClient = new ServerChannel({
    name: 'wechat-bot',
    possibleEvents: [
      'input:text',
      'module:configure',
      'module:status',
      'output:gen-ai:chat:message',
      'output:gen-ai:chat:complete',
    ],
    url: airiUrl,
    token: airiToken,
    identity: WECHAT_MODULE_IDENTITY,
  })

  await airiClient.connect()

  const sessionStoragePath = buildSessionStoragePath()
  const persistedState = await loadPersistedSessionState(sessionStoragePath)
  if (persistedState?.token) {
    log.log(`[wechat:session] loaded persisted session from ${sessionStoragePath}`)
  }
  else {
    log.log(`[wechat:session] no persisted session found at ${sessionStoragePath}`)
  }

  const wechatClient = new Client(
    persistedState?.token ?? '',
    persistedState?.baseUrl
      ? { base_url: persistedState.baseUrl }
      : undefined,
  )

  const contextTokens = new Map<string, string>(
    Object.entries(persistedState?.contextTokens ?? {}),
  )

  for (const [userId, token] of contextTokens.entries()) {
    wechatClient.setContextToken(userId, token)
  }

  let botId = persistedState?.botId ?? ''
  let loginUserId = persistedState?.userId ?? ''
  let configuredMainUserId = persistedState?.userId ?? ''
  let updatesBuf = persistedState?.updatesBuf ?? ''
  let isConnected = false
  let loginFlowRunning = false
  let monitorGeneration = 0
  let moduleEnabled = true
  let voiceReplyMode: WeChatVoiceReplyMode = 'text'
  let aiGirlfriendEnabled = false
  let memeProbability = 0.2
  let emotionMemePacks: WeChatEmotionMemePackConfig[] = []
  let ttsConfig: WeChatTtsConfig | null = null
  let visionProviderId = ''
  let visionModel = ''
  let supportsImageInput = false
  let supportsVideoInput = false
  let proactiveTimer: ReturnType<typeof setInterval> | null = null

  const sessionQueues = new Map<string, SessionQueue>()
  const recentlyRepliedFingerprints = new Map<string, number>()
  const wechatContextBySessionId = new Map<string, WeChatInputContext>()
  const ttsProviderCache = new Map<string, any>()
  const ttsSemaphore = new Semaphore(2)
  const voiceSendQueueByMessage = new Map<string, Promise<void>>()
  const lastProactiveTimeBySession = new Map<string, number>()

  let persistQueue = Promise.resolve()

  function queuePersistSessionState() {
    const token = wechatClient.token.trim()

    if (!token) {
      persistQueue = persistQueue
        .then(async () => {
          await clearPersistedSessionState(sessionStoragePath)
        })
        .catch((error) => {
          log.withError(error as Error).warn('Failed to clear persisted WeChat session state')
        })
      return
    }

    const snapshot: PersistedWeChatSessionState = {
      token,
      baseUrl: wechatClient.baseUrl,
      botId: botId || undefined,
      userId: loginUserId || undefined,
      updatesBuf,
      contextTokens: Object.fromEntries(contextTokens.entries()),
      updatedAt: new Date().toISOString(),
    }

    persistQueue = persistQueue
      .then(async () => {
        await persistSessionState(sessionStoragePath, snapshot)
      })
      .catch((error) => {
        log.withError(error as Error).warn('Failed to persist WeChat session state')
      })
  }

  async function persistSessionStateNow(reason: string) {
    queuePersistSessionState()
    await persistQueue
    log.log(`[wechat:session] persisted session (${reason})`)
  }

  function resetSessionState(reason: string) {
    log.warn(`[wechat:session] reset persisted state: ${reason}`)
    updatesBuf = ''
    botId = ''
    loginUserId = ''
    contextTokens.clear()
    wechatClient.setToken('')
    queuePersistSessionState()
  }

  function resolveMainUserId(): string {
    return loginUserId.trim() || configuredMainUserId.trim()
  }

  function buildRuntimeDetails(): Record<string, unknown> {
    const mainUserId = resolveMainUserId()

    return {
      botId: botId || undefined,
      userId: loginUserId || undefined,
      mainUserId: mainUserId || undefined,
      aiGirlfriendEnabled,
      memeProbability,
      memePackCount: emotionMemePacks.length,
      voiceReplyMode,
      visionProviderId: visionProviderId || undefined,
      visionModel: visionModel || undefined,
      supportsImageInput,
      supportsVideoInput,
    }
  }

  function reportStatus(phase: 'preparing' | 'configured' | 'ready' | 'failed', details?: Record<string, unknown>) {
    airiClient.send({
      type: 'module:status',
      data: {
        identity: WECHAT_MODULE_IDENTITY,
        phase,
        details: {
          ...buildRuntimeDetails(),
          ...details,
        },
      },
    } as WebSocketEvent)
  }

  function trimRuntimeMaps(maxAgeMs = 10 * 60 * 1000) {
    const now = Date.now()
    for (const [key, timestamp] of recentlyRepliedFingerprints.entries()) {
      if (now - timestamp > maxAgeMs) {
        recentlyRepliedFingerprints.delete(key)
      }
    }
  }

  function isDuplicateReply(fingerprint: string): boolean {
    trimRuntimeMaps()
    if (recentlyRepliedFingerprints.has(fingerprint))
      return true

    // 不在这里设置 recentlyRepliedFingerprints，而是在实际处理发送时设置
    return false
  }

  function markReplyAsHandled(fingerprint: string) {
    recentlyRepliedFingerprints.set(fingerprint, Date.now())
  }

  function getSessionQueue(userId: string): SessionQueue {
    const key = userId.trim()
    if (!sessionQueues.has(key)) {
      sessionQueues.set(key, new SessionQueue())
    }
    return sessionQueues.get(key)!
  }

  function stopProactiveTimer() {
    if (!proactiveTimer)
      return

    clearInterval(proactiveTimer)
    proactiveTimer = null
  }

  function isPrimaryUser(userId: string): boolean {
    const main = resolveMainUserId()
    if (!main)
      return false
    return main === userId.trim()
  }

  async function sendInputToAiri(params: {
    content: string
    rawContent: string
    context: WeChatInputContext
    senderDisplayName: string
    mediaAttachments?: WeChatInboundMediaAttachment[]
  }) {
    const { content, rawContent, context, senderDisplayName } = params
    const mediaAttachments = Array.isArray(params.mediaAttachments) ? params.mediaAttachments : []
    const mediaAdjustedInput = buildWeChatInboundTextWithMedia({
      text: content,
      mediaAttachments,
      supportsImageInput,
      supportsVideoInput,
    })
    const outboundText = mediaAdjustedInput.text.trim()
    const outboundAttachments = mediaAdjustedInput.attachments
    if (!outboundText && outboundAttachments.length === 0)
      return

    const sessionId = `wechat-${context.userId}`
    const isPrimary = isPrimaryUser(context.userId)

    const systemInstructions = [WECHAT_MULTI_MESSAGE_STYLE_NOTICE]
    if (mediaAdjustedInput.extraSystemInstruction) {
      systemInstructions.push(mediaAdjustedInput.extraSystemInstruction)
    }
    if (emotionMemePacks.length > 0) {
      const states = emotionMemePacks.map(pack => pack.state.trim()).filter(Boolean)
      if (states.length > 0) {
        systemInstructions.push(
          '当你想发送表情包时，请调用 wechat.send_meme 工具，并在 state 参数中只选择下列状态之一：',
          `[${states.join(', ')}]`,
          'state 表示你自己的情绪状态，不要按照用户输入去猜用户情绪。',
        )
      }
    }

    if (aiGirlfriendEnabled && isPrimary) {
      systemInstructions.push(
        '【系统提示：当前处于 AI 女友模式。请用自然、亲密、生动的方式交流。】',
        '如需语音回复，请调用 wechat.send_voice，参数 content 为要发送的语音文本。',
      )
    }

    wechatContextBySessionId.set(sessionId, context)

    airiClient.send({
      type: 'input:text',
      route: {
        destinations: [
          `plugin:${WebSocketEventSource.StageTamagotchi}`,
        ],
        strategy: 'anycast',
      },
      data: {
        text: outboundText,
        textRaw: rawContent || outboundText,
        ...(outboundAttachments.length > 0 ? { attachments: outboundAttachments } : {}),
        overrides: {
          sessionId,
          messagePrefix: `[WeChat:${senderDisplayName}] `,
        },
        contextUpdates: [{
          strategy: ContextUpdateStrategy.AppendSelf,
          text: '【系统提示：该消息来自微信用户，请自然回复】',
          content: '【系统提示：该消息来自微信用户，请自然回复】',
          metadata: {
            wechat: context,
          },
        }, {
          strategy: ContextUpdateStrategy.AppendSelf,
          text: systemInstructions.join('\n\n'),
          content: systemInstructions.join('\n\n'),
          metadata: {
            wechat: context,
          },
        }],
        wechat: context,
        sourceTags: ['wechat'],
      } as any,
    } as any)

    log.log(`[wechat:recv->airi] forwarded session=${sessionId}`)
  }

  async function forwardIncomingMessage(message: WeixinMessage) {
    const messageType = getMessageType(message)
    if (messageType !== MESSAGE_TYPE_USER)
      return

    const text = extractText(message).trim()
    const mediaAttachments = extractWeChatInboundMediaAttachments(message, wechatClient.cdnBaseUrl)
    if (!text && mediaAttachments.length === 0)
      return

    const userId = String(message.from_user_id ?? '').trim()
    if (!userId)
      return

    if (typeof message.context_token === 'string' && message.context_token.trim().length > 0) {
      contextTokens.set(userId, message.context_token)
      wechatClient.setContextToken(userId, message.context_token)
      queuePersistSessionState()
    }

    const messageId = String(message.message_id ?? message.seq ?? '')
    const context: WeChatInputContext = {
      userId,
      messageId: messageId || undefined,
    }

    log.log(`[wechat:recv] from=${userId} text=${JSON.stringify(text)} media=${mediaAttachments.length}`)

    await sendInputToAiri({
      content: text,
      rawContent: text,
      context,
      senderDisplayName: 'User',
      mediaAttachments,
    })
  }

  function startMonitorLoop() {
    monitorGeneration += 1
    const currentMonitorGeneration = monitorGeneration

    void wechatClient.monitor(async (message) => {
      await forwardIncomingMessage(message)
    }, {
      initial_buf: updatesBuf,
      should_continue: () => isConnected && currentMonitorGeneration === monitorGeneration,
      on_buf_update: (buf) => {
        updatesBuf = buf
        queuePersistSessionState()
      },
      on_error: (error) => {
        log.withError(error as Error).error('[wechat:monitor] error')
      },
      on_session_expired: () => {
        log.warn('[wechat:monitor] session expired, switching to login flow')
        isConnected = false
        monitorGeneration += 1
        resetSessionState('session expired')
        reportStatus('failed', { error: '会话已过期，正在重新登录' })
        void startLoginFlow({ forceQrLogin: true })
      },
    })
  }

  async function maybeRunProactiveMessage() {
    if (!moduleEnabled || !aiGirlfriendEnabled || !isConnected)
      return

    const mainUserId = resolveMainUserId()
    if (!mainUserId)
      return

    const now = new Date()
    const hour = now.getHours()
    if (hour < 8 || hour >= 20)
      return

    const sessionId = `wechat-${mainUserId}`
    const lastTime = lastProactiveTimeBySession.get(sessionId) || 0
    const hoursSinceLast = (Date.now() - lastTime) / (1000 * 60 * 60)

    if (lastTime > 0 && hoursSinceLast < 3)
      return

    if (Math.random() > 0.1)
      return

    const scenarios = [
      '游戏邀请：问问要不要一起打游戏',
      '早安问候：新的一天开始了',
      '晚安问候：提醒早点休息',
      '日常关心：问问吃饭了没或者工作累不累',
      '分享趣事：分享一个有趣的小发现',
      '撒娇卖萌：表达想念',
    ]
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)]

    lastProactiveTimeBySession.set(sessionId, Date.now())

    const context: WeChatInputContext = {
      userId: mainUserId,
      messageId: `proactive-${Date.now()}`,
    }

    const triggerText = `【系统提示：触发主动消息推送，场景为“${scenario}”。请直接输出你作为女友想要对我说的话，自然一点，不要带系统前缀。】`
    log.log(`[wechat:proactive] trigger mainUserId=${mainUserId}, scenario=${scenario}`)

    await sendInputToAiri({
      content: triggerText,
      rawContent: triggerText,
      context,
      senderDisplayName: 'System',
    })
  }

  function restartProactiveTimer() {
    stopProactiveTimer()

    if (!moduleEnabled || !aiGirlfriendEnabled)
      return

    proactiveTimer = setInterval(() => {
      void maybeRunProactiveMessage()
    }, 60_000)
  }

  function parseDirectivePayload(raw: unknown): Record<string, unknown> {
    if (typeof raw === 'object' && raw !== null)
      return raw as Record<string, unknown>
    if (typeof raw !== 'string')
      return {}

    const normalized = raw.trim()
    if (!normalized)
      return {}

    try {
      const parsed = JSON.parse(normalized) as unknown
      if (typeof parsed === 'object' && parsed !== null)
        return parsed as Record<string, unknown>
      return {}
    }
    catch {
      return {}
    }
  }

  function extractSkillDirectives(message: unknown, textContent: string): { directives: WeChatSkillDirective[], remainingText: string } {
    const directives: WeChatSkillDirective[] = []

    if (isRecord(message)) {
      const slices = Array.isArray(message.slices) ? message.slices : []
      for (const slice of slices) {
        if (!isRecord(slice) || slice.type !== 'tool-call')
          continue

        const toolCall = isRecord(slice.toolCall) ? slice.toolCall : {}
        if (typeof toolCall.toolName !== 'string')
          continue

        directives.push({
          name: toolCall.toolName,
          payload: parseDirectivePayload(toolCall.args),
        })
      }

      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
      for (const toolCall of toolCalls) {
        if (!isRecord(toolCall))
          continue

        const fn = isRecord(toolCall.function) ? toolCall.function : {}
        if (typeof fn.name !== 'string')
          continue

        directives.push({
          name: fn.name,
          payload: parseDirectivePayload(fn.arguments),
        })
      }
    }

    const inlineDirectives: WeChatSkillDirective[] = []
    const remainingText = textContent.replace(/\[skill:([\w.-]+)(?:\s+(\{[\s\S]*?\}))?\]/gi, (_full, name, rawPayload) => {
      inlineDirectives.push({
        name: String(name),
        payload: parseDirectivePayload(rawPayload),
      })
      return ''
    }).trim()

    directives.push(...inlineDirectives)

    const deduped: WeChatSkillDirective[] = []
    const seen = new Set<string>()
    for (const directive of directives) {
      const normalizedName = directive.name.trim()
      if (!normalizedName)
        continue

      const key = `${normalizedName}:${createStableHash(directive.payload)}`
      if (seen.has(key))
        continue

      seen.add(key)
      deduped.push({
        name: normalizedName,
        payload: directive.payload,
      })
    }

    return {
      directives: deduped,
      remainingText,
    }
  }

  function getStringFromPayload(payload: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = payload[key]
      if (typeof value === 'string' && value.trim())
        return value.trim()
    }
    return ''
  }

  function chooseMemePack(preferredState?: string): WeChatEmotionMemePackConfig | null {
    const candidates = emotionMemePacks.filter(pack => Array.isArray(pack.images) && pack.images.length > 0)
    if (candidates.length === 0)
      return null

    const normalizedState = preferredState?.trim().toLowerCase() ?? ''
    if (normalizedState) {
      const exact = candidates.find(pack => pack.state.trim().toLowerCase() === normalizedState)
      if (exact)
        return exact

      const fuzzy = candidates.find(pack => pack.state.trim().toLowerCase().includes(normalizedState) || normalizedState.includes(pack.state.trim().toLowerCase()))
      if (fuzzy)
        return fuzzy
    }

    const randomIndex = Math.floor(Math.random() * candidates.length)
    return candidates[randomIndex] ?? null
  }

  function ensureImageFilename(name: string, mimeType: string): string {
    const trimmed = name.trim()
    if (/\.[a-z0-9]+$/i.test(trimmed))
      return trimmed

    const normalizedMime = mimeType.toLowerCase()
    if (normalizedMime.includes('jpeg'))
      return `${trimmed || 'meme'}.jpg`
    if (normalizedMime.includes('webp'))
      return `${trimmed || 'meme'}.webp`
    if (normalizedMime.includes('gif'))
      return `${trimmed || 'meme'}.gif`

    return `${trimmed || 'meme'}.png`
  }

  function getContextTokenOrThrow(userId: string): string {
    const token = wechatClient.getContextToken(userId)
    if (!token) {
      throw new NoContextTokenError()
    }

    return token
  }

  async function sendWeChatText(context: WeChatInputContext, text: string) {
    await wechatClient.push(context.userId, text)
  }

  async function sendWeChatMemeImage(context: WeChatInputContext, image: WeChatMemeImageConfig) {
    const base64Payload = image.dataBase64.startsWith('data:')
      ? image.dataBase64.slice(image.dataBase64.indexOf(',') + 1)
      : image.dataBase64
    const fileBuffer = Buffer.from(base64Payload, 'base64')
    if (fileBuffer.length === 0)
      throw new Error('Meme image payload is empty')

    const contextToken = getContextTokenOrThrow(context.userId)
    const fileName = ensureImageFilename(image.name, image.mimeType)
    await wechatClient.sendMediaFile(context.userId, contextToken, fileBuffer, fileName)
  }

  async function maybeSendMeme(context: WeChatInputContext, preferredState?: string, force = false): Promise<boolean> {
    if (!force) {
      const probability = Math.min(1, Math.max(0, memeProbability))
      if (Math.random() > probability) {
        log.log(`[wechat:meme] skipped due to probability`)
        return false
      }
    }

    log.log(`[wechat:meme] choosing meme pack for state: ${preferredState || 'random'}`)
    const pack = chooseMemePack(preferredState)
    if (!pack) {
      log.log(`[wechat:meme] no suitable meme pack found`)
      return false
    }

    const image = pack.images[Math.floor(Math.random() * pack.images.length)]
    if (!image) {
      log.log(`[wechat:meme] selected pack contains no images`)
      return false
    }

    try {
      log.log(`[wechat:meme] sending image: ${image.name} (${image.mimeType})`)
      await sendWeChatMemeImage(context, image)
      log.log(`[wechat:meme] sent successfully`)
      return true
    }
    catch (error) {
      log.withError(error as Error).warn('[wechat:meme] failed')
      return false
    }
  }

  async function getOrCreateTtsProvider(config: WeChatTtsConfig): Promise<any | null> {
    const cacheKey = `${config.providerId}:${createStableHash(config.providerConfig)}`
    if (ttsProviderCache.has(cacheKey))
      return ttsProviderCache.get(cacheKey)

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

    ttsProviderCache.set(cacheKey, provider)
    return provider
  }

  async function generateSpeechAudio(text: string, config: WeChatTtsConfig): Promise<Buffer | null> {
    const provider = await getOrCreateTtsProvider(config)
    if (!provider || typeof provider.speech !== 'function')
      return null

    const providerConfig = config.providerConfig ?? {}
    const sanitizedProviderConfig: Record<string, unknown> = {
      ...providerConfig,
      ...(typeof config.speed === 'number' ? { speed: config.speed } : {}),
      ...(typeof config.pitch === 'number' ? { pitch: config.pitch } : {}),
    }

    delete sanitizedProviderConfig.response_format
    delete sanitizedProviderConfig.format
    delete sanitizedProviderConfig.audio_format
    delete sanitizedProviderConfig.output_format
    delete sanitizedProviderConfig.output_audio_format
    delete sanitizedProviderConfig.codec
    delete sanitizedProviderConfig.encoding
    delete sanitizedProviderConfig.container

    const outputFormat: AudioFormat = config.outputFormat ?? 'wav'
    const speechOptions: Record<string, unknown> = {
      ...sanitizedProviderConfig,
      response_format: outputFormat,
      format: outputFormat,
      audio_format: outputFormat,
      output_format: outputFormat,
      output_audio_format: outputFormat,
      codec: outputFormat,
      encoding: outputFormat,
      container: outputFormat,
    }

    const result = await generateSpeech({
      ...provider.speech(config.model, speechOptions),
      input: text,
      voice: config.voice,
    } as any)

    let outputBuffer = normalizeSpeechResultToBuffer(result)
    let format = detectAudioFormat(outputBuffer)

    if (format === 'unknown') {
      const textPayload = outputBuffer.toString('utf8').trim()
      const decodedBase64 = decodePossibleBase64Audio(textPayload)

      if (decodedBase64) {
        outputBuffer = decodedBase64
        format = detectAudioFormat(outputBuffer)
      }
    }

    if (format === 'unknown')
      return outputBuffer

    return outputBuffer
  }

  async function sendWeChatVoice(context: WeChatInputContext, audio: Buffer, _text: string) {
    log.log(`[wechat:tts] uploading voice to wechat for ${context.userId}, audio size: ${audio.length} bytes`)
    const contextToken = getContextTokenOrThrow(context.userId)

    const uploaded = await wechatClient.uploadFile(audio, context.userId, MEDIA_VOICE)
    log.log(`[wechat:tts] voice uploaded, media encrypt_query_param: ${uploaded.download_encrypted_query_param}`)

    const clientId = `wechat-voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    log.log(`[wechat:tts] sending voice message with client_id: ${clientId}`)
    await wechatClient.sendMessage({
      from_user_id: '',
      to_user_id: context.userId,
      client_id: clientId,
      message_type: MESSAGE_TYPE_BOT,
      message_state: MESSAGE_STATE_FINISH,
      context_token: contextToken,
      item_list: [{
        type: ITEM_TYPE_VOICE,
        voice_item: {
          media: {
            encrypt_query_param: uploaded.download_encrypted_query_param,
            aes_key: mediaAesKeyHex(uploaded.aes_key),
            encrypt_type: ENCRYPT_AES128_ECB,
          },
        },
      }],
    })
    log.log(`[wechat:tts] voice message sent successfully`)
  }

  async function generateAndSendVoiceOrFallback(context: WeChatInputContext, content: string, mode: WeChatVoiceReplyMode) {
    log.log(`[wechat:tts] evaluating voice generation for mode: ${mode}, content length: ${content.length}`)

    // 我们在这里不进行拦截，因为文本回复和语音回复共享同一个 replyFingerprint，
    // 在 handleAiriOutput 中已经标记过一次了。
    // 如果拦截，会导致语音永远发不出去。

    if (!ttsConfig) {
      log.warn('[wechat:tts] skipped: tts config missing, fallback to text')
      if (mode === 'voice' || mode === 'both') {
        await sendWeChatText(context, content)
      }
      return
    }

    log.log(`[wechat:tts] preparing to acquire semaphore to generate speech for text: "${content.slice(0, 20)}..."`)
    const release = await ttsSemaphore.acquire()
    try {
      log.log(`[wechat:tts] generating speech via provider: ${ttsConfig.providerId}, model: ${ttsConfig.model}, format: ${ttsConfig.outputFormat}`)
      log.log(`[wechat:tts] START generating speech audio...`)
      const audio = await generateSpeechAudio(content, ttsConfig)
      if (!audio) {
        log.warn('[wechat:tts] skipped: provider not ready or returned empty, fallback to text')
        if (mode === 'voice' || mode === 'both') {
          await sendWeChatText(context, content)
        }
        return
      }
      log.log(`[wechat:tts] FINISH generated audio successfully, size: ${audio.length} bytes, format: ${detectAudioFormat(audio)}`)

      await sendWeChatVoice(context, audio, content)
    }
    catch (error) {
      log.withError(error as Error).error('[wechat:tts] generation or sending failed')
      if (mode === 'voice' || mode === 'both') {
        try {
          await sendWeChatText(context, content)
        }
        catch (fallbackError) {
          log.withError(fallbackError as Error).error('[wechat:tts] fallback:text failed')
        }
      }
    }
    finally {
      release()
    }
  }

  function enqueueVoiceSend(key: string, task: () => Promise<void>): Promise<void> {
    const prev = voiceSendQueueByMessage.get(key) ?? Promise.resolve()
    const next = prev.catch(() => {}).then(task)
    voiceSendQueueByMessage.set(key, next)
    void next.finally(() => {
      if (voiceSendQueueByMessage.get(key) === next)
        voiceSendQueueByMessage.delete(key)
    })
    return next
  }

  async function waitReplyInterval(): Promise<void> {
    const intervalMs = MIN_REPLY_INTERVAL_MS + Math.floor(Math.random() * (MAX_REPLY_INTERVAL_MS - MIN_REPLY_INTERVAL_MS + 1))
    await sleep(intervalMs)
  }

  async function executeSkillDirective(context: WeChatInputContext, directive: WeChatSkillDirective): Promise<string> {
    if (directive.name === 'wechat.send_meme') {
      const state = getStringFromPayload(directive.payload, ['state', 'emotion', 'mood', 'keyword'])
      const sent = await maybeSendMeme(context, state || undefined, true)
      return sent
        ? `wechat.send_meme sent (${state || 'random'})`
        : `wechat.send_meme skipped (${state || 'random'})`
    }

    if (directive.name === 'wechat.send_voice') {
      const content = getStringFromPayload(directive.payload, ['content', 'text'])
      if (content) {
        const key = `${context.userId}:${context.messageId ?? createStableHash(content)}`
        void enqueueVoiceSend(key, async () => {
          await generateAndSendVoiceOrFallback(context, content, 'voice')
        })
        return 'wechat.send_voice processing'
      }
    }

    return `unsupported skill: ${directive.name}`
  }

  async function sendWeChatReply(context: WeChatInputContext, content: string) {
    const normalizedContent = content.trim()
    if (!normalizedContent)
      return

    const mode = voiceReplyMode
    let wantsMeme = false

    const isPrimary = isPrimaryUser(context.userId)
    // 强制把这个该死的拦截关掉，为了确保语音能发出来
    // if (aiGirlfriendEnabled && isPrimary) {
    //   mode = 'text'
    //   wantsMeme = false
    // }
    // else {
    if (Math.random() < Math.min(1, Math.max(0, memeProbability))) {
      wantsMeme = true
    }
    // }

    const wantsText = mode === 'text' || mode === 'both'
    const wantsVoice = mode === 'voice' || mode === 'both'

    log.log(`[wechat:reply] parsed mode. global_mode: ${voiceReplyMode}, final_mode: ${mode}, isPrimary: ${isPrimary}, aiGirlfriend: ${aiGirlfriendEnabled}`)

    const sendTextOrMeme = async () => {
      log.log(`[wechat:reply] sendTextOrMeme called. wantsText: ${wantsText}, wantsMeme: ${wantsMeme}`)
      if (wantsText) {
        await sendWeChatText(context, normalizedContent)
      }

      if (wantsMeme) {
        if (wantsText) {
          await waitReplyInterval()
        }

        const sentMeme = await maybeSendMeme(context, normalizedContent)
        if (!sentMeme && !wantsText) {
          await sendWeChatText(context, normalizedContent)
        }
      }
    }

    log.log(`[wechat:reply] sending reply for ${context.userId}. mode: ${mode}, wantsVoice: ${wantsVoice}, wantsText: ${wantsText}`)

    if (wantsText && mode === 'both') {
      log.log(`[wechat:reply] mode is both, sending text first.`)
      await sendWeChatText(context, normalizedContent)
    }

    if (!wantsVoice) {
      log.log(`[wechat:reply] wantsVoice is false, calling sendTextOrMeme`)
      await sendTextOrMeme()
      return
    }

    const key = `${context.userId}:${context.messageId ?? createStableHash(normalizedContent)}`
    log.log(`[wechat:reply] wantsVoice is true, enqueuing voice send for key: ${key}`)
    void enqueueVoiceSend(key, async () => {
      try {
        log.log(`[wechat:reply] start generating and sending voice for text: "${normalizedContent.slice(0, 20)}..."`)
        await generateAndSendVoiceOrFallback(context, normalizedContent, mode)
      }
      catch (error) {
        log.error('Failed to generate and send voice, fallback should have been triggered', error)
      }

      if (wantsMeme) {
        await waitReplyInterval()
        await maybeSendMeme(context, normalizedContent)
      }
    })
  }

  async function handleAiriOutput(eventData: AiriOutputEventData, isComplete = false) {
    if (!isConnected || !moduleEnabled)
      return

    const outputInputData = eventData['gen-ai:chat']?.input?.data
    const sourceTags = [
      ...(Array.isArray(outputInputData?.sourceTags) ? outputInputData.sourceTags : []),
      ...(Array.isArray(eventData.sourceTags) ? eventData.sourceTags : []),
    ]
    const sessionId = outputInputData?.overrides?.sessionId ?? eventData.overrides?.sessionId
    const wechatContext = outputInputData?.wechat
      ?? eventData.wechat
      ?? (sessionId?.startsWith('wechat-') ? wechatContextBySessionId.get(sessionId) : undefined)
    const isWeChatOutput = sourceTags.includes('wechat')
      || Boolean(outputInputData?.wechat)
      || Boolean(eventData.wechat)
      || Boolean(sessionId?.startsWith('wechat-'))

    if (!isWeChatOutput)
      return

    if (!wechatContext?.userId) {
      log.warn(`Skipped AIRI output for WeChat: context missing (sessionId=${sessionId ?? 'none'})`)
      return
    }

    const rawContent = extractOutgoingText(eventData.message)
    const { directives, remainingText } = extractSkillDirectives(eventData.message, rawContent)
    if (!remainingText && directives.length === 0)
      return

    const replyFingerprint = `${wechatContext.userId}:${createStableHash({
      directives: directives.map(d => ({ name: d.name, payload: d.payload })),
      text: remainingText,
    })}`

    if (isDuplicateReply(replyFingerprint)) {
      log.warn(`Skipped duplicate AIRI reply for WeChat: userId=${wechatContext.userId}`)
      return
    }

    const sessionQueue = getSessionQueue(wechatContext.userId)

    if (directives.length > 0) {
      markReplyAsHandled(replyFingerprint)
      sessionQueue.enqueue(async () => {
        for (const directive of directives) {
          const result = await executeSkillDirective(wechatContext, directive)
          log.log(`[wechat:skill] ${result}`)
          await waitReplyInterval()
        }
      })
    }

    if (remainingText) {
      const parsedItems = parseReplyItems(remainingText, MAX_WECHAT_REPLY_ITEMS)
      const fallbackChunks = splitMessage(remainingText)
      const allItems = parsedItems.length > 0
        ? parsedItems
        : fallbackChunks.map(chunk => chunk.trim()).filter(Boolean).slice(0, MAX_WECHAT_REPLY_ITEMS)

      // 如果不是最终完成事件，且最后一个片段可能还在增长（没有以换行符结尾），则暂时忽略最后一个片段
      // 这样可以确保只有完整的段落才会被发送，避免发送“A”，“AB”，“ABC”这样的重复增长片段
      const replyItems = (isComplete || remainingText.endsWith('\n\n') || remainingText.endsWith('\n'))
        ? allItems
        : allItems.slice(0, -1)

      log.log(`[wechat:output] processing reply items, count: ${replyItems.length}, isComplete: ${isComplete}, remainingText: "${remainingText.slice(0, 20)}..."`)

      if (replyItems.length > 0) {
        // 如果有内容要发送，但指纹在前面被误判了（或者是重复消息），我们要确保指纹被记录
        // 注意：如果在 isDuplicateReply 中被拦截了，它根本走不到这里。
        // 但是我们需要把发送过的每个具体 item 放入 queue。
        markReplyAsHandled(replyFingerprint)
      }

      for (const [index, item] of replyItems.entries()) {
        sessionQueue.enqueue(async () => {
          await sendWeChatReply(wechatContext, item)
          if (index < replyItems.length - 1) {
            await waitReplyInterval()
          }
        })
      }
    }
  }

  function applyModuleConfig(config: WeChatModuleConfig) {
    moduleEnabled = config.enabled !== false
    voiceReplyMode = config.voiceReplyMode ?? 'text'
    aiGirlfriendEnabled = config.aiGirlfriendEnabled ?? false
    memeProbability = typeof config.memeProbability === 'number'
      ? Math.min(1, Math.max(0, config.memeProbability))
      : 0.2
    emotionMemePacks = Array.isArray(config.emotionMemePacks)
      ? config.emotionMemePacks
      : []

    const configMainUserId = typeof config.mainUserId === 'string'
      ? config.mainUserId.trim()
      : ''
    const fallbackMainUserId = Array.isArray(config.boundUserIds)
      ? String(config.boundUserIds[0] ?? '').trim()
      : ''

    if (configMainUserId) {
      configuredMainUserId = configMainUserId
    }
    else if (fallbackMainUserId) {
      configuredMainUserId = fallbackMainUserId
    }

    if (loginUserId.trim()) {
      configuredMainUserId = loginUserId.trim()
    }

    log.log(`[wechat:config] voiceReplyMode updated to: ${voiceReplyMode}, aiGirlfriendEnabled: ${aiGirlfriendEnabled}`)

    ttsConfig = config.tts ?? null
    log.log(`[wechat:config] ttsConfig updated: provider=${ttsConfig?.providerId}, model=${ttsConfig?.model}, format=${ttsConfig?.outputFormat}`)
    visionProviderId = config.vision?.providerId?.trim() ?? ''
    visionModel = config.vision?.model?.trim() ?? ''
    supportsImageInput = config.vision?.supportsImageInput === true
    supportsVideoInput = config.vision?.supportsVideoInput === true

    restartProactiveTimer()

    if (moduleEnabled && isConnected) {
      reportStatus('ready', {
        botId,
        userId: loginUserId || undefined,
        mainUserId: resolveMainUserId() || undefined,
        message: '微信已连接（配置已更新）',
      })
      return
    }

    reportStatus('configured', {
      message: moduleEnabled ? '微信模块配置已更新' : '微信模块已禁用',
    })
  }

  let currentQrDataUrl = ''

  async function startLoginFlow(options?: { forceQrLogin?: boolean }) {
    if (loginFlowRunning)
      return

    loginFlowRunning = true

    try {
      if (!options?.forceQrLogin && wechatClient.token.trim().length > 0) {
        isConnected = true
        log.log('[wechat:session] reusing persisted token/base_url, skip QR login')
        log.log(`Connected to WeChat (restored), BotID=${botId || 'unknown'}`)
        if (loginUserId.trim()) {
          configuredMainUserId = loginUserId.trim()
        }
        reportStatus('ready', {
          botId,
          userId: loginUserId || undefined,
          mainUserId: resolveMainUserId() || undefined,
          restored: true,
          message: '微信会话已恢复',
        })
        restartProactiveTimer()
        startMonitorLoop()
        return
      }

      reportStatus('preparing', {
        message: '正在启动微信扫码登录...',
      })

      const result = await wechatClient.loginWithQr({
        on_qrcode: async (url) => {
          log.log('[wechat:login] QR code generated, waiting for scan')
          currentQrDataUrl = await QRCode.toDataURL(url)
          reportStatus('configured', {
            qrcode: currentQrDataUrl,
            message: '请使用微信扫码登录',
          })
        },
        on_scanned: () => {
          log.log('[wechat:login] QR code scanned, waiting confirm on phone')
          reportStatus('configured', {
            qrcode: currentQrDataUrl,
            message: '已扫码，请在微信中确认',
          })
        },
      })

      if (!result.connected) {
        log.error(`[wechat:login] failed: ${result.message}`)
        reportStatus('failed', { error: result.message })
        return
      }

      botId = result.bot_id || ''
      loginUserId = result.user_id || ''
      if (loginUserId.trim()) {
        configuredMainUserId = loginUserId.trim()
      }

      if (result.bot_token?.trim()) {
        wechatClient.setToken(result.bot_token)
      }
      if (result.base_url?.trim()) {
        wechatClient.setBaseUrl(result.base_url)
      }

      isConnected = true
      await persistSessionStateNow('qr-login-success')

      reportStatus('ready', {
        botId,
        userId: loginUserId || undefined,
        mainUserId: resolveMainUserId() || undefined,
        message: '微信已连接',
      })

      restartProactiveTimer()
      startMonitorLoop()
    }
    catch (error) {
      const message = toErrorMessage(error)
      log.error(`[wechat:login] failed to start: ${message}`)
      reportStatus('failed', { error: message })
    }
    finally {
      loginFlowRunning = false
    }
  }

  void startLoginFlow()

  airiClient.onEvent('output:gen-ai:chat:message', async (event) => {
    await handleAiriOutput(event.data as AiriOutputEventData, false)
  })

  airiClient.onEvent('output:gen-ai:chat:complete', async (event) => {
    await handleAiriOutput(event.data as AiriOutputEventData, true)
  })

  airiClient.onEvent('module:configure', (event) => {
    const eventData = event.data as { module?: string, config?: unknown }
    if (typeof eventData.module === 'string' && eventData.module !== 'wechat' && eventData.module !== 'wechat-bot')
      return

    log.log(`[wechat:config] received module:configure event. config: ${JSON.stringify(eventData.config)}`)

    if (!isWeChatModuleConfig(eventData.config)) {
      log.warn(`[wechat:config] invalid config received`)
      reportStatus('failed', { error: '无效的微信模块配置' })
      return
    }

    applyModuleConfig(eventData.config)

    if (eventData.config.enabled === false) {
      log.log('WeChat module disabled.')
      stopProactiveTimer()
      process.exit(0)
    }
  })
}
