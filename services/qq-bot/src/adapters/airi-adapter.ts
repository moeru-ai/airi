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
  aiGirlfriendEnabled?: boolean
  memeProbability?: number
  emotionMemePacks?: QQEmotionMemePackConfig[]
  boundUserIds?: string[]
  tts?: QQTtsConfig
  vision?: QQVisionConfig
}

interface QQMemeImageConfig {
  id: string
  name: string
  mimeType: string
  dataBase64: string
}

interface QQEmotionMemePackConfig {
  state: string
  images: QQMemeImageConfig[]
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

interface QQVisionConfig {
  providerId?: string
  model?: string
  supportsImageInput?: boolean
  supportsVideoInput?: boolean
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
  attachments?: Array<{
    asr_refer_text?: string
    content_type?: string
    filename?: string
    url?: string
  }>
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
  'toolCalls'?: unknown
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

interface QQSkillDirective {
  name: string
  payload: Record<string, unknown>
}

interface QQInboundMediaAttachment {
  kind: 'image' | 'video'
  url?: string
  contentType?: string
  filename?: string
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

const MAX_QQ_REPLY_ITEMS = 5
const RECOMMENDED_QQ_TEXT_REPLY_ITEMS = 3
const MIN_REPLY_INTERVAL_MS = 1000
const MAX_REPLY_INTERVAL_MS = 3000
const QQ_MULTI_MESSAGE_STYLE_NOTICE = [
  '请模拟 QQ 聊天软件中的真人聊天回复习惯。',
  `建议文本回复简短，不超过 ${RECOMMENDED_QQ_TEXT_REPLY_ITEMS} 个自然段；必要时可扩展到最多 ${MAX_QQ_REPLY_ITEMS} 段。`,
  '若拆分多条，请使用两个空行 (\\n\\n) 进行分段。',
  '不要输出任何像 [msg] 这样的控制标签。',
].join('\n')
const QQ_IMAGE_EXTENSION_PATTERN = /\.(?:apng|avif|bmp|gif|heic|heif|jpeg|jpg|png|svg|webp)(?:\?|$)/i
const QQ_VIDEO_EXTENSION_PATTERN = /\.(?:asf|avi|flv|m4v|mkv|mov|mp4|mpeg|mpg|rmvb|webm|wmv)(?:\?|$)/i
const QQ_VISION_DOWNGRADE_NOTICE = '【系统提示：当前模型暂不支持图片/视频理解，本条消息中的相关媒体已降级为文本占位（如 [图片消息]/[视频消息]）。请基于当前文字上下文自然回复。】'

function isQQModuleConfig(config: unknown): config is QQModuleConfig {
  if (typeof config !== 'object' || config === null)
    return false

  const c = config as Record<string, unknown>
  const enabledOk = typeof c.enabled === 'boolean' || typeof c.enabled === 'undefined'
  const methodOk = c.method === 'official' || c.method === 'napcat' || typeof c.method === 'undefined'
  const tokenOk = typeof c.officialToken === 'string' || typeof c.officialToken === 'undefined'
  const voiceReplyModeOk = c.voiceReplyMode === 'text' || c.voiceReplyMode === 'voice' || c.voiceReplyMode === 'both' || typeof c.voiceReplyMode === 'undefined'
  const aiGirlfriendEnabledOk = typeof c.aiGirlfriendEnabled === 'boolean' || typeof c.aiGirlfriendEnabled === 'undefined'
  const memeProbabilityOk = typeof c.memeProbability === 'number' || typeof c.memeProbability === 'undefined'
  const emotionMemePacksOk = typeof c.emotionMemePacks === 'undefined' || (Array.isArray(c.emotionMemePacks) && c.emotionMemePacks.every(isQQEmotionMemePackConfig))
  const boundUserIdsOk = typeof c.boundUserIds === 'undefined' || (Array.isArray(c.boundUserIds) && c.boundUserIds.every(item => typeof item === 'string'))
  const ttsOk = typeof c.tts === 'undefined' || isQQTtsConfig(c.tts)
  const visionOk = typeof c.vision === 'undefined' || isQQVisionConfig(c.vision)
  return enabledOk && methodOk && tokenOk && voiceReplyModeOk && aiGirlfriendEnabledOk && memeProbabilityOk && emotionMemePacksOk && boundUserIdsOk && ttsOk && visionOk
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

function isQQVisionConfig(value: unknown): value is QQVisionConfig {
  if (typeof value !== 'object' || value === null)
    return false

  const config = value as Record<string, unknown>
  const providerOk = typeof config.providerId === 'string' || typeof config.providerId === 'undefined'
  const modelOk = typeof config.model === 'string' || typeof config.model === 'undefined'
  const imageSupportOk = typeof config.supportsImageInput === 'boolean' || typeof config.supportsImageInput === 'undefined'
  const videoSupportOk = typeof config.supportsVideoInput === 'boolean' || typeof config.supportsVideoInput === 'undefined'
  return providerOk && modelOk && imageSupportOk && videoSupportOk
}

function isQQMemeImageConfig(value: unknown): value is QQMemeImageConfig {
  if (typeof value !== 'object' || value === null)
    return false

  const v = value as Record<string, unknown>
  return typeof v.id === 'string'
    && typeof v.name === 'string'
    && typeof v.mimeType === 'string'
    && typeof v.dataBase64 === 'string'
}

function isQQEmotionMemePackConfig(value: unknown): value is QQEmotionMemePackConfig {
  if (typeof value !== 'object' || value === null)
    return false

  const v = value as Record<string, unknown>
  return typeof v.state === 'string'
    && Array.isArray(v.images)
    && v.images.every(isQQMemeImageConfig)
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

function parseReplyItems(content: string, maxItems = MAX_QQ_REPLY_ITEMS): string[] {
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

function hasAudioLikeAttachment(event: QQMessageBase): boolean {
  const attachments = Array.isArray(event.attachments) ? event.attachments : []
  if (attachments.length === 0)
    return false

  return attachments.some((attachment) => {
    const contentType = attachment.content_type?.toLowerCase() ?? ''
    const filename = attachment.filename?.toLowerCase() ?? ''
    const url = attachment.url?.toLowerCase() ?? ''

    if (contentType.startsWith('audio/'))
      return true

    return /\.(?:amr|flac|m4a|mp3|ogg|opus|silk|wav)$/.test(filename)
      || /\.(?:amr|flac|m4a|mp3|ogg|opus|silk|wav)(?:\?|$)/.test(url)
  })
}

function extractAttachmentAsrText(event: QQMessageBase): string {
  const attachments = Array.isArray(event.attachments) ? event.attachments : []
  for (const attachment of attachments) {
    const asrText = attachment.asr_refer_text?.trim()
    if (asrText)
      return asrText
  }

  return ''
}

function resolveInboundMessageText(event: QQMessageBase, contextLabel: string): string {
  const trimmedText = event.content?.trim() ?? ''
  if (trimmedText)
    return trimmedText

  const asrText = extractAttachmentAsrText(event)
  if (asrText) {
    log.log(`Received ${contextLabel} audio message with ASR text, forwarding ASR transcript`)
    return asrText
  }

  if (hasAudioLikeAttachment(event)) {
    log.warn(`Received ${contextLabel} audio message but no asr_refer_text found, skipping forwarding`)
  }

  return ''
}

function resolveInboundMentionedMessageText(event: QQMessageBase, contextLabel: string, cleanMention: (text: string) => string): string {
  const cleanedText = cleanMention(event.content ?? '')
  if (cleanedText)
    return cleanedText

  const asrText = extractAttachmentAsrText(event)
  if (asrText) {
    log.log(`Received ${contextLabel} audio mention with ASR text, forwarding ASR transcript`)
    return asrText
  }

  if (hasAudioLikeAttachment(event)) {
    log.warn(`Received ${contextLabel} audio mention but no asr_refer_text found, skipping forwarding`)
  }

  return ''
}

function detectQQMediaAttachmentKind(attachment: NonNullable<QQMessageBase['attachments']>[number]): 'image' | 'video' | null {
  const contentType = attachment.content_type?.toLowerCase() ?? ''
  if (contentType.startsWith('image/'))
    return 'image'
  if (contentType.startsWith('video/'))
    return 'video'

  const filename = attachment.filename?.toLowerCase() ?? ''
  if (QQ_IMAGE_EXTENSION_PATTERN.test(filename))
    return 'image'
  if (QQ_VIDEO_EXTENSION_PATTERN.test(filename))
    return 'video'

  const url = attachment.url?.toLowerCase() ?? ''
  if (QQ_IMAGE_EXTENSION_PATTERN.test(url))
    return 'image'
  if (QQ_VIDEO_EXTENSION_PATTERN.test(url))
    return 'video'

  return null
}

function extractQQInboundMediaAttachments(event: QQMessageBase): QQInboundMediaAttachment[] {
  const attachments = Array.isArray(event.attachments) ? event.attachments : []
  const media: QQInboundMediaAttachment[] = []
  const seen = new Set<string>()

  for (const attachment of attachments) {
    const kind = detectQQMediaAttachmentKind(attachment)
    if (!kind)
      continue

    const url = typeof attachment.url === 'string' ? attachment.url.trim() : ''
    const key = `${kind}:${url}:${attachment.filename ?? ''}:${attachment.content_type ?? ''}`
    if (seen.has(key))
      continue

    seen.add(key)
    media.push({
      kind,
      url: url || undefined,
      contentType: attachment.content_type,
      filename: attachment.filename,
    })
  }

  return media
}

function buildQQInboundTextWithMedia(options: {
  text: string
  mediaAttachments: QQInboundMediaAttachment[]
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
    ...(hasVisionDowngrade ? { extraSystemInstruction: QQ_VISION_DOWNGRADE_NOTICE } : {}),
  }
}

function logInboundVoicePush(contextLabel: string, event: QQMessageBase) {
  const attachments = Array.isArray(event.attachments) ? event.attachments : []
  const hasVoice = hasAudioLikeAttachment(event)
  const isEmptyText = !event.content?.trim()
  if (!hasVoice && attachments.length === 0 && !isEmptyText)
    return

  log.log(`[QQ Voice Push] ${contextLabel} inbound message detected`)
  log.log(`[QQ Voice Push] messageId=${event.id}, contentLength=${event.content?.length ?? 0}, attachments=${attachments.length}, hasAudioLikeAttachment=${hasVoice}`)
  try {
    log.log(`[QQ Voice Push] rawEvent=${JSON.stringify(event)}`)
  }
  catch (error) {
    log.warn(`[QQ Voice Push] failed to stringify raw event: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (attachments.length > 0) {
    const summary = attachments.slice(0, 5).map((attachment, index) => ({
      asrTextPreview: (attachment.asr_refer_text ?? '').slice(0, 80),
      contentType: attachment.content_type ?? '',
      filename: attachment.filename ?? '',
      index,
      urlPreview: (attachment.url ?? '').slice(0, 120),
    }))
    log.log(`[QQ Voice Push] attachmentsSummary=${JSON.stringify(summary)}`)
  }
}

function limitReplyChunks(chunks: string[], maxChunks: number): string[] {
  if (chunks.length <= maxChunks)
    return chunks

  return chunks.slice(0, maxChunks)
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

function isTokenExpiredApiError(message: string): boolean {
  return /token not exist or expire/i.test(message)
    || /"code"\s*:\s*11244/.test(message)
    || /"err_code"\s*:\s*11244/.test(message)
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
        log.withError(error as Error).error('SessionQueue task failed')
      }
    })
    return this.queue
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
  private aiGirlfriendEnabled = false
  private memeProbability = 0.2
  private emotionMemePacks: QQEmotionMemePackConfig[] = []
  private ttsConfig: QQTtsConfig | null = null
  private visionProviderId = ''
  private visionModel = ''
  private supportsImageInput = false
  private supportsVideoInput = false
  private readonly ttsProviderCache = new Map<string, any>()
  private readonly voiceSendQueueByMessage = new Map<string, Promise<void>>()
  private readonly ttsSemaphore = new Semaphore(2)
  private readonly tempAudioDir = join(tmpdir(), 'airi-qq-tts')
  private readonly qqContextBySessionId = new Map<string, QQInputContext>()
  private readonly replySeqByMessageId = new Map<string, number>()
  private readonly recentlySentFingerprints = new Map<string, number>()
  private readonly recentlyForwardedMessageIds = new Map<string, number>()
  private readonly recentlyRepliedMessageIds = new Map<string, number>()
  private readonly boundAccountsByKey = new Set<string>()
  private readonly sessionQueues = new Map<string, SessionQueue>()
  private proactiveTimer: ReturnType<typeof setInterval> | null = null
  private readonly lastProactiveTimeBySession = new Map<string, number>()

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
    const mergedDetails = {
      ...this.buildRuntimeDetails(),
      ...details,
    }

    this.airiClient.send({
      type: 'module:status',
      data: {
        identity: QQ_MODULE_IDENTITY,
        phase,
        reason,
        details: mergedDetails,
      },
    } as WebSocketEvent)
  }

  private buildRuntimeDetails(): Record<string, unknown> {
    return {
      boundUserIds: this.getBoundUserIds(),
      aiGirlfriendEnabled: this.aiGirlfriendEnabled,
      memeProbability: this.memeProbability,
      memePackCount: this.emotionMemePacks.length,
      visionProviderId: this.visionProviderId || undefined,
      visionModel: this.visionModel || undefined,
      supportsImageInput: this.supportsImageInput,
      supportsVideoInput: this.supportsVideoInput,
    }
  }

  private getBoundUserIds(): string[] {
    return Array.from(this.boundAccountsByKey)
      .map((key) => {
        if (!key.startsWith('official:'))
          return ''
        return key.slice('official:'.length)
      })
      .filter(Boolean)
  }

  private setBoundAccountsFromUserIds(userIds: string[]) {
    this.boundAccountsByKey.clear()
    for (const userId of userIds) {
      const normalized = userId.trim()
      if (!normalized)
        continue
      this.boundAccountsByKey.add(`official:${normalized}`)
    }
  }

  private async applyConfiguration(config: QQModuleConfig): Promise<void> {
    log.log(`Received QQ module config: enabled=${config.enabled !== false}, method=${config.method ?? 'official'}, hasOfficialToken=${Boolean(config.officialToken?.trim())}`)
    this.moduleEnabled = config.enabled !== false
    this.method = config.method ?? 'official'
    this.configuredToken = config.officialToken?.trim() ?? ''
    this.voiceReplyMode = config.voiceReplyMode ?? 'text'
    this.aiGirlfriendEnabled = config.aiGirlfriendEnabled ?? false
    this.memeProbability = typeof config.memeProbability === 'number'
      ? Math.min(1, Math.max(0, config.memeProbability))
      : 0.2
    this.emotionMemePacks = Array.isArray(config.emotionMemePacks)
      ? config.emotionMemePacks
      : []
    this.setBoundAccountsFromUserIds(config.boundUserIds ?? [])
    this.ttsConfig = config.tts ?? null
    this.visionProviderId = config.vision?.providerId?.trim() ?? ''
    this.visionModel = config.vision?.model?.trim() ?? ''
    this.supportsImageInput = config.vision?.supportsImageInput === true
    this.supportsVideoInput = config.vision?.supportsVideoInput === true

    // 如果只是配置更新且网关已经连接，只需要更新内部状态，无需断开重连
    if (this.moduleEnabled && this.method === 'official' && this.gatewaySocket?.readyState === WebSocket.OPEN) {
      log.log('QQ module config applied (hot reload)')
      this.emitModuleStatus('ready', 'QQ module config hot reloaded')
      return
    }

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

  private async forceRefreshAccessToken(): Promise<string> {
    if (!this.authState)
      throw new Error('QQ auth state unavailable')

    this.authState.accessToken = ''
    this.authState.expiresAt = 0
    return this.ensureAccessToken()
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

  private async handleC2CMessage(event: QQC2CMessage): Promise<void> {
    logInboundVoicePush('QQ C2C', event)

    const userOpenId = event.author?.user_openid
    if (!userOpenId)
      return

    const text = resolveInboundMessageText(event, 'QQ C2C')
    const mediaAttachments = extractQQInboundMediaAttachments(event)
    if (!text && mediaAttachments.length === 0)
      return

    const context: QQInputContext = {
      kind: 'c2c',
      messageId: event.id,
      userOpenId,
    }
    if (text && this.tryHandleBuiltInCommand(context, text))
      return

    log.log(`Received QQ C2C message: messageId=${event.id}, userOpenId=${userOpenId}, len=${text.length}, media=${mediaAttachments.length}`)
    await this.sendInputToAiri({
      content: text,
      rawContent: event.content,
      context,
      senderDisplayName: event.author?.username ?? 'QQ User',
      mediaAttachments,
    })
  }

  private async handleGroupAtMessage(event: QQGroupAtMessage): Promise<void> {
    logInboundVoicePush('QQ Group@', event)

    if (event.author?.bot)
      return

    const groupOpenId = event.group_openid
    if (!groupOpenId)
      return

    const content = resolveInboundMentionedMessageText(event, 'QQ Group@', value => this.cleanMentionContent(value))
    const mediaAttachments = extractQQInboundMediaAttachments(event)
    if (!content && mediaAttachments.length === 0)
      return

    const context: QQInputContext = {
      kind: 'group',
      messageId: event.id,
      groupOpenId,
      userOpenId: event.author?.member_openid,
    }
    if (content && this.tryHandleBuiltInCommand(context, content))
      return

    log.log(`Received QQ Group@ message: messageId=${event.id}, groupOpenId=${groupOpenId}, len=${content.length}, media=${mediaAttachments.length}`)
    await this.sendInputToAiri({
      content,
      rawContent: event.content,
      context,
      senderDisplayName: event.author?.username ?? 'QQ Group User',
      mediaAttachments,
    })
  }

  private async handleChannelAtMessage(event: QQChannelAtMessage): Promise<void> {
    logInboundVoicePush('QQ Channel@', event)

    if (event.author?.bot)
      return

    const channelId = event.channel_id
    if (!channelId)
      return

    const content = resolveInboundMentionedMessageText(event, 'QQ Channel@', value => this.cleanMentionContent(value))
    const mediaAttachments = extractQQInboundMediaAttachments(event)
    if (!content && mediaAttachments.length === 0)
      return

    const context: QQInputContext = {
      kind: 'channel',
      messageId: event.id,
      channelId,
      guildId: event.guild_id,
      userOpenId: event.author?.id,
    }
    if (content && this.tryHandleBuiltInCommand(context, content))
      return

    log.log(`Received QQ Channel@ message: messageId=${event.id}, channelId=${channelId}, len=${content.length}, media=${mediaAttachments.length}`)
    await this.sendInputToAiri({
      content,
      rawContent: event.content,
      context,
      senderDisplayName: event.author?.username ?? 'QQ Channel User',
      mediaAttachments,
    })
  }

  private getSessionQueue(context: QQInputContext): SessionQueue {
    const key = `${context.kind}:${context.userOpenId || context.groupOpenId || context.channelId}`
    if (!this.sessionQueues.has(key))
      this.sessionQueues.set(key, new SessionQueue())
    return this.sessionQueues.get(key)!
  }

  private async checkProactiveMessages() {
    if (!this.moduleEnabled || !this.aiGirlfriendEnabled)
      return

    const now = new Date()
    const hour = now.getHours()
    if (hour < 8 || hour >= 20)
      return

    for (const boundKey of this.boundAccountsByKey) {
      const userOpenId = boundKey
      const sessionId = `qq-c2c-${userOpenId}`

      const lastTime = this.lastProactiveTimeBySession.get(sessionId) || 0
      const hoursSinceLast = (Date.now() - lastTime) / (1000 * 60 * 60)

      if (lastTime > 0 && hoursSinceLast < 3)
        continue

      if (Math.random() > 0.1)
        continue

      this.lastProactiveTimeBySession.set(sessionId, Date.now())

      const scenarios = [
        '游戏邀请：问问要不要一起打游戏',
        '早安问候：新的一天开始了',
        '晚安问候：提醒早点休息',
        '日常关心：问问吃饭了没或者工作累不累',
        '分享趣事：假装看到一个好玩的段子或者图片',
        '撒娇卖萌：表达想念',
      ]
      const scenario = scenarios[Math.floor(Math.random() * scenarios.length)]

      const context: QQInputContext = {
        kind: 'c2c',
        messageId: '',
        userOpenId,
      }

      log.log(`[Proactive] Triggering proactive message for ${userOpenId}, scenario: ${scenario}`)

      const triggerText = `【系统提示：触发主动消息推送，场景为“${scenario}”。请直接输出你作为女友想要对我说的话，自然一点，不要带系统前缀。】`

      await this.sendInputToAiri({
        content: triggerText,
        rawContent: triggerText,
        context,
        senderDisplayName: 'System',
      })
    }
  }

  private getBoundAccountKey(context: QQInputContext): string | null {
    const userOpenId = context.userOpenId?.trim()
    if (!userOpenId)
      return null
    return userOpenId
  }

  private tryHandleBuiltInCommand(context: QQInputContext, content: string): boolean {
    const normalized = content.trim()
    if (normalized === '#绑定此账号') {
      const boundKey = this.getBoundAccountKey(context)
      if (boundKey) {
        if (!this.boundAccountsByKey.has(boundKey)) {
          this.boundAccountsByKey.add(boundKey)
          this.syncBoundUserIdsToServer()
          log.log(`Bound account: ${boundKey}`)
        }
        void this.ensureAccessToken().then(token => this.sendQQText(token, context, '绑定成功！'))
      }
      else {
        void this.ensureAccessToken().then(token => this.sendQQText(token, context, '绑定失败：无法获取用户标识'))
      }
      return true
    }
    return false
  }

  private syncBoundUserIdsToServer(): void {
    const userIds = Array.from(this.boundAccountsByKey)
    // Client.send 或者是通知到外部。因为 QQAdapter 没有直接修改 Server Config 的 RPC 方法
    // 我们借助 Client 发送一个事件给 Server 端处理，或者目前就只能等用户在界面上操作
    // 更好的方式是通过 module/status 事件将状态带出去，在 stage-server/server-runtime 侧拦截
    this.emitModuleStatus('configured', `qq-bot-bound-update:${JSON.stringify(userIds)}`)
  }

  private extractSkillDirectives(message: unknown, textContent: string): { directives: QQSkillDirective[], remainingText: string } {
    const directives: QQSkillDirective[] = []

    if (message && typeof message === 'object') {
      const record = message as Record<string, unknown>
      const slices = Array.isArray(record.slices) ? record.slices : []
      for (const slice of slices) {
        if (typeof slice !== 'object' || !slice)
          continue
        const s = slice as Record<string, unknown>
        if (s.type !== 'tool-call')
          continue
        const toolCall = (s.toolCall ?? {}) as Record<string, unknown>
        if (typeof toolCall.toolName !== 'string')
          continue
        directives.push({
          name: toolCall.toolName,
          payload: this.parseDirectivePayload(toolCall.args),
        })
      }

      const toolCalls = Array.isArray(record.tool_calls) ? record.tool_calls : []
      for (const toolCall of toolCalls) {
        if (typeof toolCall !== 'object' || !toolCall)
          continue
        const item = toolCall as Record<string, unknown>
        const fn = (item.function ?? {}) as Record<string, unknown>
        if (typeof fn.name !== 'string')
          continue
        directives.push({
          name: fn.name,
          payload: this.parseDirectivePayload(fn.arguments),
        })
      }
    }

    const inlineDirectives: QQSkillDirective[] = []
    const remainingText = textContent.replace(/\[skill:([\w.-]+)(?:\s+(\{[\s\S]*?\}))?\]/gi, (_full, name, rawPayload) => {
      inlineDirectives.push({
        name: String(name),
        payload: this.parseDirectivePayload(rawPayload),
      })
      return ''
    }).trim()
    directives.push(...inlineDirectives)

    const deduped: QQSkillDirective[] = []
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

  private parseDirectivePayload(raw: unknown): Record<string, unknown> {
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

  private getStringFromPayload(payload: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = payload[key]
      if (typeof value === 'string' && value.trim())
        return value.trim()
    }
    return ''
  }

  private async executeSkillDirective(accessToken: string, context: QQInputContext, directive: QQSkillDirective): Promise<string> {
    if (directive.name === 'qq.send_meme') {
      // 这里的 state 就是大模型自主分析的自身情绪状态，我们不再根据上下文或用户输入进行强行映射，
      // 而是直接使用大模型传来的 state
      const state = this.getStringFromPayload(directive.payload, ['state', 'emotion', 'mood', 'keyword'])
      const states = this.emotionMemePacks.map(p => p.state).filter(Boolean)
      const validState = states.find(s => s === state) || states[0] || '开心'

      const sent = await this.maybeSendMeme(accessToken, context, validState, true)
      return sent
        ? `qq.send_meme sent (${state || 'random'})`
        : `qq.send_meme skipped (${state || 'random'})`
    }

    if (directive.name === 'qq.send_voice') {
      const content = this.getStringFromPayload(directive.payload, ['content', 'text'])
      if (content) {
        const key = `${context.kind}:${context.messageId}`
        void this.enqueueVoiceSend(key, async () => {
          await this.generateAndSendVoiceOrFallback(accessToken, context, content, 'voice')
        })
        return `qq.send_voice processing`
      }
    }

    return `未识别的 skill: ${directive.name}`
  }

  private chooseMemePack(preferredState?: string): QQEmotionMemePackConfig | null {
    const candidates = this.emotionMemePacks.filter(pack => Array.isArray(pack.images) && pack.images.length > 0)
    if (candidates.length === 0)
      return null

    const normalizedState = preferredState?.trim().toLowerCase() ?? ''
    if (normalizedState) {
      // 优先精准匹配 state
      const exact = candidates.find(pack => pack.state.trim().toLowerCase() === normalizedState)
      if (exact)
        return exact

      // 其次模糊匹配
      const fuzzy = candidates.find(pack => pack.state.trim().toLowerCase().includes(normalizedState) || normalizedState.includes(pack.state.trim().toLowerCase()))
      if (fuzzy)
        return fuzzy
    }

    // 如果未找到或者没有传递 state，则随机兜底
    const randomIndex = Math.floor(Math.random() * candidates.length)
    return candidates[randomIndex] ?? null
  }

  private async maybeSendMeme(accessToken: string, context: QQInputContext, preferredState?: string, force = false): Promise<boolean> {
    if (!force) {
      const probability = Math.min(1, Math.max(0, this.memeProbability))
      if (Math.random() > probability)
        return false
    }

    const pack = this.chooseMemePack(preferredState)
    if (!pack)
      return false

    const image = pack.images[Math.floor(Math.random() * pack.images.length)]
    if (!image?.dataBase64?.trim())
      return false

    let base64Data = image.dataBase64.trim()
    if (base64Data.startsWith('data:')) {
      const commaIndex = base64Data.indexOf(',')
      if (commaIndex !== -1) {
        base64Data = base64Data.slice(commaIndex + 1)
      }
    }

    const imageBuffer = Buffer.from(base64Data, 'base64')
    if (imageBuffer.length === 0)
      return false

    try {
      log.log(`[qq.skill] Executing maybeSendMeme with state="${preferredState}", selected pack="${pack.state}"`)
      await this.sendQQImageBuffer(accessToken, context, imageBuffer)
      return true
    }
    catch (error) {
      log.error('Failed to send meme', error)
      return false
    }
  }

  private async sendInputToAiri(params: {
    content: string
    rawContent: string
    context: QQInputContext
    senderDisplayName: string
    mediaAttachments?: QQInboundMediaAttachment[]
  }): Promise<void> {
    const { content, rawContent, context, senderDisplayName } = params
    if (this.isDuplicateInboundMessage(context)) {
      log.warn(`Skipped duplicate QQ inbound message: kind=${context.kind}, messageId=${context.messageId}`)
      return
    }

    const contextNotice = `Source: QQ (${context.kind}), messageId=${context.messageId}.`
    const sessionId = createSessionIdByContext(context)
    const mediaAttachments = Array.isArray(params.mediaAttachments) ? params.mediaAttachments : []
    const mediaAdjustedInput = buildQQInboundTextWithMedia({
      text: content,
      mediaAttachments,
      supportsImageInput: this.supportsImageInput,
      supportsVideoInput: this.supportsVideoInput,
    })
    const outboundText = mediaAdjustedInput.text.trim()
    const outboundAttachments = mediaAdjustedInput.attachments
    if (!outboundText && outboundAttachments.length === 0)
      return
    const isBound = this.boundAccountsByKey.has(this.getBoundAccountKey(context) ?? '')

    const systemInstructions = [QQ_MULTI_MESSAGE_STYLE_NOTICE]
    if (mediaAdjustedInput.extraSystemInstruction) {
      systemInstructions.push(mediaAdjustedInput.extraSystemInstruction)
    }

    // 把表情包状态列表注入到系统提示词中
    if (this.emotionMemePacks.length > 0) {
      const states = this.emotionMemePacks.map(p => p.state).filter(Boolean)
      if (states.length > 0) {
        systemInstructions.push(
          `当需要发送表情包时，你只能从以下情绪状态中选择最符合你当前心情的一个作为 state 参数调用 qq.send_meme 工具：`,
          `[${states.join(', ')}]`,
          `请注意，不要根据用户的输入来猜测他们的情绪，而是要表达你（AI 女友）自己当前的情感状态。`,
        )
      }
    }

    if (this.aiGirlfriendEnabled && isBound) {
      systemInstructions.push('【系统提示：当前处于 AI 女友模式。请模拟女友身份，以自然、亲密、生动的方式与用户交流。】')
    }

    this.qqContextBySessionId.set(sessionId, context)
    log.log(`[QQ->AIRI:text] ${outboundText || '00000'}`)
    log.log(`Forwarding QQ message to AIRI: kind=${context.kind}, sessionId=${sessionId}, messageId=${context.messageId}`)

    this.airiClient.send({
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
          messagePrefix: `[QQ:${senderDisplayName}] `,
        },
        contextUpdates: [{
          strategy: ContextUpdateStrategy.AppendSelf,
          text: contextNotice,
          content: contextNotice,
          metadata: {
            qq: context,
          },
        }, {
          strategy: ContextUpdateStrategy.AppendSelf,
          text: systemInstructions.join('\n\n'),
          content: systemInstructions.join('\n\n'),
          metadata: {
            qq: context,
          },
        }],
        qq: context,
        sourceTags: ['qq'],
      } as any,
    } as any)
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

    const rawContent = getMessageContent(event.data.message).trim()
    const { directives, remainingText } = this.extractSkillDirectives(event.data.message, rawContent)
    if (!remainingText && directives.length === 0)
      return

    log.log(`[AIRI->QQ:text] ${remainingText || '[no-text]'}`)

    const replyFingerprint = `${qqContext.kind}:${qqContext.messageId}:${JSON.stringify({
      directives: directives.map(d => ({ name: d.name, payload: d.payload })),
      text: remainingText,
    })}`
    if (this.isDuplicateReply(replyFingerprint)) {
      log.warn(`Skipped duplicate AIRI reply for QQ: kind=${qqContext.kind}, messageId=${qqContext.messageId}`)
      return
    }

    try {
      log.debug('[AIRI<-] output:text', { text: remainingText, directives })
      log.log(`Received AIRI reply for QQ: kind=${qqContext.kind}, messageId=${qqContext.messageId}, len=${remainingText.length}, directives=${directives.length}`)
      const accessToken = await this.ensureAccessToken()
      const sessionQueue = this.getSessionQueue(qqContext)

      if (directives.length > 0) {
        sessionQueue.enqueue(async () => {
          for (const directive of directives) {
            const result = await this.executeSkillDirective(accessToken, qqContext, directive)
            log.log(`[qq.skill] ${result}`)
            await this.waitReplyInterval()
          }
        })
      }

      if (remainingText) {
        const parsedItems = parseReplyItems(remainingText, MAX_QQ_REPLY_ITEMS)
        const fallbackChunks = limitReplyChunks(splitMessage(remainingText), MAX_QQ_REPLY_ITEMS)
        const replyItems = parsedItems.length > 0
          ? parsedItems
          : fallbackChunks.map(chunk => chunk.trim()).filter(Boolean)
        log.log(`Sending QQ text reply in ${replyItems.length} item(s)`)

        for (const [index, item] of replyItems.entries()) {
          sessionQueue.enqueue(async () => {
            await this.sendQQReply(accessToken, qqContext, item)
            if (index < replyItems.length - 1) {
              await this.waitReplyInterval()
            }
          })
        }
      }
    }
    catch (error) {
      log.withError(error as Error).error('[AIRI<-] output:error', error)
    }
  }

  private async sendQQReply(accessToken: string, context: QQInputContext, content: string): Promise<void> {
    const normalizedContent = content.trim()
    if (!normalizedContent)
      return

    let mode = this.voiceReplyMode
    let wantsMeme = false

    const isBound = this.boundAccountsByKey.has(this.getBoundAccountKey(context) ?? '')
    if (this.aiGirlfriendEnabled && isBound) {
      // 在 AI 女友模式下，完全由 AI 的自主决定（通过指令或特定逻辑）控制是否发送表情包和语音，
      // 这里的兜底配置失效，只处理文本，语音和表情包交由大模型工具调用等高级逻辑处理。
      mode = 'text'
      wantsMeme = false
    }
    else {
      // 在非AI女友模式下，根据概率决定是否发送
      const r = Math.random()
      if (r < this.memeProbability) {
        wantsMeme = true
      }
    }

    const wantsText = mode === 'text' || mode === 'both'
    const wantsVoice = mode === 'voice' || mode === 'both'

    const sendTextOrMeme = async () => {
      if (wantsText) {
        await this.sendQQText(accessToken, context, normalizedContent)
      }
      if (wantsMeme) {
        if (wantsText) {
          // 如果前面发送了文本，这里等待一个随机的发送间隔，模拟真人
          await this.waitReplyInterval()
        }
        const sentMeme = await this.maybeSendMeme(accessToken, context, normalizedContent)
        // 如果表情包发送失败且之前没有发过文本（比如模式仅为表情包），兜底发送文本
        if (!sentMeme && !wantsText) {
          await this.sendQQText(accessToken, context, normalizedContent)
        }
      }
    }

    if (wantsText && mode === 'both') {
      await this.sendQQText(accessToken, context, normalizedContent)
    }

    if (!wantsVoice) {
      await sendTextOrMeme()
      return
    }

    const key = `${context.kind}:${context.messageId}`
    void this.enqueueVoiceSend(key, async () => {
      try {
        await this.generateAndSendVoiceOrFallback(accessToken, context, normalizedContent, mode)
      }
      catch (error) {
        log.error('Failed to generate and send voice, fallback should have been triggered', error)
      }

      // 如果语音发送失败（此时由于 fallback 会发文本），或者原本就是 both 模式（已经发过文本）
      // 我们需要在此时补充发送表情包
      if (wantsMeme) {
        await this.waitReplyInterval()
        await this.maybeSendMeme(accessToken, context, normalizedContent)
      }
    })
  }

  private async waitReplyInterval(): Promise<void> {
    const intervalMs = MIN_REPLY_INTERVAL_MS + Math.floor(Math.random() * (MAX_REPLY_INTERVAL_MS - MIN_REPLY_INTERVAL_MS + 1))
    await sleep(intervalMs)
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

    // Force mp3 output for QQ voice upload to avoid QQ-side wav->pcm conversion failures.
    const outputFormat: AudioFormat = 'mp3'
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
      else if (textPayload.startsWith('{') || textPayload.startsWith('[')) {
        try {
          const reparsedBuffer = normalizeSpeechResultToBuffer(textPayload)
          const reparsedFormat = detectAudioFormat(reparsedBuffer)
          if (reparsedFormat !== 'unknown') {
            outputBuffer = reparsedBuffer
            format = reparsedFormat
          }
        }
        catch {}
      }
    }

    const ext = (format === 'unknown' ? outputFormat : format)
    try {
      const filePath = await this.writeTempAudioFile(outputBuffer, ext)
      await this.safeUnlink(filePath)
    }
    catch { }
    return outputBuffer
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

    const uploadAudio = audio

    const base64 = uploadAudio.toString('base64')
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

    const body: Record<string, unknown> = {
      msg_type: 7,
      media: {
        file_info: fileInfo,
      },
    }
    if (context.messageId?.trim()) {
      body.msg_seq = this.nextReplySeq(context)
      body.msg_id = context.messageId
    }
    await this.qqApiRequest(accessToken, 'POST', msgPath, body)
  }

  private async sendQQImageBuffer(accessToken: string, context: QQInputContext, image: Buffer): Promise<void> {
    if (context.kind === 'channel') {
      log.warn('[qq.send_meme] channel context currently does not support qq image upload, skipped')
      return
    }
    if (context.kind === 'c2c' && !context.userOpenId)
      throw new Error('QQ image send failed: missing userOpenId')
    if (context.kind === 'group' && !context.groupOpenId)
      throw new Error('QQ image send failed: missing groupOpenId')

    const uploadPath = context.kind === 'c2c'
      ? `/v2/users/${context.userOpenId}/files`
      : `/v2/groups/${context.groupOpenId}/files`

    const upload = await this.qqApiRequestJson<{ file_info?: string }>(accessToken, 'POST', uploadPath, {
      file_type: 1,
      srv_send_msg: false,
      file_data: image.toString('base64'),
    })
    const fileInfo = upload?.file_info
    if (!fileInfo)
      throw new Error('QQ image upload returned empty file_info')

    const msgPath = context.kind === 'c2c'
      ? `/v2/users/${context.userOpenId}/messages`
      : `/v2/groups/${context.groupOpenId}/messages`
    const body: Record<string, unknown> = {
      msg_type: 7,
      media: {
        file_info: fileInfo,
      },
    }
    if (context.messageId?.trim()) {
      body.msg_seq = this.nextReplySeq(context)
      body.msg_id = context.messageId
    }
    await this.qqApiRequest(accessToken, 'POST', msgPath, body)
  }

  private async qqApiRequestJson<T>(accessToken: string, method: 'POST' | 'GET', path: string, body?: unknown, hasRetriedTokenRefresh = false): Promise<T> {
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

    if (!hasRetriedTokenRefresh && isTokenExpiredApiError(lastError)) {
      const refreshedAccessToken = await this.forceRefreshAccessToken()
      log.warn('QQ API token expired while requesting JSON, refreshed token and retrying once')
      return this.qqApiRequestJson<T>(refreshedAccessToken, method, path, body, true)
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

  private async qqApiRequest(accessToken: string, method: 'POST' | 'GET', path: string, body?: unknown, hasRetriedTokenRefresh = false): Promise<void> {
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

    if (!hasRetriedTokenRefresh && isTokenExpiredApiError(lastError)) {
      const refreshedAccessToken = await this.forceRefreshAccessToken()
      log.warn('QQ API token expired while requesting endpoint, refreshed token and retrying once')
      await this.qqApiRequest(refreshedAccessToken, method, path, body, true)
      return
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
      this.proactiveTimer = setInterval(() => {
        void this.checkProactiveMessages()
      }, 10 * 60 * 1000)
    }
    else {
      log.warn('QQ official adapter is idle, waiting for module configuration.')
      this.emitModuleStatus('preparing', 'QQ adapter started, waiting for module configuration')
    }
  }

  async stop(): Promise<void> {
    this.isStopping = true
    if (this.proactiveTimer) {
      clearInterval(this.proactiveTimer)
      this.proactiveTimer = null
    }
    await this.disconnectGateway()
    this.airiClient.close()
    log.log('QQ official adapter stopped')
  }
}

function _detectAudioFormatFromProviderConfig(config: Record<string, unknown>): AudioFormat | null {
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
