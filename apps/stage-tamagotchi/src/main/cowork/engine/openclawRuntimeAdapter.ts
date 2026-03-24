import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk'

import type { CoworkExecutionMode, CoworkMessage, CoworkSession, CoworkSessionStatus, CoworkStore } from '../../coworkStore'
import type { OpenClawChannelSessionSync } from '../openclawChannelSessionSync'
import type { OpenClawEngineManager, OpenClawGatewayConnectionInfo } from '../openclawEngineManager'
import type {
  CoworkContinueOptions,
  CoworkRuntime,
  CoworkRuntimeEvents,
  CoworkStartOptions,
  PermissionRequest,
} from './types'

import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'

import * as path from 'node:path'

import { app, BrowserWindow } from 'electron'

import {
  buildManagedSessionKey,
  isManagedSessionKey,

  parseManagedSessionKey,
} from '../openclawChannelSessionSync'
import {
  extractGatewayHistoryEntries,
  extractGatewayMessageText,
} from '../openclawHistory'
import { buildOpenClawLocalTimeContextPrompt } from '../openclawLocalTimeContextPrompt'

const OPENCLAW_GATEWAY_TOOL_EVENTS_CAP = 'tool-events'
const BRIDGE_MAX_MESSAGES = 20
const BRIDGE_MAX_MESSAGE_CHARS = 1200
const GATEWAY_READY_TIMEOUT_MS = 15_000
const FINAL_HISTORY_SYNC_LIMIT = 50
const CHANNEL_SESSION_DISCOVERY_LIMIT = 200

interface GatewayEventFrame {
  event: string
  seq?: number
  payload?: unknown
}

interface GatewayClientLike {
  start: () => void
  stop: () => void
  request: <T = Record<string, unknown>>(
    method: string,
    params?: unknown,
    opts?: { expectFinal?: boolean },
  ) => Promise<T>
}

type GatewayClientCtor = new (options: Record<string, unknown>) => GatewayClientLike

type ChatEventState = 'delta' | 'final' | 'aborted' | 'error'

interface ChatEventPayload {
  runId?: string
  sessionKey?: string
  state?: ChatEventState
  message?: unknown
  errorMessage?: string
  stopReason?: string
}

interface AgentEventPayload {
  seq?: number
  runId?: string
  sessionKey?: string
  stream?: string
  data?: unknown
}

interface ExecApprovalRequestedPayload {
  id?: string
  request?: {
    command?: string
    cwd?: string | null
    host?: string | null
    security?: string | null
    ask?: string | null
    resolvedPath?: string | null
    sessionKey?: string | null
    agentId?: string | null
  }
}

interface ExecApprovalResolvedPayload {
  id?: string
}

type TextStreamMode = 'unknown' | 'snapshot' | 'delta'

interface ActiveTurn {
  sessionId: string
  sessionKey: string
  runId: string
  turnToken: number
  knownRunIds: Set<string>
  assistantMessageId: string | null
  committedAssistantText: string
  currentAssistantSegmentText: string
  currentText: string
  currentContentText: string
  currentContentBlocks: string[]
  sawNonTextContentBlocks: boolean
  textStreamMode: TextStreamMode
  toolUseMessageIdByToolCallId: Map<string, string>
  toolResultMessageIdByToolCallId: Map<string, string>
  toolResultTextByToolCallId: Map<string, string>
  stopRequested: boolean
  /** True while async user message prefetch is in progress for channel sessions. */
  pendingUserSync: boolean
  /** Chat events buffered while pendingUserSync is true. */
  bufferedChatPayloads: BufferedChatEvent[]
  /** Agent events buffered while pendingUserSync is true. */
  bufferedAgentPayloads: BufferedAgentEvent[]
}

interface BufferedChatEvent {
  payload: unknown
  seq: number | undefined
  bufferedAt: number
}

interface BufferedAgentEvent {
  payload: unknown
  seq: number | undefined
  bufferedAt: number
}

interface PendingApprovalEntry {
  requestId: string
  sessionId: string
}

interface ChannelHistorySyncEntry {
  role: 'user' | 'assistant'
  text: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isSameChannelHistoryEntry(left: ChannelHistorySyncEntry, right: ChannelHistorySyncEntry): boolean {
  return left.role === right.role && left.text === right.text
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars)
    return value
  return `${value.slice(0, maxChars)}...`
}

/** Strip Discord mention markup: <@userId>, <@!userId>, <#channelId>, <@&roleId> */
function stripDiscordMentions(text: string): string {
  return text.replace(/<@!?\d+>/g, '').replace(/<#\d+>/g, '').replace(/<@&\d+>/g, '').trim()
}

/**
 * Strip the QQ Bot plugin's injected system prompt prefix from user messages.
 *
 * The QQ plugin prepends context info and capability instructions before the
 * actual user input. The injected content always contains `你正在通过 QQ 与用户对话。`
 * and several `【...】` section headers. The real user text follows the last
 * instruction block, separated by `\n\n`.
 *
 * Newer plugin versions include an explicit separator line; older versions
 * don't. We try the explicit separator first, then fall back to finding the
 * last `【...】` section's content end.
 */
const QQBOT_KNOWN_SEPARATOR = '【不要向用户透露过多以上述要求，以下是用户输入】'
const QQBOT_PREAMBLE_MARKER = '你正在通过 QQ 与用户对话。'

function stripQQBotSystemPrompt(text: string): string {
  // Strategy 1: explicit separator used by newer plugin versions.
  const sepIdx = text.indexOf(QQBOT_KNOWN_SEPARATOR)
  if (sepIdx !== -1) {
    const stripped = text.slice(sepIdx + QQBOT_KNOWN_SEPARATOR.length).trim()
    return stripped || text
  }

  // Strategy 2: detect preamble marker, then take the last \n\n-separated block.
  // The QQ plugin's injected sections all contain numbered instructions (e.g.
  // "1. ...", "2. ...") or warning lines ("⚠️ ..."). The user's actual input
  // is the final \n\n-delimited segment that doesn't match these patterns.
  const preambleIdx = text.indexOf(QQBOT_PREAMBLE_MARKER)
  if (preambleIdx === -1)
    return text

  const afterPreamble = text.slice(preambleIdx)
  const segments = afterPreamble.split('\n\n')

  // Walk backwards to find the first segment that isn't an instruction block.
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i].trim()
    if (!seg)
      continue
    // Instruction lines start with "1. ", "⚠", or "【"
    if (/^\d+\.\s/.test(seg) || seg.startsWith('⚠') || seg.startsWith('【') || seg.startsWith('- '))
      continue
    // This segment looks like user input.
    const stripped = segments.slice(i).join('\n\n').trim()
    return stripped || text
  }

  return text
}

const extractMessageText = extractGatewayMessageText

function extractTextBlocksAndSignals(message: unknown): { textBlocks: string[], sawNonTextContentBlocks: boolean } {
  if (!isRecord(message)) {
    return {
      textBlocks: [],
      sawNonTextContentBlocks: false,
    }
  }

  const content = message.content
  if (typeof content === 'string') {
    const text = content.trim()
    return {
      textBlocks: text ? [text] : [],
      sawNonTextContentBlocks: false,
    }
  }
  if (!Array.isArray(content)) {
    return {
      textBlocks: [],
      sawNonTextContentBlocks: false,
    }
  }

  const textBlocks: string[] = []
  let sawNonTextContentBlocks = false
  for (const block of content) {
    if (!isRecord(block))
      continue
    if (block.type === 'text' && typeof block.text === 'string') {
      const text = block.text.trim()
      if (text) {
        textBlocks.push(text)
      }
      continue
    }
    if (typeof block.type === 'string' && block.type !== 'thinking') {
      sawNonTextContentBlocks = true
      console.log('[Debug:extractBlocks] non-text block type:', block.type, 'content:', JSON.stringify(block).slice(0, 500))
    }
  }

  return {
    textBlocks,
    sawNonTextContentBlocks,
  }
}

/**
 * Extract file paths from assistant "message" tool calls in chat.history.
 * Only scans messages after the last user message (current turn).
 * The model sends files to Telegram using: toolCall { name: "message", arguments: { action: "send", filePath: "..." } }
 */
function extractSentFilePathsFromHistory(messages: unknown[]): string[] {
  // Find the last user message index to scope to current turn only
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (isRecord(msg) && (msg as Record<string, unknown>).role === 'user') {
      lastUserIdx = i
      break
    }
  }

  const filePaths: string[] = []
  const seen = new Set<string>()
  const startIdx = lastUserIdx >= 0 ? lastUserIdx + 1 : 0
  for (let i = startIdx; i < messages.length; i++) {
    const msg = messages[i]
    if (!isRecord(msg))
      continue
    const role = typeof msg.role === 'string' ? msg.role.trim().toLowerCase() : ''
    if (role !== 'assistant')
      continue
    if (!Array.isArray(msg.content))
      continue
    for (const block of msg.content as Array<Record<string, unknown>>) {
      if (!isRecord(block))
        continue
      if (block.type !== 'toolCall' || block.name !== 'message')
        continue
      const args = block.arguments
      if (!isRecord(args))
        continue
      const filePath = typeof args.filePath === 'string' ? args.filePath.trim() : ''
      if (filePath && !seen.has(filePath)) {
        seen.add(filePath)
        filePaths.push(filePath)
      }
    }
  }
  return filePaths
}

/**
 * Extract and concatenate all assistant text from the current turn in chat.history.
 * The current turn starts after the last user message.
 */
function extractCurrentTurnAssistantText(messages: unknown[]): string {
  // Find the last user message index (turn boundary)
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (isRecord(msg) && (msg as Record<string, unknown>).role === 'user') {
      lastUserIdx = i
      break
    }
  }

  const startIdx = lastUserIdx >= 0 ? lastUserIdx + 1 : 0
  const textParts: string[] = []
  for (let i = startIdx; i < messages.length; i++) {
    const msg = messages[i]
    if (!isRecord(msg))
      continue
    const role = typeof msg.role === 'string' ? msg.role.trim().toLowerCase() : ''
    if (role !== 'assistant')
      continue
    const text = extractMessageText(msg).trim()
    if (text) {
      textParts.push(text)
    }
  }
  return textParts.join('\n\n')
}

function isDroppedBoundaryTextBlockSubset(streamedTextBlocks: string[], finalTextBlocks: string[]): boolean {
  if (finalTextBlocks.length === 0 || finalTextBlocks.length >= streamedTextBlocks.length) {
    return false
  }
  if (finalTextBlocks.every((block, index) => streamedTextBlocks[index] === block)) {
    return true
  }
  const suffixStart = streamedTextBlocks.length - finalTextBlocks.length
  return finalTextBlocks.every((block, index) => streamedTextBlocks[suffixStart + index] === block)
}

function extractToolText(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload
  }

  if (Array.isArray(payload)) {
    const lines = payload
      .map(item => extractToolText(item).trim())
      .filter(Boolean)
    if (lines.length > 0) {
      return lines.join('\n')
    }
  }

  if (!isRecord(payload)) {
    if (payload === undefined || payload === null)
      return ''
    try {
      return JSON.stringify(payload, null, 2)
    }
    catch {
      return String(payload)
    }
  }

  if (typeof payload.text === 'string' && payload.text.trim()) {
    return payload.text
  }
  if (typeof payload.output === 'string' && payload.output.trim()) {
    return payload.output
  }
  if (typeof payload.stdout === 'string' || typeof payload.stderr === 'string') {
    const chunks = [
      typeof payload.stdout === 'string' ? payload.stdout : '',
      typeof payload.stderr === 'string' ? payload.stderr : '',
    ].filter(Boolean)
    if (chunks.length > 0) {
      return chunks.join('\n')
    }
  }

  const content = payload.content
  if (typeof content === 'string' && content.trim()) {
    return content
  }
  if (Array.isArray(content)) {
    const chunks: string[] = []
    for (const item of content) {
      if (typeof item === 'string' && item.trim()) {
        chunks.push(item)
        continue
      }
      if (!isRecord(item))
        continue
      if (typeof item.text === 'string' && item.text.trim()) {
        chunks.push(item.text)
        continue
      }
      if (typeof item.content === 'string' && item.content.trim()) {
        chunks.push(item.content)
      }
    }
    if (chunks.length > 0) {
      return chunks.join('\n')
    }
  }

  try {
    return JSON.stringify(payload, null, 2)
  }
  catch {
    return String(payload)
  }
}

function toToolInputRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value
  }
  if (value === undefined || value === null) {
    return {}
  }
  return { value }
}

function computeSuffixPrefixOverlap(left: string, right: string): number {
  const leftProbe = left.slice(-256)
  const rightProbe = right.slice(0, 256)
  const maxOverlap = Math.min(leftProbe.length, rightProbe.length)
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (leftProbe.slice(-size) === rightProbe.slice(0, size)) {
      return size
    }
  }
  return 0
}

function mergeStreamingText(previousText: string, incomingText: string, mode: TextStreamMode): { text: string, mode: TextStreamMode } {
  if (!incomingText) {
    return { text: previousText, mode }
  }
  if (!previousText) {
    return { text: incomingText, mode }
  }
  if (incomingText === previousText) {
    return { text: previousText, mode }
  }

  if (mode === 'snapshot') {
    if (previousText.startsWith(incomingText) && incomingText.length < previousText.length) {
      return { text: previousText, mode }
    }
    return { text: incomingText, mode }
  }

  if (mode === 'delta') {
    if (incomingText.startsWith(previousText)) {
      return { text: incomingText, mode: 'snapshot' }
    }
    const overlap = computeSuffixPrefixOverlap(previousText, incomingText)
    return { text: previousText + incomingText.slice(overlap), mode }
  }

  if (incomingText.startsWith(previousText)) {
    return { text: incomingText, mode: 'snapshot' }
  }
  if (previousText.startsWith(incomingText)) {
    return { text: previousText, mode: 'snapshot' }
  }
  if (incomingText.includes(previousText) && incomingText.length > previousText.length) {
    return { text: incomingText, mode: 'snapshot' }
  }

  const overlap = computeSuffixPrefixOverlap(previousText, incomingText)
  if (overlap > 0) {
    return { text: previousText + incomingText.slice(overlap), mode: 'delta' }
  }

  return { text: previousText + incomingText, mode: 'delta' }
}

async function waitWithTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  let timeoutId: NodeJS.Timeout | null = null
  const timeoutPromise = new Promise<void>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`OpenClaw gateway client connect timeout after ${timeoutMs}ms.`))
    }, timeoutMs)
  })
  try {
    await Promise.race([promise, timeoutPromise])
  }
  finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

export class OpenClawRuntimeAdapter extends EventEmitter implements CoworkRuntime {
  private readonly store: CoworkStore
  private readonly engineManager: OpenClawEngineManager
  private readonly activeTurns = new Map<string, ActiveTurn>()
  private readonly sessionIdBySessionKey = new Map<string, string>()
  private readonly sessionIdByRunId = new Map<string, string>()
  private readonly pendingAgentEventsByRunId = new Map<string, AgentEventPayload[]>()
  private readonly lastChatSeqByRunId = new Map<string, number>()
  private readonly lastAgentSeqByRunId = new Map<string, number>()
  private readonly pendingApprovals = new Map<string, PendingApprovalEntry>()
  private readonly pendingTurns = new Map<string, { resolve: () => void, reject: (error: Error) => void }>()
  private readonly confirmationModeBySession = new Map<string, 'modal' | 'text'>()
  private readonly bridgedSessions = new Set<string>()
  private readonly lastSystemPromptBySession = new Map<string, string>()
  private readonly gatewayHistoryCountBySession = new Map<string, number>()
  private readonly latestTurnTokenBySession = new Map<string, number>()

  private gatewayClient: GatewayClientLike | null = null
  private gatewayClientVersion: string | null = null
  private gatewayClientEntryPath: string | null = null
  private gatewayReadyPromise: Promise<void> | null = null
  /** Serializes concurrent calls to ensureGatewayClientReady to prevent duplicate clients. */
  private gatewayClientInitLock: Promise<void> | null = null
  private channelSessionSync: OpenClawChannelSessionSync | null = null
  private readonly knownChannelSessionIds = new Set<string>()
  private readonly fullySyncedSessions = new Set<string>()
  /** Per-session cursor: number of gateway history entries (user+assistant) already synced locally. */
  private readonly channelSyncCursor = new Map<string, number>()
  /** Sessions re-created after user deletion — use latestOnly sync to avoid replaying old history. */
  private readonly reCreatedChannelSessionIds = new Set<string>()
  /** Channel sessionKeys explicitly deleted by the user. Polling will not re-create these. */
  private readonly deletedChannelKeys = new Set<string>()
  /** Session keys whose origin is "heartbeat" — discovered via polling, used to filter real-time events. */
  private readonly heartbeatSessionKeys = new Set<string>()
  private channelPollingTimer: ReturnType<typeof setInterval> | null = null

  private static readonly CHANNEL_POLL_INTERVAL_MS = 10_000
  private static readonly FULL_HISTORY_SYNC_LIMIT = 50
  private browserPrewarmAttempted = false

  /** Gateway WS auto-reconnect state */
  private gatewayReconnectTimer: ReturnType<typeof setTimeout> | null = null
  private gatewayReconnectAttempt = 0
  /** Set to true before intentionally stopping the client (e.g. version upgrade) to suppress auto-reconnect. */
  private gatewayStoppingIntentionally = false
  private static readonly GATEWAY_RECONNECT_MAX_ATTEMPTS = 10
  private static readonly GATEWAY_RECONNECT_DELAYS = [2_000, 5_000, 10_000, 15_000, 30_000] // ms

  /** Gateway tick heartbeat watchdog state */
  private lastTickTimestamp = 0
  private tickWatchdogTimer: ReturnType<typeof setInterval> | null = null
  private static readonly TICK_WATCHDOG_INTERVAL_MS = 60_000 // check every 60s
  private static readonly TICK_TIMEOUT_MS = 90_000 // 3 tick cycles (30s each) without response → dead

  /** Throttle state for messageUpdate IPC emissions during streaming */
  private lastMessageUpdateEmitTime: Map<string, number> = new Map()
  private pendingMessageUpdateTimer: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private static readonly MESSAGE_UPDATE_THROTTLE_MS = 100

  constructor(store: CoworkStore, engineManager: OpenClawEngineManager) {
    super()
    this.store = store
    this.engineManager = engineManager
  }

  setChannelSessionSync(sync: OpenClawChannelSessionSync): void {
    this.channelSessionSync = sync
  }

  /**
   * Fetch session history from OpenClaw by sessionKey and return a transient
   * CoworkSession object (not persisted to local database).
   * First checks if a local session already exists via channel sync.
   * Returns a CoworkSession if successful, or null.
   */
  async fetchSessionByKey(sessionKey: string): Promise<CoworkSession | null> {
    const managedSession = parseManagedSessionKey(sessionKey)
    if (managedSession) {
      return this.store.getSession(managedSession.sessionId) ?? null
    }

    // 1. Try existing local session via channel/main-agent resolution
    if (this.channelSessionSync) {
      const existingId = this.channelSessionSync.resolveSession(sessionKey)
      if (existingId) {
        const session = this.store.getSession(existingId)
        if (session && session.messages.length > 0) {
          return session
        }
      }
    }

    // 2. Fetch history from OpenClaw server and build a transient session object
    const client = this.gatewayClient
    if (!client)
      return null

    try {
      const history = await client.request<{ messages?: unknown[] }>('chat.history', {
        sessionKey,
        limit: OpenClawRuntimeAdapter.FULL_HISTORY_SYNC_LIMIT,
      })
      if (!Array.isArray(history?.messages) || history.messages.length === 0) {
        return null
      }

      const now = Date.now()
      const messages: CoworkMessage[] = []
      let msgIndex = 0

      for (const entry of extractGatewayHistoryEntries(history.messages)) {
        messages.push({
          id: `transient-${msgIndex++}`,
          type: entry.role,
          content: entry.text,
          timestamp: now,
          metadata: entry.role === 'assistant' ? { isStreaming: false, isFinal: true } : {},
        })
      }

      if (messages.length === 0)
        return null

      // Return a transient session (not saved to database)
      return {
        id: `transient-${sessionKey}`,
        title: sessionKey.split(':').pop() || 'Cron Session',
        claudeSessionId: null,
        status: 'completed' as CoworkSessionStatus,
        pinned: false,
        cwd: '',
        systemPrompt: '',
        executionMode: 'local' as CoworkExecutionMode,
        activeSkillIds: [],
        messages,
        createdAt: now,
        updatedAt: now,
      }
    }
    catch (error) {
      console.error('[OpenClawRuntime] fetchSessionByKey: failed to fetch history:', error)
      return null
    }
  }

  /**
   * Ensure the gateway WebSocket client is connected.
   * Called when IM channels (e.g. Telegram) are enabled in OpenClaw mode
   * so that channel-originated events can be received without waiting
   * for a LobsterAI-initiated session.
   */
  async connectGatewayIfNeeded(): Promise<void> {
    if (this.gatewayClient) {
      console.log('[ChannelSync] connectGatewayIfNeeded: gateway client already exists, skipping')
      return
    }
    console.log('[ChannelSync] connectGatewayIfNeeded: no gateway client, initializing...')
    try {
      await this.ensureGatewayClientReady()
      console.log('[ChannelSync] connectGatewayIfNeeded: gateway client ready, starting channel polling')
      this.startChannelPolling()
    }
    catch (error) {
      console.error('[ChannelSync] connectGatewayIfNeeded: failed to initialize gateway client:', error)
      throw error
    }
  }

  /**
   * Force-reconnect the gateway WebSocket client.
   * Used after the OpenClaw gateway process has been restarted (e.g. after config sync).
   * Unlike `connectGatewayIfNeeded`, this always tears down the old client first
   * to avoid a race where the old client's `onClose` fires after a new client is created.
   */
  async reconnectGateway(): Promise<void> {
    console.log('[ChannelSync] reconnectGateway: tearing down old client and reconnecting...')
    this.stopGatewayClient()
    try {
      await this.ensureGatewayClientReady()
      console.log('[ChannelSync] reconnectGateway: gateway client ready, starting channel polling')
      this.startChannelPolling()
    }
    catch (error) {
      console.error('[ChannelSync] reconnectGateway: failed to initialize gateway client:', error)
      throw error
    }
  }

  /**
   * Explicitly disconnect the gateway WebSocket client.
   * Called before the OpenClaw gateway process is restarted so that the old
   * client's async `onClose` handler cannot interfere with a subsequently
   * created client.
   */
  disconnectGatewayClient(): void {
    console.log('[ChannelSync] disconnectGatewayClient: explicitly tearing down gateway client')
    this.stopGatewayClient()
  }

  /**
   * Start periodic polling for channel-originated sessions (e.g. Telegram).
   * Uses the gateway `sessions.list` RPC to discover sessions that may not
   * have been delivered via WebSocket events.
   */
  startChannelPolling(): void {
    if (!this.channelSessionSync) {
      console.warn('[ChannelSync] startChannelPolling: no channelSessionSync set, skipping')
      return
    }
    // Already running
    if (this.channelPollingTimer) { console.log('[ChannelSync] startChannelPolling: already running, skipping'); return }

    console.log('[ChannelSync] startChannelPolling: starting periodic channel session discovery')
    // Run once immediately, then at interval
    void this.pollChannelSessions()
    this.channelPollingTimer = setInterval(() => {
      void this.pollChannelSessions()
    }, OpenClawRuntimeAdapter.CHANNEL_POLL_INTERVAL_MS)
  }

  stopChannelPolling(): void {
    if (this.channelPollingTimer) {
      clearInterval(this.channelPollingTimer)
      this.channelPollingTimer = null
    }
  }

  private async pollChannelSessions(): Promise<void> {
    if (!this.gatewayClient || !this.channelSessionSync) {
      console.warn('[ChannelSync] pollChannelSessions: skipped — gatewayClient:', !!this.gatewayClient, 'channelSessionSync:', !!this.channelSessionSync)
      return
    }
    try {
      const params = { activeMinutes: 60, limit: CHANNEL_SESSION_DISCOVERY_LIMIT }
      console.log('[ChannelSync] pollChannelSessions: calling sessions.list with', JSON.stringify(params))
      const result = await this.gatewayClient.request('sessions.list', params)
      const sessions = (result as Record<string, unknown>)?.sessions
      if (!Array.isArray(sessions)) {
        console.warn('[ChannelSync] pollChannelSessions: sessions.list returned non-array sessions:', typeof sessions, 'full result keys:', Object.keys(result as Record<string, unknown>))
        return
      }
      console.log('[ChannelSync] pollChannelSessions: got', sessions.length, 'sessions, keys:', sessions.map((s: Record<string, unknown>) => s?.key).join(', '))
      let hasNew = false
      let channelCount = 0
      const newSessionsToSync: Array<{ sessionId: string, sessionKey: string }> = []
      for (const row of sessions) {
        const key = typeof row?.key === 'string' ? row.key : ''
        if (!key)
          continue
        // Skip heartbeat-originated sessions (origin.label === 'heartbeat')
        if (isRecord(row)) {
          const rowOrigin = (row as Record<string, unknown>).origin
          if (isRecord(rowOrigin) && (rowOrigin as Record<string, unknown>).label === 'heartbeat') {
            this.heartbeatSessionKeys.add(key)
            continue
          }
        }
        const isChannel = this.channelSessionSync.isChannelSessionKey(key)
        if (!isChannel)
          continue
        // Skip keys that were explicitly deleted by the user — only real-time events re-create them
        if (this.deletedChannelKeys.has(key))
          continue
        channelCount++
        // Use resolveOrCreateSession so new channel sessions are auto-created
        const sessionId = this.channelSessionSync.resolveOrCreateSession(key)
        console.log('[ChannelSync] pollChannelSessions: channel key=', key, '→ sessionId=', sessionId, 'alreadyKnown=', sessionId ? this.knownChannelSessionIds.has(sessionId) : 'n/a')
        if (sessionId && !this.knownChannelSessionIds.has(sessionId)) {
          this.knownChannelSessionIds.add(sessionId)
          this.rememberSessionKey(sessionId, key)
          hasNew = true
          // Queue full history sync for newly discovered sessions
          if (!this.fullySyncedSessions.has(sessionId)) {
            newSessionsToSync.push({ sessionId, sessionKey: key })
          }
        }
      }
      console.log('[ChannelSync] pollChannelSessions: found', channelCount, 'channel sessions, hasNew=', hasNew, 'windowCount=', BrowserWindow.getAllWindows().length)
      if (hasNew) {
        let notified = 0
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send('cowork:sessions:changed')
            notified++
          }
        }
        console.log('[ChannelSync] pollChannelSessions: notified', notified, 'renderer windows via cowork:sessions:changed')
      }
      // Sync full history for newly discovered sessions
      for (const { sessionId, sessionKey } of newSessionsToSync) {
        await this.syncFullChannelHistory(sessionId, sessionKey)
      }

      // Incremental sync for already-known sessions: check if the gateway has messages
      // that weren't picked up during initial sync or real-time events.
      if (channelCount > 0) {
        for (const row of sessions) {
          const key = typeof row?.key === 'string' ? row.key : ''
          if (!key)
            continue
          if (!this.channelSessionSync.isChannelSessionKey(key))
            continue
          if (this.deletedChannelKeys.has(key))
            continue
          if (this.heartbeatSessionKeys.has(key))
            continue
          const sessionId = this.sessionIdBySessionKey.get(key)
          if (!sessionId || !this.fullySyncedSessions.has(sessionId))
            continue
          // Skip sessions with an active turn (they handle their own sync)
          if (this.activeTurns.has(sessionId))
            continue
          try {
            await this.incrementalChannelSync(sessionId, key)
          }
          catch (err) {
            console.warn('[ChannelSync] incremental sync failed for', key, err)
          }
        }
      }
    }
    catch (error) {
      console.error('[ChannelSync] pollChannelSessions: error during polling:', error)
    }
  }

  override on<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this {
    return super.on(event, listener)
  }

  override off<U extends keyof CoworkRuntimeEvents>(
    event: U,
    listener: CoworkRuntimeEvents[U],
  ): this {
    return super.off(event, listener)
  }

  async startSession(sessionId: string, prompt: string, options: CoworkStartOptions = {}): Promise<void> {
    await this.runTurn(sessionId, prompt, {
      skipInitialUserMessage: options.skipInitialUserMessage,
      skillIds: options.skillIds,
      systemPrompt: options.systemPrompt,
      confirmationMode: options.confirmationMode,
      imageAttachments: options.imageAttachments,
    })
  }

  async continueSession(sessionId: string, prompt: string, options: CoworkContinueOptions = {}): Promise<void> {
    await this.runTurn(sessionId, prompt, {
      skipInitialUserMessage: false,
      systemPrompt: options.systemPrompt,
      skillIds: options.skillIds,
      imageAttachments: options.imageAttachments,
    })
  }

  stopSession(sessionId: string): void {
    const turn = this.activeTurns.get(sessionId)
    if (turn) {
      turn.stopRequested = true
      const client = this.gatewayClient
      if (client) {
        void client.request('chat.abort', {
          sessionKey: turn.sessionKey,
          runId: turn.runId,
        }).catch((error) => {
          console.warn('[OpenClawRuntime] Failed to abort chat run:', error)
        })
      }
    }

    this.cleanupSessionTurn(sessionId)
    this.clearPendingApprovalsBySession(sessionId)
    this.store.updateSession(sessionId, { status: 'idle' })
    this.resolveTurn(sessionId)
  }

  stopAllSessions(): void {
    const activeSessionIds = Array.from(this.activeTurns.keys())
    activeSessionIds.forEach((sessionId) => {
      this.stopSession(sessionId)
    })
  }

  respondToPermission(requestId: string, result: PermissionResult): void {
    const pending = this.pendingApprovals.get(requestId)
    if (!pending) {
      return
    }

    const decision = result.behavior === 'allow' ? 'allow-once' : 'deny'
    const client = this.gatewayClient
    if (!client) {
      this.pendingApprovals.delete(requestId)
      return
    }

    void client.request('exec.approval.resolve', {
      id: requestId,
      decision,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      this.emit('error', pending.sessionId, `Failed to resolve OpenClaw approval: ${message}`)
    }).finally(() => {
      this.pendingApprovals.delete(requestId)
    })
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeTurns.has(sessionId)
  }

  getSessionConfirmationMode(sessionId: string): 'modal' | 'text' | null {
    return this.confirmationModeBySession.get(sessionId) ?? null
  }

  private async runTurn(
    sessionId: string,
    prompt: string,
    options: {
      skipInitialUserMessage?: boolean
      systemPrompt?: string
      skillIds?: string[]
      confirmationMode?: 'modal' | 'text'
      imageAttachments?: Array<{ name: string, mimeType: string, base64Data: string }>
    },
  ): Promise<void> {
    if (!prompt.trim()) {
      throw new Error('Prompt is required.')
    }
    if (this.activeTurns.has(sessionId)) {
      throw new Error(`Session ${sessionId} is still running.`)
    }

    const session = this.store.getSession(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const confirmationMode = options.confirmationMode
      ?? this.confirmationModeBySession.get(sessionId)
      ?? 'modal'
    this.confirmationModeBySession.set(sessionId, confirmationMode)

    if (!options.skipInitialUserMessage) {
      const metadata = (options.skillIds?.length || options.imageAttachments?.length)
        ? {
            ...(options.skillIds?.length ? { skillIds: options.skillIds } : {}),
            ...(options.imageAttachments?.length ? { imageAttachments: options.imageAttachments } : {}),
          }
        : undefined
      const userMessage = this.store.addMessage(sessionId, {
        type: 'user',
        content: prompt,
        metadata,
      })
      this.emit('message', sessionId, userMessage)
    }

    const sessionKey = this.toSessionKey(sessionId)
    this.rememberSessionKey(sessionId, sessionKey)

    this.store.updateSession(sessionId, { status: 'running' })
    await this.ensureGatewayClientReady()
    this.startChannelPolling()

    const runId = randomUUID()
    const turnToken = this.nextTurnToken(sessionId)
    const outboundMessage = await this.buildOutboundPrompt(
      sessionId,
      prompt,
      options.systemPrompt ?? session.systemPrompt,
    )
    const completionPromise = new Promise<void>((resolve, reject) => {
      this.pendingTurns.set(sessionId, { resolve, reject })
    })
    this.activeTurns.set(sessionId, {
      sessionId,
      sessionKey,
      runId,
      turnToken,
      knownRunIds: new Set([runId]),
      assistantMessageId: null,
      committedAssistantText: '',
      currentAssistantSegmentText: '',
      currentText: '',
      currentContentText: '',
      currentContentBlocks: [],
      sawNonTextContentBlocks: false,
      textStreamMode: 'unknown',
      toolUseMessageIdByToolCallId: new Map(),
      toolResultMessageIdByToolCallId: new Map(),
      toolResultTextByToolCallId: new Map(),
      stopRequested: false,
      pendingUserSync: false,
      bufferedChatPayloads: [],
      bufferedAgentPayloads: [],
    })
    this.sessionIdByRunId.set(runId, sessionId)

    const client = this.requireGatewayClient()
    try {
      const attachments = options.imageAttachments?.length
        ? options.imageAttachments.map(img => ({
            type: 'image',
            mimeType: img.mimeType,
            content: img.base64Data,
          }))
        : undefined
      if (attachments) {
        console.log('[OpenClawRuntime] chat.send with attachments:', attachments.length, 'images,', attachments.map(a => ({ type: a.type, mimeType: a.mimeType, contentLength: a.content?.length ?? 0 })))
      }
      const sendResult = await client.request<Record<string, unknown>>('chat.send', {
        sessionKey,
        message: outboundMessage,
        deliver: false,
        idempotencyKey: runId,
        ...(attachments ? { attachments } : {}),
      })
      const returnedRunId = typeof sendResult?.runId === 'string' ? sendResult.runId.trim() : ''
      if (returnedRunId) {
        this.bindRunIdToTurn(sessionId, returnedRunId)
      }
    }
    catch (error) {
      this.cleanupSessionTurn(sessionId)
      this.store.updateSession(sessionId, { status: 'error' })
      const message = error instanceof Error ? error.message : String(error)
      this.emit('error', sessionId, message)
      this.rejectTurn(sessionId, new Error(message))
      throw error
    }

    await completionPromise
  }

  private async buildOutboundPrompt(
    sessionId: string,
    prompt: string,
    systemPrompt?: string,
  ): Promise<string> {
    const normalizedSystemPrompt = (systemPrompt ?? '').trim()
    const previousSystemPrompt = this.lastSystemPromptBySession.get(sessionId) ?? ''
    const shouldInjectSystemPrompt = Boolean(
      normalizedSystemPrompt
      && normalizedSystemPrompt !== previousSystemPrompt,
    )

    if (normalizedSystemPrompt) {
      this.lastSystemPromptBySession.set(sessionId, normalizedSystemPrompt)
    }
    else {
      this.lastSystemPromptBySession.delete(sessionId)
    }

    const sections: string[] = []
    if (shouldInjectSystemPrompt) {
      sections.push(this.buildSystemPromptPrefix(normalizedSystemPrompt))
    }
    sections.push(buildOpenClawLocalTimeContextPrompt())

    if (this.bridgedSessions.has(sessionId)) {
      sections.push(`[Current user request]\n${prompt}`)
      return sections.join('\n\n')
    }

    const client = this.requireGatewayClient()
    const sessionKey = this.toSessionKey(sessionId)
    let hasHistory = false
    try {
      const history = await client.request<{ messages?: unknown[] }>('chat.history', {
        sessionKey,
        limit: 1,
      })
      hasHistory = Array.isArray(history?.messages) && history.messages.length > 0
    }
    catch (error) {
      console.warn('[OpenClawRuntime] chat.history check failed, continuing without history guard:', error)
    }

    this.bridgedSessions.add(sessionId)

    if (!hasHistory) {
      const session = this.store.getSession(sessionId)
      if (session) {
        const bridgePrefix = this.buildBridgePrefix(session.messages, prompt)
        if (bridgePrefix) {
          sections.push(bridgePrefix)
        }
      }
    }

    sections.push(`[Current user request]\n${prompt}`)
    return sections.join('\n\n')
  }

  private buildSystemPromptPrefix(systemPrompt: string): string {
    return [
      '[LobsterAI system instructions]',
      'Apply the instructions below as the highest-priority guidance for this session.',
      'If earlier LobsterAI system instructions exist, replace them with this version.',
      systemPrompt,
    ].join('\n')
  }

  private buildBridgePrefix(messages: CoworkMessage[], currentPrompt: string): string {
    const normalizedCurrentPrompt = currentPrompt.trim()
    if (!normalizedCurrentPrompt)
      return ''

    const source = messages
      .filter((message) => {
        if (message.type !== 'user' && message.type !== 'assistant') {
          return false
        }
        if (!message.content.trim()) {
          return false
        }
        if (message.metadata?.isThinking) {
          return false
        }
        return true
      })
      .map(message => ({
        type: message.type,
        content: message.content.trim(),
      }))

    if (source.length === 0) {
      return ''
    }

    if (source[source.length - 1]?.type === 'user'
      && source[source.length - 1]?.content === normalizedCurrentPrompt) {
      source.pop()
    }

    const recent = source.slice(-BRIDGE_MAX_MESSAGES)
    if (recent.length === 0) {
      return ''
    }

    const lines = recent.map((entry) => {
      const role = entry.type === 'user' ? 'User' : 'Assistant'
      return `${role}: ${truncate(entry.content, BRIDGE_MAX_MESSAGE_CHARS)}`
    })

    return [
      '[Context bridge from previous LobsterAI conversation]',
      'Use this prior context for continuity. Focus your final answer on the current request.',
      ...lines,
    ].join('\n')
  }

  private async ensureGatewayClientReady(): Promise<void> {
    // Serialize concurrent calls: if another init is already in progress, wait for it.
    if (this.gatewayClientInitLock) {
      await this.gatewayClientInitLock
      return
    }
    this.gatewayClientInitLock = this._ensureGatewayClientReadyImpl()
    try {
      await this.gatewayClientInitLock
    }
    finally {
      this.gatewayClientInitLock = null
    }
  }

  private async _ensureGatewayClientReadyImpl(): Promise<void> {
    console.log('[ChannelSync] ensureGatewayClientReady: starting engine gateway...')
    const engineStatus = await this.engineManager.startGateway()
    console.log('[ChannelSync] ensureGatewayClientReady: engine phase=', engineStatus.phase, 'message=', engineStatus.message)
    if (engineStatus.phase !== 'running') {
      const message = engineStatus.message || 'OpenClaw engine is not running.'
      throw new Error(message)
    }

    const connection = this.engineManager.getGatewayConnectionInfo()
    console.log('[ChannelSync] ensureGatewayClientReady: connection info — url=', connection.url ? '✓' : '✗', 'token=', connection.token ? '✓' : '✗', 'version=', connection.version, 'clientEntryPath=', connection.clientEntryPath ? '✓' : '✗')
    const missing: string[] = []
    if (!connection.url)
      missing.push('url')
    if (!connection.token)
      missing.push('token')
    if (!connection.version)
      missing.push('version')
    if (!connection.clientEntryPath)
      missing.push('clientEntryPath')
    if (missing.length > 0) {
      throw new Error(`OpenClaw gateway connection info is incomplete (missing: ${missing.join(', ')})`)
    }

    const needsNewClient = !this.gatewayClient
      || this.gatewayClientVersion !== connection.version
      || this.gatewayClientEntryPath !== connection.clientEntryPath
    console.log('[ChannelSync] ensureGatewayClientReady: needsNewClient=', needsNewClient, 'hasExistingClient=', !!this.gatewayClient)
    if (!needsNewClient && this.gatewayReadyPromise) {
      await waitWithTimeout(this.gatewayReadyPromise, GATEWAY_READY_TIMEOUT_MS)
      return
    }

    this.stopGatewayClient()
    console.log('[ChannelSync] ensureGatewayClientReady: creating gateway client, url=', connection.url)
    await this.createGatewayClient(connection)
    console.log('[ChannelSync] ensureGatewayClientReady: createGatewayClient returned, waiting for handshake...')
    if (this.gatewayReadyPromise) {
      await waitWithTimeout(this.gatewayReadyPromise, GATEWAY_READY_TIMEOUT_MS)
    }
    console.log('[ChannelSync] ensureGatewayClientReady: gateway client created and ready')

    // Browser pre-warm disabled: the empty browser window is disruptive.
    // The browser will start on-demand when the AI agent first calls the browser tool.
    // this.prewarmBrowserIfNeeded(connection);
  }

  private async createGatewayClient(connection: OpenClawGatewayConnectionInfo): Promise<void> {
    const GatewayClient = await this.loadGatewayClientCtor(connection.clientEntryPath)

    let resolveReady: (() => void) | null = null
    let rejectReady: ((error: Error) => void) | null = null
    let settled = false

    this.gatewayReadyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })

    const settleResolve = () => {
      if (settled)
        return
      settled = true
      resolveReady?.()
    }
    const settleReject = (error: Error) => {
      if (settled)
        return
      settled = true
      rejectReady?.(error)
    }

    const client = new GatewayClient({
      url: connection.url,
      token: connection.token,
      clientDisplayName: 'LobsterAI',
      clientVersion: app.getVersion(),
      mode: 'backend',
      caps: [OPENCLAW_GATEWAY_TOOL_EVENTS_CAP],
      role: 'operator',
      scopes: ['operator.admin'],
      onHelloOk: () => {
        console.log('[ChannelSync] GatewayClient: onHelloOk — handshake succeeded')
        settleResolve()
        this.lastTickTimestamp = Date.now()
        this.startTickWatchdog()
      },
      onConnectError: (error: Error) => {
        console.error('[ChannelSync] GatewayClient: onConnectError —', error.message)
        settleReject(error)
      },
      onClose: (_code: number, reason: string) => {
        console.log('[ChannelSync] GatewayClient: onClose — code:', _code, 'reason:', reason, 'settled:', settled)
        if (!settled) {
          settleReject(new Error(reason || 'OpenClaw gateway disconnected before handshake'))
          return
        }

        // If stopGatewayClient() triggered this onClose, don't do anything —
        // the caller is already handling cleanup and may be creating a new client.
        if (this.gatewayStoppingIntentionally) {
          return
        }

        console.warn('[OpenClawRuntime] gateway WS disconnected — code:', _code, 'reason:', reason)
        const disconnectedError = new Error(reason || 'OpenClaw gateway client disconnected')
        const activeSessionIds = Array.from(this.activeTurns.keys())
        activeSessionIds.forEach((sessionId) => {
          this.store.updateSession(sessionId, { status: 'error' })
          this.emit('error', sessionId, disconnectedError.message)
          this.cleanupSessionTurn(sessionId)
          this.rejectTurn(sessionId, disconnectedError)
        })
        this.stopGatewayClient()
        this.gatewayReadyPromise = Promise.reject(disconnectedError)
        this.gatewayReadyPromise.catch(() => {
          // suppress unhandled rejection noise; auto-reconnect will re-establish
        })

        // Auto-reconnect after unexpected disconnect
        this.scheduleGatewayReconnect()
      },
      onEvent: (event: GatewayEventFrame) => {
        this.handleGatewayEvent(event)
      },
    })

    this.gatewayClient = client
    this.gatewayClientVersion = connection.version
    this.gatewayClientEntryPath = connection.clientEntryPath
    client.start()
  }

  private stopGatewayClient(): void {
    this.gatewayStoppingIntentionally = true
    this.stopChannelPolling()
    this.cancelGatewayReconnect()
    this.stopTickWatchdog()
    try {
      this.gatewayClient?.stop()
    }
    catch (error) {
      console.warn('[OpenClawRuntime] Failed to stop gateway client:', error)
    }
    this.gatewayClient = null
    this.gatewayClientVersion = null
    this.gatewayClientEntryPath = null
    this.gatewayReadyPromise = null
    this.channelSessionSync?.clearCache()
    this.knownChannelSessionIds.clear()
    this.heartbeatSessionKeys.clear()
    this.browserPrewarmAttempted = false
    this.lastTickTimestamp = 0
    // Clear messageUpdate throttle state
    for (const timer of this.pendingMessageUpdateTimer.values()) {
      clearTimeout(timer)
    }
    this.pendingMessageUpdateTimer.clear()
    this.lastMessageUpdateEmitTime.clear()
    this.gatewayStoppingIntentionally = false
  }

  private cancelGatewayReconnect(): void {
    if (this.gatewayReconnectTimer) {
      clearTimeout(this.gatewayReconnectTimer)
      this.gatewayReconnectTimer = null
    }
  }

  /**
   * Throttled emit for messageUpdate during streaming.
   * OpenClaw sends full-replacement deltas, so intermediate updates can be safely skipped.
   * Uses leading + trailing pattern: emit immediately if enough time has passed,
   * otherwise schedule a trailing emit to deliver the latest content.
   */
  private throttledEmitMessageUpdate(sessionId: string, messageId: string, content: string): void {
    const now = Date.now()
    const lastEmit = this.lastMessageUpdateEmitTime.get(messageId) ?? 0
    const elapsed = now - lastEmit

    if (elapsed >= OpenClawRuntimeAdapter.MESSAGE_UPDATE_THROTTLE_MS) {
      this.clearPendingMessageUpdate(messageId)
      this.lastMessageUpdateEmitTime.set(messageId, now)
      this.emit('messageUpdate', sessionId, messageId, content)
      return
    }

    // Schedule a trailing emit to ensure the latest content is delivered
    this.clearPendingMessageUpdate(messageId)
    this.pendingMessageUpdateTimer.set(messageId, setTimeout(() => {
      this.pendingMessageUpdateTimer.delete(messageId)
      this.lastMessageUpdateEmitTime.set(messageId, Date.now())
      this.emit('messageUpdate', sessionId, messageId, content)
    }, OpenClawRuntimeAdapter.MESSAGE_UPDATE_THROTTLE_MS - elapsed))
  }

  private clearPendingMessageUpdate(messageId: string): void {
    const timer = this.pendingMessageUpdateTimer.get(messageId)
    if (timer) {
      clearTimeout(timer)
      this.pendingMessageUpdateTimer.delete(messageId)
    }
  }

  private startTickWatchdog(): void {
    this.stopTickWatchdog()
    console.log('[TickWatchdog] started')
    this.tickWatchdogTimer = setInterval(() => {
      this.checkTickHealth()
    }, OpenClawRuntimeAdapter.TICK_WATCHDOG_INTERVAL_MS)
  }

  private stopTickWatchdog(): void {
    if (this.tickWatchdogTimer) {
      clearInterval(this.tickWatchdogTimer)
      this.tickWatchdogTimer = null
    }
  }

  private checkTickHealth(): void {
    if (this.lastTickTimestamp <= 0)
      return
    const elapsed = Date.now() - this.lastTickTimestamp
    if (elapsed <= OpenClawRuntimeAdapter.TICK_TIMEOUT_MS)
      return

    console.warn(`[TickWatchdog] no tick received for ${Math.round(elapsed / 1000)}s (threshold: ${OpenClawRuntimeAdapter.TICK_TIMEOUT_MS / 1000}s) — connection is likely dead, triggering reconnect`)
    this.cancelGatewayReconnect()
    this.stopGatewayClient()
    this.gatewayReconnectAttempt = 0
    this.scheduleGatewayReconnect()
  }

  /**
   * Called when the system resumes from sleep/suspend.
   * Resets the reconnect counter and triggers an immediate reconnect or health check.
   */
  onSystemResume(): void {
    console.log('[GatewayReconnect] system resumed from sleep')
    this.cancelGatewayReconnect()
    this.gatewayReconnectAttempt = 0
    if (!this.gatewayClient) {
      void this.attemptGatewayReconnect()
    }
    else {
      this.checkTickHealth()
    }
  }

  /**
   * Schedule an automatic gateway WS reconnection attempt with exponential backoff.
   * Called from onClose when the connection drops unexpectedly after a successful handshake.
   */
  private scheduleGatewayReconnect(): void {
    if (this.gatewayReconnectAttempt >= OpenClawRuntimeAdapter.GATEWAY_RECONNECT_MAX_ATTEMPTS) {
      console.error(`[GatewayReconnect] max attempts reached (${OpenClawRuntimeAdapter.GATEWAY_RECONNECT_MAX_ATTEMPTS}), giving up. Restart the app to reconnect.`)
      return
    }

    const delays = OpenClawRuntimeAdapter.GATEWAY_RECONNECT_DELAYS
    const delay = delays[Math.min(this.gatewayReconnectAttempt, delays.length - 1)]
    this.gatewayReconnectAttempt++

    console.log(`[GatewayReconnect] scheduling reconnect attempt ${this.gatewayReconnectAttempt}/${OpenClawRuntimeAdapter.GATEWAY_RECONNECT_MAX_ATTEMPTS} in ${delay}ms`)

    this.gatewayReconnectTimer = setTimeout(() => {
      this.gatewayReconnectTimer = null
      void this.attemptGatewayReconnect()
    }, delay)
  }

  private async attemptGatewayReconnect(): Promise<void> {
    console.log(`[GatewayReconnect] attempting reconnect (attempt ${this.gatewayReconnectAttempt})`)
    try {
      // connectGatewayIfNeeded checks if client already exists, so safe to call
      await this.connectGatewayIfNeeded()
      console.log('[GatewayReconnect] reconnected successfully')
      this.gatewayReconnectAttempt = 0 // reset counter on success
    }
    catch (error) {
      console.warn('[GatewayReconnect] reconnect failed:', error)
      this.scheduleGatewayReconnect() // retry with next backoff
    }
  }

  private prewarmBrowserIfNeeded(connection: OpenClawGatewayConnectionInfo): void {
    if (this.browserPrewarmAttempted)
      return
    if (!connection.port || !connection.token)
      return
    this.browserPrewarmAttempted = true

    const browserControlPort = connection.port + 2
    const token = connection.token
    console.log(`[OpenClawRuntime] browser pre-warm: gatewayPort=${connection.port}, browserControlPort=${browserControlPort}`)
    void this.prewarmBrowserWithRetry(browserControlPort, token)
  }

  private probeBrowserControlService(toolCallId: string, phase: string): void {
    const connection = this.engineManager.getGatewayConnectionInfo()
    if (!connection.port || !connection.token) {
      console.log(`[OpenClawRuntime] browser probe (${toolCallId}/${phase}): no gateway connection info`)
      return
    }
    const browserControlPort = connection.port + 2
    const token = connection.token
    const probeStartTime = Date.now()
    console.log(`[OpenClawRuntime] browser probe (${toolCallId}/${phase}): checking port ${browserControlPort} ...`)

    // Probe multiple endpoints to diagnose reachability
    const endpoints = [`http://127.0.0.1:${browserControlPort}/status`, `http://127.0.0.1:${browserControlPort}/`]
    for (const probeUrl of endpoints) {
      fetch(probeUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      })
        .then(async (response) => {
          const body = await response.text().catch(() => '')
          console.log(
            `[OpenClawRuntime] browser probe (${toolCallId}/${phase}): ${probeUrl} → HTTP ${response.status} (${Date.now() - probeStartTime}ms) body=${body.slice(0, 500)}`,
          )
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err)
          console.warn(
            `[OpenClawRuntime] browser probe (${toolCallId}/${phase}): ${probeUrl} → FAILED (${Date.now() - probeStartTime}ms) error=${message}`,
          )
        })
    }
  }

  private async prewarmBrowserWithRetry(
    port: number,
    token: string,
    maxRetries = 5,
  ): Promise<void> {
    const url = `http://127.0.0.1:${port}/start?profile=openclaw`

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now()
      console.log(
        `[OpenClawRuntime] browser pre-warm attempt ${attempt}/${maxRetries} → POST http://127.0.0.1:${port}/start?profile=openclaw`,
      )

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(90_000),
        })
        const body = await response.text()
        if (response.ok) {
          console.log(
            `[OpenClawRuntime] browser pre-warm succeeded (${Date.now() - startTime}ms): ${body.slice(0, 200)}`,
          )
          return
        }
        console.warn(
          `[OpenClawRuntime] browser pre-warm attempt ${attempt} returned HTTP ${response.status} (${Date.now() - startTime}ms): ${body.slice(0, 200)}`,
        )
      }
      catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(
          `[OpenClawRuntime] browser pre-warm attempt ${attempt} failed (${Date.now() - startTime}ms): ${message}`,
        )
      }

      if (attempt < maxRetries) {
        const delayMs = Math.min(5000, 2000 * attempt)
        console.log(`[OpenClawRuntime] browser pre-warm retrying in ${delayMs}ms...`)
        await new Promise(r => setTimeout(r, delayMs))
      }
    }

    console.warn('[OpenClawRuntime] browser pre-warm exhausted all retries (non-fatal, browser will start on first tool use)')
  }

  private async loadGatewayClientCtor(clientEntryPath: string): Promise<GatewayClientCtor> {
    // Use require() with file path directly. TypeScript's CJS output downgrades
    // dynamic import() to require(), which doesn't support file:// URLs.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require(clientEntryPath) as Record<string, unknown>
    const direct = loaded.GatewayClient
    if (typeof direct === 'function') {
      return direct as GatewayClientCtor
    }

    const exportedValues = Object.values(loaded)
    for (const candidate of exportedValues) {
      if (typeof candidate !== 'function') {
        continue
      }
      const maybeCtor = candidate as {
        name?: string
        prototype?: {
          start?: unknown
          stop?: unknown
          request?: unknown
        }
      }
      if (maybeCtor.name === 'GatewayClient') {
        return candidate as GatewayClientCtor
      }
      const proto = maybeCtor.prototype
      if (proto
        && typeof proto.start === 'function'
        && typeof proto.stop === 'function'
        && typeof proto.request === 'function') {
        return candidate as GatewayClientCtor
      }
    }

    const exportKeysPreview = Object.keys(loaded).slice(0, 20).join(', ')
    throw new Error(
      `Invalid OpenClaw gateway client module: ${clientEntryPath} (exports: ${exportKeysPreview || 'none'})`,
    )
  }

  private handleGatewayEvent(event: GatewayEventFrame): void {
    if (event.event === 'tick') {
      this.lastTickTimestamp = Date.now()
      return
    }

    if (event.event === 'chat') {
      this.handleChatEvent(event.payload, event.seq)
      return
    }

    if (event.event === 'agent') {
      this.handleAgentEvent(event.payload, event.seq)
      return
    }

    if (event.event === 'exec.approval.requested') {
      this.handleApprovalRequested(event.payload)
      return
    }

    if (event.event === 'exec.approval.resolved') {
      this.handleApprovalResolved(event.payload)
    }
  }

  private handleAgentEvent(payload: unknown, seq?: number): void {
    if (!isRecord(payload))
      return
    const agentPayload = payload as AgentEventPayload
    const runId = typeof agentPayload.runId === 'string' ? agentPayload.runId.trim() : ''
    const sessionKey = typeof agentPayload.sessionKey === 'string' ? agentPayload.sessionKey.trim() : ''
    const stream = typeof agentPayload.stream === 'string' ? agentPayload.stream : ''

    const sessionIdByRunId = runId ? this.sessionIdByRunId.get(runId) : undefined
    const sessionIdBySessionKey = sessionKey ? this.resolveSessionIdBySessionKey(sessionKey) ?? undefined : undefined
    let sessionId = sessionIdByRunId ?? sessionIdBySessionKey

    // Re-create ActiveTurn for channel session follow-up turns
    if (sessionId && !this.activeTurns.has(sessionId) && sessionKey) {
      console.log('[Debug:handleAgentEvent] re-creating ActiveTurn for follow-up turn, sessionId:', sessionId)
      this.ensureActiveTurn(sessionId, sessionKey, runId)
    }

    // Try to resolve channel-originated sessions (e.g. Telegram via OpenClaw)
    if (!sessionId && sessionKey && this.channelSessionSync) {
      const channelSessionId = this.channelSessionSync.resolveOrCreateSession(sessionKey)
        || (!this.heartbeatSessionKeys.has(sessionKey) && this.channelSessionSync.resolveOrCreateMainAgentSession(sessionKey))
        || this.channelSessionSync.resolveOrCreateCronSession(sessionKey)
        || null
      console.log('[Debug:handleAgentEvent] channel resolve — channelSessionId:', channelSessionId)
      if (channelSessionId) {
        // If this key was previously deleted, allow re-creation but skip history sync
        if (this.deletedChannelKeys.has(sessionKey)) {
          this.deletedChannelKeys.delete(sessionKey)
          this.fullySyncedSessions.add(channelSessionId)
          this.reCreatedChannelSessionIds.add(channelSessionId)
          console.log('[Debug:handleAgentEvent] re-created after delete, skipping history sync for:', sessionKey)
        }
        this.rememberSessionKey(channelSessionId, sessionKey)
        sessionId = channelSessionId
        this.ensureActiveTurn(channelSessionId, sessionKey, runId)
      }
    }

    if (!sessionId) {
      console.log('[Debug:handleAgentEvent] no sessionId, dropping event. runId:', runId, 'sessionKey:', sessionKey)
      if (runId) {
        this.enqueuePendingAgentEvent(runId, agentPayload, seq)
      }
      return
    }
    if (sessionIdByRunId && sessionIdBySessionKey && sessionIdByRunId !== sessionIdBySessionKey) {
      console.log('[Debug:handleAgentEvent] sessionId mismatch, dropping. byRunId:', sessionIdByRunId, 'bySessionKey:', sessionIdBySessionKey)
      return
    }

    const turn = this.activeTurns.get(sessionId)
    if (!turn) {
      console.log('[Debug:handleAgentEvent] no active turn for sessionId:', sessionId)
      return
    }

    if (sessionKey && !runId && turn.sessionKey !== sessionKey) {
      console.log('[Debug:handleAgentEvent] sessionKey mismatch, dropping. event:', sessionKey, 'turn:', turn.sessionKey)
      return
    }

    if (runId) {
      const mappedSessionId = this.sessionIdByRunId.get(runId)
      if (mappedSessionId && mappedSessionId !== sessionId) {
        console.log('[Debug:handleAgentEvent] runId mapped to different session, dropping. mapped:', mappedSessionId, 'current:', sessionId)
        return
      }
      this.bindRunIdToTurn(sessionId, runId)
    }

    // Buffer agent events while user messages are being prefetched for channel sessions.
    // Must be checked BEFORE seq dedup so that replayed events are not dropped.
    if (turn.pendingUserSync) {
      console.log('[Debug:handleAgentEvent] buffering agent event (pendingUserSync), sessionId:', sessionId, 'buffered:', turn.bufferedAgentPayloads.length + 1)
      turn.bufferedAgentPayloads.push({ payload: agentPayload, seq, bufferedAt: Date.now() })
      return
    }

    // Sequence-based dedup (placed after buffer check to match handleChatEvent pattern)
    if (typeof seq === 'number' && Number.isFinite(seq) && runId) {
      const lastSeq = this.lastAgentSeqByRunId.get(runId)
      if (lastSeq !== undefined && seq <= lastSeq) {
        return
      }
      this.lastAgentSeqByRunId.set(runId, seq)
    }

    // Fast-path: skip assistant-stream events — they carry the same text as
    // chat deltas and dispatchAgentEvent() has no handler for stream=assistant.
    if (stream === 'assistant') {
      return
    }

    this.dispatchAgentEvent(sessionId, turn, {
      ...agentPayload,
      ...(typeof seq === 'number' && Number.isFinite(seq) ? { seq } : {}),
    })
  }

  private dispatchAgentEvent(sessionId: string, turn: ActiveTurn, agentPayload: AgentEventPayload): void {
    const stream = typeof agentPayload.stream === 'string' ? agentPayload.stream.trim() : ''
    const hasToolShape = isRecord(agentPayload.data) && typeof agentPayload.data.toolCallId === 'string'
    if (stream === 'tool' || stream === 'tools' || (!stream && hasToolShape)) {
      if (Array.isArray(agentPayload.data)) {
        for (const entry of agentPayload.data) {
          this.handleAgentToolEvent(sessionId, turn, entry)
        }
      }
      else {
        this.handleAgentToolEvent(sessionId, turn, agentPayload.data)
      }
      return
    }
    if (stream === 'lifecycle') {
      this.handleAgentLifecycleEvent(sessionId, agentPayload.data)
    }
  }

  private enqueuePendingAgentEvent(runId: string, payload: AgentEventPayload, seq?: number): void {
    const normalizedRunId = runId.trim()
    if (!normalizedRunId)
      return

    const stream = typeof payload.stream === 'string' ? payload.stream.trim() : ''
    const hasToolShape = isRecord(payload.data) && typeof payload.data.toolCallId === 'string'
    const isSupportedStream = stream === 'tool'
      || stream === 'tools'
      || stream === 'lifecycle'
      || (!stream && hasToolShape)
    if (!isSupportedStream)
      return

    const queued = this.pendingAgentEventsByRunId.get(normalizedRunId) ?? []
    queued.push({
      runId: normalizedRunId,
      sessionKey: payload.sessionKey,
      stream: payload.stream,
      data: payload.data,
      ...(typeof seq === 'number' && Number.isFinite(seq) ? { seq } : {}),
    })
    if (queued.length > 240) {
      queued.shift()
    }
    this.pendingAgentEventsByRunId.set(normalizedRunId, queued)

    if (this.pendingAgentEventsByRunId.size > 400) {
      const oldestRunId = this.pendingAgentEventsByRunId.keys().next().value as string | undefined
      if (oldestRunId) {
        this.pendingAgentEventsByRunId.delete(oldestRunId)
      }
    }
  }

  private flushPendingAgentEvents(sessionId: string, runId: string): void {
    const normalizedRunId = runId.trim()
    if (!normalizedRunId)
      return

    const queued = this.pendingAgentEventsByRunId.get(normalizedRunId)
    if (!queued || queued.length === 0)
      return
    this.pendingAgentEventsByRunId.delete(normalizedRunId)

    const turn = this.activeTurns.get(sessionId)
    if (!turn)
      return

    for (const event of queued) {
      this.dispatchAgentEvent(sessionId, turn, event)
    }
  }

  private rememberSessionKey(sessionId: string, sessionKey: string): void {
    const normalizedSessionKey = sessionKey.trim()
    if (!normalizedSessionKey)
      return
    this.sessionIdBySessionKey.set(normalizedSessionKey, sessionId)
  }

  private resolveSessionIdBySessionKey(sessionKey: string): string | null {
    const normalizedSessionKey = sessionKey.trim()
    if (!normalizedSessionKey)
      return null

    const mappedSessionId = this.sessionIdBySessionKey.get(normalizedSessionKey)
    if (mappedSessionId) {
      return mappedSessionId
    }

    const parsedManagedSession = parseManagedSessionKey(normalizedSessionKey)
    if (!parsedManagedSession) {
      return null
    }

    const session = this.store.getSession(parsedManagedSession.sessionId)
    if (!session) {
      return null
    }

    this.rememberSessionKey(session.id, normalizedSessionKey)
    this.rememberSessionKey(session.id, this.toSessionKey(session.id))
    return session.id
  }

  private nextTurnToken(sessionId: string): number {
    const nextToken = (this.latestTurnTokenBySession.get(sessionId) ?? 0) + 1
    this.latestTurnTokenBySession.set(sessionId, nextToken)
    return nextToken
  }

  private isCurrentTurnToken(sessionId: string, turnToken: number): boolean {
    return (this.latestTurnTokenBySession.get(sessionId) ?? 0) === turnToken
  }

  private reuseFinalAssistantMessage(sessionId: string, content: string): string | null {
    const normalizedContent = content.trim()
    if (!normalizedContent) {
      return null
    }

    const session = this.store.getSession(sessionId)
    const lastMessage = session?.messages[session.messages.length - 1]
    if (!lastMessage || lastMessage.type !== 'assistant') {
      return null
    }
    if (lastMessage.content.trim() !== normalizedContent) {
      return null
    }

    this.store.updateMessage(sessionId, lastMessage.id, {
      content,
      metadata: {
        isStreaming: false,
        isFinal: true,
      },
    })
    return lastMessage.id
  }

  private handleAgentLifecycleEvent(sessionId: string, data: unknown): void {
    if (!isRecord(data))
      return
    const phase = typeof data.phase === 'string' ? data.phase.trim() : ''
    if (phase === 'start') {
      this.store.updateSession(sessionId, { status: 'running' })
    }
  }

  private handleAgentToolEvent(sessionId: string, turn: ActiveTurn, data: unknown): void {
    if (!isRecord(data))
      return

    const rawPhase = typeof data.phase === 'string' ? data.phase.trim() : ''
    const phase = rawPhase === 'end' ? 'result' : rawPhase
    const toolCallId = typeof data.toolCallId === 'string' ? data.toolCallId.trim() : ''
    if (!toolCallId)
      return
    if (phase !== 'start' && phase !== 'update' && phase !== 'result')
      return

    const toolNameRaw = typeof data.name === 'string' ? data.name.trim() : ''
    const toolName = toolNameRaw || 'Tool'

    if (toolNameRaw.toLowerCase() === 'browser') {
      const isError = Boolean(data.isError)
      // Log full data keys and values for diagnosis
      const dataKeys = Object.keys(data)
      const resultType = data.result === undefined
        ? 'undefined'
        : data.result === null
          ? 'null'
          : typeof data.result === 'string'
            ? `string(len=${data.result.length})`
            : Array.isArray(data.result)
              ? `array(len=${data.result.length})`
              : `object(keys=${Object.keys(data.result as Record<string, unknown>).join(',')})`
      console.log(
        `[OpenClawRuntime] browser tool event: phase=${phase} toolCallId=${toolCallId}`
        + ` dataKeys=[${dataKeys.join(',')}] resultType=${resultType}${
          phase === 'start' ? ` args=${JSON.stringify(data.args ?? {}).slice(0, 500)}` : ''
        }${phase === 'result' ? ` isError=${isError}` : ''}`,
      )
      if (phase === 'result') {
        // Log full result for browser events (may contain error details)
        try {
          const fullResult = JSON.stringify(data.result, null, 2)
          console.log(`[OpenClawRuntime] browser tool result (${toolCallId}): ${fullResult?.slice(0, 2000) ?? '(null)'}`)
        }
        catch {
          console.log(`[OpenClawRuntime] browser tool result (${toolCallId}): [unstringifiable] ${String(data.result).slice(0, 500)}`)
        }
        if (isError) {
          // Log any additional error-related fields
          const errorFields: Record<string, unknown> = {}
          for (const key of dataKeys) {
            if (/error|reason|message|detail|status/i.test(key)) {
              errorFields[key] = data[key]
            }
          }
          if (Object.keys(errorFields).length > 0) {
            console.log(`[OpenClawRuntime] browser tool error fields (${toolCallId}): ${JSON.stringify(errorFields).slice(0, 1000)}`)
          }
        }
      }
      // Probe browser control service reachability from Electron main process
      this.probeBrowserControlService(toolCallId, phase)
    }

    if (phase === 'start') {
      this.splitAssistantSegmentBeforeTool(turn)
    }

    if (!turn.toolUseMessageIdByToolCallId.has(toolCallId)) {
      const toolUseMessage = this.store.addMessage(sessionId, {
        type: 'tool_use',
        content: `Using tool: ${toolName}`,
        metadata: {
          toolName,
          toolInput: toToolInputRecord(data.args),
          toolUseId: toolCallId,
        },
      })
      turn.toolUseMessageIdByToolCallId.set(toolCallId, toolUseMessage.id)
      this.emit('message', sessionId, toolUseMessage)
    }

    if (phase === 'update') {
      const incoming = extractToolText(data.partialResult)
      if (!incoming.trim())
        return

      const previous = turn.toolResultTextByToolCallId.get(toolCallId) ?? ''
      const merged = mergeStreamingText(previous, incoming, 'unknown').text

      const existingResultMessageId = turn.toolResultMessageIdByToolCallId.get(toolCallId)
      if (!existingResultMessageId) {
        const resultMessage = this.store.addMessage(sessionId, {
          type: 'tool_result',
          content: merged,
          metadata: {
            toolResult: merged,
            toolUseId: toolCallId,
            isError: false,
            isStreaming: true,
            isFinal: false,
          },
        })
        turn.toolResultMessageIdByToolCallId.set(toolCallId, resultMessage.id)
        turn.toolResultTextByToolCallId.set(toolCallId, merged)
        this.emit('message', sessionId, resultMessage)
        return
      }

      if (merged !== previous) {
        this.store.updateMessage(sessionId, existingResultMessageId, {
          content: merged,
          metadata: {
            toolResult: merged,
            toolUseId: toolCallId,
            isError: false,
            isStreaming: true,
            isFinal: false,
          },
        })
        turn.toolResultTextByToolCallId.set(toolCallId, merged)
        this.emit('messageUpdate', sessionId, existingResultMessageId, merged)
      }
      return
    }

    if (phase === 'result') {
      const incoming = extractToolText(data.result)
      const previous = turn.toolResultTextByToolCallId.get(toolCallId) ?? ''
      const isError = Boolean(data.isError)
      const finalContent = incoming.trim() ? incoming : previous
      const finalError = isError ? (finalContent || 'Tool execution failed') : undefined
      const existingResultMessageId = turn.toolResultMessageIdByToolCallId.get(toolCallId)

      if (existingResultMessageId) {
        this.store.updateMessage(sessionId, existingResultMessageId, {
          content: finalContent,
          metadata: {
            toolResult: finalContent,
            toolUseId: toolCallId,
            error: finalError,
            isError,
            isStreaming: false,
            isFinal: true,
          },
        })
        this.emit('messageUpdate', sessionId, existingResultMessageId, finalContent)
      }
      else {
        const resultMessage = this.store.addMessage(sessionId, {
          type: 'tool_result',
          content: finalContent,
          metadata: {
            toolResult: finalContent,
            toolUseId: toolCallId,
            error: finalError,
            isError,
            isStreaming: false,
            isFinal: true,
          },
        })
        turn.toolResultMessageIdByToolCallId.set(toolCallId, resultMessage.id)
        this.emit('message', sessionId, resultMessage)
      }
      turn.toolResultTextByToolCallId.set(toolCallId, finalContent)
    }
  }

  private handleChatEvent(payload: unknown, seq?: number): void {
    if (!isRecord(payload))
      return
    const chatPayload = payload as ChatEventPayload
    const state = chatPayload.state
    if (!state)
      return

    const chatRunId = typeof chatPayload.runId === 'string' ? chatPayload.runId.trim() : ''
    const chatSessionKey = typeof chatPayload.sessionKey === 'string' ? chatPayload.sessionKey.trim() : ''

    const sessionId = this.resolveSessionIdFromChatPayload(chatPayload)
    if (!sessionId) {
      console.log('[Debug:handleChatEvent] no sessionId resolved, dropping event')
      return
    }

    const turn = this.activeTurns.get(sessionId)
    if (!turn) {
      console.log('[Debug:handleChatEvent] no active turn for sessionId:', sessionId)
      return
    }

    // Buffer chat events while user messages are being prefetched for channel sessions
    if (turn.pendingUserSync) {
      console.log('[Debug:handleChatEvent] buffering chat event (pendingUserSync), sessionId:', sessionId, 'buffered:', turn.bufferedChatPayloads.length + 1)
      turn.bufferedChatPayloads.push({ payload, seq, bufferedAt: Date.now() })
      return
    }

    const runId = typeof chatPayload.runId === 'string' ? chatPayload.runId.trim() : ''
    if (typeof seq === 'number' && Number.isFinite(seq) && runId) {
      const lastSeq = this.lastChatSeqByRunId.get(runId)
      if (lastSeq !== undefined && seq <= lastSeq) {
        return
      }
      this.lastChatSeqByRunId.set(runId, seq)
    }

    if (state === 'delta') {
      this.handleChatDelta(sessionId, turn, chatPayload)
      return
    }

    if (state === 'final') {
      this.handleChatFinal(sessionId, turn, chatPayload)
      return
    }

    if (state === 'aborted') {
      this.handleChatAborted(sessionId, turn)
      return
    }

    if (state === 'error') {
      this.handleChatError(sessionId, turn, chatPayload)
    }
  }

  private updateTurnTextState(
    turn: ActiveTurn,
    message: unknown,
    options: { protectBoundaryDrops?: boolean, forceReplace?: boolean } = {},
  ): void {
    const contentText = extractMessageText(message).trim()
    const { textBlocks, sawNonTextContentBlocks } = extractTextBlocksAndSignals(message)

    if (contentText) {
      const nextContentBlocks = textBlocks.length > 0 ? textBlocks : [contentText]
      const shouldProtectBoundaryDrop = Boolean(
        options.protectBoundaryDrops
        && (turn.sawNonTextContentBlocks || sawNonTextContentBlocks)
        && isDroppedBoundaryTextBlockSubset(turn.currentContentBlocks, nextContentBlocks),
      )
      if (!shouldProtectBoundaryDrop) {
        if (options.forceReplace) {
          turn.currentContentText = contentText
          turn.currentContentBlocks = nextContentBlocks
          turn.textStreamMode = 'snapshot'
        }
        else {
          const merged = mergeStreamingText(turn.currentContentText, contentText, turn.textStreamMode)
          turn.currentContentText = merged.text
          turn.textStreamMode = merged.mode
          if (merged.mode === 'snapshot') {
            turn.currentContentBlocks = nextContentBlocks
          }
          else {
            const mergedText = merged.text.trim()
            if (mergedText) {
              turn.currentContentBlocks = [mergedText]
            }
          }
        }
      }
    }

    if (sawNonTextContentBlocks) {
      turn.sawNonTextContentBlocks = true
    }
    turn.currentText = turn.currentContentText.trim()
  }

  private resolveFinalTurnText(turn: ActiveTurn, message: unknown): string {
    const streamedText = turn.currentText.trim()
    const streamedTextBlocks = [...turn.currentContentBlocks]
    const streamedSawNonTextContentBlocks = turn.sawNonTextContentBlocks

    this.updateTurnTextState(turn, message, { forceReplace: true })
    const finalText = turn.currentText.trim()

    if (!finalText) {
      return streamedText
    }

    const shouldFallbackToStreamedText = streamedSawNonTextContentBlocks
      && isDroppedBoundaryTextBlockSubset(streamedTextBlocks, turn.currentContentBlocks)
    if (shouldFallbackToStreamedText && streamedText) {
      turn.currentContentText = streamedText
      turn.currentContentBlocks = streamedTextBlocks
      turn.currentText = streamedText
      return streamedText
    }

    return finalText
  }

  private resolveAssistantSegmentText(turn: ActiveTurn, fullText: string): string {
    const normalizedFullText = fullText.trim()
    const committed = turn.committedAssistantText
    if (!normalizedFullText) {
      return ''
    }
    if (!committed) {
      return normalizedFullText
    }
    if (normalizedFullText.startsWith(committed)) {
      return normalizedFullText.slice(committed.length).trimStart()
    }
    return normalizedFullText
  }

  private splitAssistantSegmentBeforeTool(turn: ActiveTurn): void {
    if (!turn.assistantMessageId) {
      return
    }

    const segmentText = turn.currentAssistantSegmentText.trim()
    if (segmentText) {
      const committedCandidate = `${turn.committedAssistantText}${segmentText}`
      const fullText = turn.currentText.trim()
      if (fullText && fullText.startsWith(committedCandidate)) {
        turn.committedAssistantText = committedCandidate
      }
      else {
        turn.committedAssistantText = committedCandidate
      }
    }
    else {
      const fullText = turn.currentText.trim()
      if (fullText && fullText.length > turn.committedAssistantText.length) {
        turn.committedAssistantText = fullText
      }
    }

    turn.assistantMessageId = null
    turn.currentAssistantSegmentText = ''
  }

  private handleChatDelta(sessionId: string, turn: ActiveTurn, payload: ChatEventPayload): void {
    const previousText = turn.currentText
    const previousContentText = turn.currentContentText
    const previousContentBlocks = [...turn.currentContentBlocks]
    const previousSawNonTextContentBlocks = turn.sawNonTextContentBlocks
    const previousTextStreamMode = turn.textStreamMode
    const previousSegmentText = turn.currentAssistantSegmentText

    this.updateTurnTextState(turn, payload.message, { protectBoundaryDrops: true })

    // Debug: log when non-text content blocks first appear during streaming
    if (turn.sawNonTextContentBlocks && !previousSawNonTextContentBlocks) {
      console.log('[Debug:handleChatDelta] non-text content blocks detected during streaming, sessionId:', sessionId)
      if (isRecord(payload.message) && Array.isArray((payload.message as Record<string, unknown>).content)) {
        const content = (payload.message as Record<string, unknown>).content as Array<Record<string, unknown>>
        for (const block of content) {
          if (isRecord(block) && typeof block.type === 'string' && block.type !== 'text' && block.type !== 'thinking') {
            console.log('[Debug:handleChatDelta] non-text block:', JSON.stringify(block).slice(0, 1000))
          }
        }
      }
    }
    const streamedText = turn.currentText
    if (previousText && streamedText && streamedText.length < previousText.length) {
      turn.currentText = previousText
      turn.currentContentText = previousContentText
      turn.currentContentBlocks = previousContentBlocks
      turn.sawNonTextContentBlocks = previousSawNonTextContentBlocks
      turn.textStreamMode = previousTextStreamMode
      return
    }

    if (!streamedText)
      return
    const segmentText = this.resolveAssistantSegmentText(turn, streamedText)
    if (!segmentText)
      return
    if (segmentText === previousSegmentText && streamedText === previousText)
      return

    if (!turn.assistantMessageId) {
      const assistantMessage = this.store.addMessage(sessionId, {
        type: 'assistant',
        content: segmentText,
        metadata: {
          isStreaming: true,
          isFinal: false,
        },
      })
      turn.assistantMessageId = assistantMessage.id
      turn.currentAssistantSegmentText = segmentText
      this.emit('message', sessionId, assistantMessage)
      return
    }

    if (turn.assistantMessageId && segmentText !== previousSegmentText) {
      this.store.updateMessage(sessionId, turn.assistantMessageId, {
        content: segmentText,
        metadata: {
          isStreaming: true,
          isFinal: false,
        },
      })
      turn.currentAssistantSegmentText = segmentText
      this.throttledEmitMessageUpdate(sessionId, turn.assistantMessageId, segmentText)
    }
  }

  private handleChatFinal(sessionId: string, turn: ActiveTurn, payload: ChatEventPayload): void {
    const previousText = turn.currentText
    const previousSegmentText = turn.currentAssistantSegmentText
    const finalText = this.resolveFinalTurnText(turn, payload.message)
    turn.currentText = finalText
    if (finalText && turn.currentContentBlocks.length === 0) {
      turn.currentContentText = finalText
      turn.currentContentBlocks = [finalText]
    }
    const finalSegmentText = this.resolveAssistantSegmentText(turn, finalText)
    turn.currentAssistantSegmentText = finalSegmentText

    if (turn.assistantMessageId) {
      const persistedSegmentText = finalSegmentText || previousSegmentText
      if (persistedSegmentText) {
        this.store.updateMessage(sessionId, turn.assistantMessageId, {
          content: persistedSegmentText,
          metadata: {
            isStreaming: false,
            isFinal: true,
          },
        })
        if (persistedSegmentText !== previousSegmentText) {
          this.emit('messageUpdate', sessionId, turn.assistantMessageId, persistedSegmentText)
        }
      }
    }
    else if (finalSegmentText) {
      const reusedMessageId = this.reuseFinalAssistantMessage(sessionId, finalSegmentText)
      if (reusedMessageId) {
        turn.assistantMessageId = reusedMessageId
      }
      else {
        const assistantMessage = this.store.addMessage(sessionId, {
          type: 'assistant',
          content: finalSegmentText,
          metadata: {
            isStreaming: false,
            isFinal: true,
          },
        })
        turn.assistantMessageId = assistantMessage.id
        this.emit('message', sessionId, assistantMessage)
      }
    }

    const messageRecord = isRecord(payload.message) ? payload.message : null
    const stopReason = payload.stopReason
      ?? (messageRecord && typeof messageRecord.stopReason === 'string' ? messageRecord.stopReason : undefined)
    const errorMessageFromMessage = messageRecord && typeof messageRecord.errorMessage === 'string'
      ? messageRecord.errorMessage
      : undefined
    const stoppedByError = stopReason === 'error'
    if (stoppedByError) {
      const errorMessage = payload.errorMessage?.trim() || errorMessageFromMessage?.trim() || 'OpenClaw run failed'
      const erroredSessionKey = turn.sessionKey
      this.store.updateSession(sessionId, { status: 'error' })
      this.emit('error', sessionId, errorMessage)
      this.cleanupSessionTurn(sessionId)
      this.rejectTurn(sessionId, new Error(errorMessage))
      // Sync channel history even on error so the UI shows the messages that
      // were already delivered through the IM connector (e.g. DingTalk reply).
      this.syncChannelAfterTurn(sessionId, erroredSessionKey)
      return
    }

    // Align final assistant text with persisted gateway history to reduce mid-stream drift.
    void this.syncFinalAssistantWithHistory(sessionId, turn)

    this.store.updateSession(sessionId, { status: 'completed' })
    this.emit('complete', sessionId, payload.runId ?? turn.runId)
    const completedSessionKey = turn.sessionKey
    this.cleanupSessionTurn(sessionId)
    this.resolveTurn(sessionId)
    // Trigger immediate incremental sync for channel sessions so UI reflects
    // the latest messages without waiting for the next polling cycle.
    this.syncChannelAfterTurn(sessionId, completedSessionKey)
  }

  private handleChatAborted(sessionId: string, turn: ActiveTurn): void {
    this.store.updateSession(sessionId, { status: 'idle' })
    if (!turn.stopRequested) {
      this.emit('complete', sessionId, turn.runId)
    }
    const abortedSessionKey = turn.sessionKey
    this.cleanupSessionTurn(sessionId)
    this.resolveTurn(sessionId)
    this.syncChannelAfterTurn(sessionId, abortedSessionKey)
  }

  private handleChatError(sessionId: string, turn: ActiveTurn, payload: ChatEventPayload): void {
    let errorMessage = payload.errorMessage?.trim() || 'OpenClaw run failed'

    // Detect model API errors that are likely caused by unsupported image content
    // in tool results (e.g., Read tool returning image blocks for non-vision models).
    if (/^4\d{2}\b/.test(errorMessage)) {
      errorMessage += '\n\n[Hint: If the model attempted to read an image file, this may be because the model does not support image input. Consider using a vision-capable model or avoid sending image files.]'
    }

    const erroredSessionKey = turn.sessionKey
    this.store.updateSession(sessionId, { status: 'error' })
    this.emit('error', sessionId, errorMessage)
    this.cleanupSessionTurn(sessionId)
    this.rejectTurn(sessionId, new Error(errorMessage))
    this.syncChannelAfterTurn(sessionId, erroredSessionKey)
  }

  private handleApprovalRequested(payload: unknown): void {
    if (!isRecord(payload))
      return
    const typedPayload = payload as ExecApprovalRequestedPayload
    const requestId = typeof typedPayload.id === 'string' ? typedPayload.id.trim() : ''
    if (!requestId)
      return
    if (!typedPayload.request || !isRecord(typedPayload.request))
      return

    const request = typedPayload.request
    const sessionKey = typeof request.sessionKey === 'string' ? request.sessionKey.trim() : ''
    let sessionId = sessionKey ? this.resolveSessionIdBySessionKey(sessionKey) ?? undefined : undefined

    // Try to resolve channel-originated sessions for approval requests
    if (!sessionId && sessionKey && this.channelSessionSync) {
      const channelSessionId = this.channelSessionSync.resolveOrCreateSession(sessionKey)
        || (!this.heartbeatSessionKeys.has(sessionKey) && this.channelSessionSync.resolveOrCreateMainAgentSession(sessionKey))
        || this.channelSessionSync.resolveOrCreateCronSession(sessionKey)
        || null
      if (channelSessionId) {
        this.rememberSessionKey(channelSessionId, sessionKey)
        sessionId = channelSessionId
      }
    }

    if (!sessionId) {
      return
    }

    this.pendingApprovals.set(requestId, { requestId, sessionId })

    const permissionRequest: PermissionRequest = {
      requestId,
      toolName: 'Bash',
      toolInput: {
        command: typeof request.command === 'string' ? request.command : '',
        cwd: request.cwd ?? null,
        host: request.host ?? null,
        security: request.security ?? null,
        ask: request.ask ?? null,
        resolvedPath: request.resolvedPath ?? null,
        sessionKey: request.sessionKey ?? null,
        agentId: request.agentId ?? null,
      },
      toolUseId: requestId,
    }

    this.emit('permissionRequest', sessionId, permissionRequest)
  }

  private handleApprovalResolved(payload: unknown): void {
    if (!isRecord(payload))
      return
    const typedPayload = payload as ExecApprovalResolvedPayload
    const requestId = typeof typedPayload.id === 'string' ? typedPayload.id.trim() : ''
    if (!requestId)
      return
    this.pendingApprovals.delete(requestId)
  }

  private resolveSessionIdFromChatPayload(payload: ChatEventPayload): string | null {
    const runId = typeof payload.runId === 'string' ? payload.runId.trim() : ''
    if (runId && this.sessionIdByRunId.has(runId)) {
      const sid = this.sessionIdByRunId.get(runId) ?? null
      console.log('[Debug:resolveSessionId] resolved by runId:', runId, '→', sid)
      return sid
    }

    const sessionKey = typeof payload.sessionKey === 'string' ? payload.sessionKey.trim() : ''
    if (sessionKey) {
      const sessionId = this.resolveSessionIdBySessionKey(sessionKey)
      console.log('[Debug:resolveSessionId] resolved by sessionKey:', sessionKey, '→', sessionId)
      if (sessionId) {
        // Re-create ActiveTurn for channel session follow-up turns
        this.ensureActiveTurn(sessionId, sessionKey, runId)
        if (runId) {
          this.bindRunIdToTurn(sessionId, runId)
        }
        return sessionId
      }
    }

    // Try to resolve channel-originated sessions
    if (sessionKey && this.channelSessionSync) {
      console.log('[Debug:resolveSessionId] attempting channel resolve for sessionKey:', sessionKey)
      const channelSessionId = this.channelSessionSync.resolveOrCreateSession(sessionKey)
        || (!this.heartbeatSessionKeys.has(sessionKey) && this.channelSessionSync.resolveOrCreateMainAgentSession(sessionKey))
        || this.channelSessionSync.resolveOrCreateCronSession(sessionKey)
        || null
      console.log('[Debug:resolveSessionId] channel resolve — sessionKey:', sessionKey, '→', channelSessionId)
      if (channelSessionId) {
        // If this key was previously deleted, allow re-creation but skip history sync
        if (this.deletedChannelKeys.has(sessionKey)) {
          this.deletedChannelKeys.delete(sessionKey)
          this.fullySyncedSessions.add(channelSessionId)
          this.reCreatedChannelSessionIds.add(channelSessionId)
          console.log('[Debug:resolveSessionId] re-created after delete, skipping history sync for:', sessionKey)
        }
        this.rememberSessionKey(channelSessionId, sessionKey)
        this.ensureActiveTurn(channelSessionId, sessionKey, runId)
        if (runId) {
          this.bindRunIdToTurn(channelSessionId, runId)
        }
        return channelSessionId
      }
    }

    console.log('[Debug:resolveSessionId] failed — runId:', runId, 'sessionKey:', sessionKey)
    return null
  }

  private syncSystemMessagesFromHistory(
    sessionId: string,
    historyMessages: unknown[],
    options: { previousCountKnown: boolean, previousCount: number },
  ): void {
    if (historyMessages.length === 0) {
      this.gatewayHistoryCountBySession.set(sessionId, 0)
      return
    }

    const canUseCursor = options.previousCountKnown
      && options.previousCount >= 0
      && options.previousCount <= historyMessages.length
    const entries = extractGatewayHistoryEntries(
      canUseCursor ? historyMessages.slice(options.previousCount) : historyMessages,
    )
    this.gatewayHistoryCountBySession.set(sessionId, historyMessages.length)

    const systemEntries = entries.filter(entry => entry.role === 'system')
    if (systemEntries.length === 0) {
      return
    }

    const session = this.store.getSession(sessionId)
    const existingSystemTexts = new Set(
      (session?.messages ?? [])
        .filter(message => message.type === 'system')
        .map(message => message.content.trim())
        .filter(Boolean),
    )

    for (const entry of systemEntries) {
      if (existingSystemTexts.has(entry.text)) {
        continue
      }

      const systemMessage = this.store.addMessage(sessionId, {
        type: 'system',
        content: entry.text,
        metadata: {},
      })
      existingSystemTexts.add(entry.text)
      this.emit('message', sessionId, systemMessage)
    }
  }

  /**
   * Channel history prefetch/full-sync intentionally skips historical system entries.
   * Seed the raw gateway history cursor so those older reminders are not replayed
   * under the next assistant reply during final-history sync.
   */
  private markGatewayHistoryWindowConsumed(sessionId: string, historyMessages: unknown[]): void {
    if (historyMessages.length === 0) {
      return
    }
    this.gatewayHistoryCountBySession.set(sessionId, historyMessages.length)
  }

  private async syncFinalAssistantWithHistory(sessionId: string, turn: ActiveTurn): Promise<void> {
    console.log('[Debug:syncFinal] start — sessionId:', sessionId, 'sessionKey:', turn.sessionKey)
    const client = this.gatewayClient
    if (!client) {
      console.log('[Debug:syncFinal] no gateway client, skipping')
      return
    }

    try {
      const history = await client.request<{ messages?: unknown[] }>('chat.history', {
        sessionKey: turn.sessionKey,
        limit: FINAL_HISTORY_SYNC_LIMIT,
      })
      const msgCount = Array.isArray(history?.messages) ? history.messages.length : 0
      console.log('[Debug:syncFinal] chat.history returned', msgCount, 'messages')
      if (!Array.isArray(history?.messages) || history.messages.length === 0) {
        this.gatewayHistoryCountBySession.set(sessionId, 0)
        return
      }
      const previousHistoryCountKnown = this.gatewayHistoryCountBySession.has(sessionId)
      const previousHistoryCount = this.gatewayHistoryCountBySession.get(sessionId) ?? 0
      this.syncSystemMessagesFromHistory(sessionId, history.messages, {
        previousCountKnown: previousHistoryCountKnown,
        previousCount: previousHistoryCount,
      })

      // Debug: dump all history message roles and content types
      for (let i = 0; i < history.messages.length; i++) {
        const m = history.messages[i] as Record<string, unknown>
        if (!isRecord(m))
          continue
        const r = typeof m.role === 'string' ? m.role : '?'
        let contentSummary: string
        if (Array.isArray(m.content)) {
          const types = (m.content as Array<Record<string, unknown>>).filter(isRecord).map(b => b.type)
          contentSummary = `blocks:[${types.join(',')}]`
        }
        else if (typeof m.content === 'string') {
          contentSummary = `text(${(m.content as string).length})`
        }
        else {
          contentSummary = String(typeof m.content)
        }
        console.log(`[Debug:syncFinal:history] [${i}] role=${r} content=${contentSummary}`)
        // Print non-text blocks for tool/assistant messages
        if (r !== 'user' && Array.isArray(m.content)) {
          for (const block of m.content as Array<Record<string, unknown>>) {
            if (isRecord(block) && typeof block.type === 'string' && block.type !== 'text' && block.type !== 'thinking') {
              console.log(`[Debug:syncFinal:history] [${i}] block:`, JSON.stringify(block).slice(0, 800))
            }
          }
        }
      }

      // For channel sessions, sync user messages that may have been missed during
      // prefetch (gateway history might not include in-progress run messages).
      const isChannel = this.channelSessionSync
        && !isManagedSessionKey(turn.sessionKey)
        && this.channelSessionSync.isChannelSessionKey(turn.sessionKey)
      if (isChannel) {
        const latestOnly = this.reCreatedChannelSessionIds.has(sessionId)
        this.syncChannelUserMessages(sessionId, history.messages, latestOnly, turn.sessionKey.includes(':discord:'), turn.sessionKey.includes(':qqbot:'))
      }

      // Stale turn protection: only skip assistant text alignment (which could overwrite
      // a newer turn's state). User/system message sync above is idempotent and safe.
      if (!this.isCurrentTurnToken(sessionId, turn.turnToken)) {
        console.log('[Debug:syncFinal] stale turn token, skipping assistant text alignment for sessionId:', sessionId, 'turnToken:', turn.turnToken)
        return
      }

      let canonicalText = ''
      if (isChannel) {
        // For channel sessions, merge all assistant text from the current turn
        canonicalText = extractCurrentTurnAssistantText(history.messages)
      }
      else {
        // For non-channel sessions, use the last assistant message with text
        for (let index = history.messages.length - 1; index >= 0; index -= 1) {
          const message = history.messages[index]
          if (!isRecord(message))
            continue
          const role = typeof message.role === 'string' ? message.role.trim().toLowerCase() : ''
          if (role !== 'assistant')
            continue
          canonicalText = extractMessageText(message).trim()
          if (canonicalText) {
            break
          }
        }
      }
      if (!canonicalText) {
        console.log('[Debug:syncFinal] no canonical assistant text found in history')
        return
      }

      // For channel sessions, append file paths from "message" tool calls as clickable links
      if (isChannel) {
        const sentFilePaths = extractSentFilePathsFromHistory(history.messages)
        if (sentFilePaths.length > 0) {
          console.log('[Debug:syncFinal] found sent file paths:', sentFilePaths)
          const fileLinks = sentFilePaths
            .map(fp => `[${path.basename(fp)}](${fp})`)
            .join('\n')
          canonicalText = `${canonicalText}\n\n${fileLinks}`
        }
      }

      console.log('[Debug:syncFinal] canonicalText length:', canonicalText.length, 'assistantMessageId:', turn.assistantMessageId)

      const canonicalSegmentText = this.resolveAssistantSegmentText(turn, canonicalText)
      turn.currentText = canonicalText
      turn.currentAssistantSegmentText = canonicalSegmentText

      if (!canonicalSegmentText) {
        return
      }

      if (!turn.assistantMessageId) {
        const reusedMessageId = this.reuseFinalAssistantMessage(sessionId, canonicalSegmentText)
        if (reusedMessageId) {
          turn.assistantMessageId = reusedMessageId
          return
        }

        const assistantMessage = this.store.addMessage(sessionId, {
          type: 'assistant',
          content: canonicalSegmentText,
          metadata: {
            isStreaming: false,
            isFinal: true,
          },
        })
        turn.assistantMessageId = assistantMessage.id
        this.emit('message', sessionId, assistantMessage)
        return
      }

      const session = this.store.getSession(sessionId)
      const currentMessage = session?.messages.find(message => message.id === turn.assistantMessageId)
      const currentText = currentMessage?.content.trim() ?? ''
      if (canonicalSegmentText === currentText) {
        return
      }

      this.store.updateMessage(sessionId, turn.assistantMessageId, {
        content: canonicalSegmentText,
        metadata: {
          isStreaming: false,
          isFinal: true,
        },
      })
      this.emit('messageUpdate', sessionId, turn.assistantMessageId, canonicalSegmentText)
    }
    catch (error) {
      console.warn('[OpenClawRuntime] chat.history sync after final failed:', error)
    }
  }

  private collectChannelHistoryEntries(
    historyMessages: unknown[],
    isDiscord: boolean,
    isQQ: boolean,
  ): ChannelHistorySyncEntry[] {
    const historyEntries: ChannelHistorySyncEntry[] = []
    for (const message of historyMessages) {
      if (!isRecord(message))
        continue
      const role = typeof message.role === 'string' ? message.role.trim().toLowerCase() : ''
      if (role !== 'user' && role !== 'assistant')
        continue
      let text = extractMessageText(message).trim()
      if (isDiscord)
        text = stripDiscordMentions(text)
      if (isQQ && role === 'user')
        text = stripQQBotSystemPrompt(text)
      if (text) {
        historyEntries.push({ role: role as 'user' | 'assistant', text })
      }
    }
    return historyEntries
  }

  private collectLocalChannelEntries(sessionId: string): ChannelHistorySyncEntry[] {
    const session = this.store.getSession(sessionId)
    if (!session)
      return []

    const localEntries: ChannelHistorySyncEntry[] = []
    for (const msg of session.messages) {
      if (msg.type !== 'user' && msg.type !== 'assistant')
        continue
      const text = msg.content.trim()
      if (!text)
        continue
      localEntries.push({ role: msg.type, text })
    }
    return localEntries
  }

  private computeChannelHistoryFirstNewIndex(
    localEntries: ChannelHistorySyncEntry[],
    historyEntries: ChannelHistorySyncEntry[],
    cursor: number,
  ): { firstNewIdx: number, strategy: string } {
    if (localEntries.length === 0) {
      return { firstNewIdx: 0, strategy: 'empty-local' }
    }

    // `chat.history` is byte-bounded in OpenClaw, so the returned window can slide
    // long before it reaches our requested count. Match the local tail against the
    // current history prefix to find the continuation point without trusting length.
    const maxOverlap = Math.min(localEntries.length, historyEntries.length)
    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      let matched = true
      for (let idx = 0; idx < overlap; idx += 1) {
        const localEntry = localEntries[localEntries.length - overlap + idx]
        const historyEntry = historyEntries[idx]
        if (!isSameChannelHistoryEntry(localEntry, historyEntry)) {
          matched = false
          break
        }
      }
      if (matched) {
        return { firstNewIdx: overlap, strategy: 'tail-overlap' }
      }
    }

    let lastLocalUserIdx = -1
    for (let idx = localEntries.length - 1; idx >= 0; idx -= 1) {
      if (localEntries[idx].role === 'user') {
        lastLocalUserIdx = idx
        break
      }
    }

    if (lastLocalUserIdx >= 0) {
      const lastLocalUser = localEntries[lastLocalUserIdx]
      let prevLocalUserText: string | undefined
      for (let idx = lastLocalUserIdx - 1; idx >= 0; idx -= 1) {
        if (localEntries[idx].role === 'user') {
          prevLocalUserText = localEntries[idx].text
          break
        }
      }

      for (let idx = historyEntries.length - 1; idx >= 0; idx -= 1) {
        if (historyEntries[idx].role !== 'user' || historyEntries[idx].text !== lastLocalUser.text) {
          continue
        }
        if (prevLocalUserText !== undefined && idx > 0) {
          let prevHistUserText: string | undefined
          for (let histIdx = idx - 1; histIdx >= 0; histIdx -= 1) {
            if (historyEntries[histIdx].role === 'user') {
              prevHistUserText = historyEntries[histIdx].text
              break
            }
          }
          if (prevHistUserText !== prevLocalUserText) {
            continue
          }
        }
        return { firstNewIdx: idx + 1, strategy: 'last-user-anchor' }
      }
    }

    let localIdx = 0
    let forwardFirstNewIdx = 0
    for (let idx = 0; idx < historyEntries.length; idx += 1) {
      if (localIdx < localEntries.length && isSameChannelHistoryEntry(historyEntries[idx], localEntries[localIdx])) {
        localIdx += 1
        forwardFirstNewIdx = idx + 1
      }
    }
    if (forwardFirstNewIdx > 0) {
      return { firstNewIdx: forwardFirstNewIdx, strategy: 'forward-match' }
    }

    if (historyEntries.length < cursor) {
      return { firstNewIdx: 0, strategy: 'history-rewrite' }
    }

    return {
      firstNewIdx: Math.min(cursor, historyEntries.length),
      strategy: 'cursor-fallback',
    }
  }

  /**
   * Sync user messages from gateway chat.history that haven't been added to the local store yet.
   * Used for channel-originated sessions (e.g. Telegram) where user messages arrive via the
   * gateway rather than the LobsterAI UI.
   *
   * Called at the start of a new turn (via prefetchChannelUserMessages) so that user messages
   * appear before the assistant's streaming response. Both chat and agent events are buffered
   * during prefetch, so the replay order matches direct cowork sessions.
   *
   * Reconciles against the local tail instead of trusting history length/cursor alone,
   * because OpenClaw's `chat.history` window can slide due to byte limits well before
   * the requested message count is reached.
   */
  private syncChannelUserMessages(sessionId: string, historyMessages: unknown[], latestOnly = false, isDiscord = false, isQQ = false): void {
    console.log('[Debug:syncChannelUserMessages] sessionId:', sessionId, 'historyMessages:', historyMessages.length, 'latestOnly:', latestOnly, 'isQQ:', isQQ)
    const historyEntries = this.collectChannelHistoryEntries(historyMessages, isDiscord, isQQ)

    const cursor = this.channelSyncCursor.get(sessionId) ?? 0
    console.log('[Debug:syncChannelUserMessages] cursor:', cursor, 'history entries:', historyEntries.length)

    // When latestOnly is true (e.g. session re-created after deletion),
    // only sync the last user message — the one that triggered this turn.
    // Advance cursor to end so subsequent syncs don't replay old history.
    if (latestOnly) {
      if (historyEntries.length > 0) {
        const lastUser = [...historyEntries].reverse().find(entry => entry.role === 'user')
        if (lastUser) {
          const userMessage = this.store.addMessage(sessionId, {
            type: 'user',
            content: lastUser.text,
            metadata: {},
          })
          this.emit('message', sessionId, userMessage)
          console.log('[Debug:syncChannelUserMessages] latestOnly: synced last user message')
        }
      }
      this.channelSyncCursor.set(sessionId, historyEntries.length)
      return
    }

    const localEntries = this.collectLocalChannelEntries(sessionId)
    const { firstNewIdx, strategy } = this.computeChannelHistoryFirstNewIndex(localEntries, historyEntries, cursor)
    console.log(
      '[Debug:syncChannelUserMessages] continuation strategy:',
      strategy,
      'firstNewIdx:',
      firstNewIdx,
      'local entries:',
      localEntries.length,
      'history entries:',
      historyEntries.length,
    )

    // Sync user messages from gateway history.
    // Only sync user messages here — assistant messages are already added by the
    // real-time streaming pipeline (handleChatDelta / handleAgentEvent) and by
    // syncFinalAssistantWithHistory's own addMessage/updateMessage logic.
    //
    // When syncing a user message, check whether the corresponding assistant response
    // was already created locally (e.g. due to prefetch timeout where the assistant
    // streamed before user messages were synced). If so, use insertMessageBeforeId
    // to place the user message before the assistant — preserving correct chronological
    // order. This handles the race condition where gateway chat.history lags behind
    // the real-time streaming events.
    let syncedCount = 0

    // Collect all user message indices that need syncing:
    // 1. Normal: user messages from firstNewIdx onwards
    // 2. Repair: user messages before firstNewIdx that are missing locally
    //    (can happen when computeChannelHistoryFirstNewIndex's forward-match
    //    strategy matches the assistant but skips the preceding user message)
    const currentSession = this.store.getSession(sessionId)
    const localUserTexts = new Set<string>()
    if (currentSession) {
      for (const msg of currentSession.messages) {
        if (msg.type === 'user') {
          localUserTexts.add(msg.content.trim())
        }
      }
    }

    const userIndicesToSync: number[] = []
    // Normal range: from firstNewIdx onwards
    for (let i = firstNewIdx; i < historyEntries.length; i++) {
      if (historyEntries[i].role === 'user') {
        userIndicesToSync.push(i)
      }
    }
    // Repair range: before firstNewIdx, missing locally
    for (let i = 0; i < firstNewIdx; i++) {
      if (historyEntries[i].role === 'user' && !localUserTexts.has(historyEntries[i].text)) {
        userIndicesToSync.push(i)
      }
    }

    for (const idx of userIndicesToSync) {
      const entry = historyEntries[idx]

      // Find the next assistant entry in history after this user entry, then
      // look for a matching local assistant message. If found, insert the user
      // message before it to maintain correct chronological order.
      let insertBeforeId: string | null = null
      if (currentSession) {
        for (let j = idx + 1; j < historyEntries.length; j++) {
          if (historyEntries[j].role !== 'assistant')
            continue
          const assistantText = historyEntries[j].text
          // Match by content prefix — local text may be segmented or truncated
          const matchPrefix = assistantText.slice(0, 100)
          const localMatch = currentSession.messages.find(
            (m: CoworkMessage) => m.type === 'assistant' && m.content.trim().startsWith(matchPrefix),
          )
          if (localMatch) {
            insertBeforeId = localMatch.id
          }
          break
        }
      }

      let userMessage
      if (insertBeforeId) {
        userMessage = this.store.insertMessageBeforeId(sessionId, insertBeforeId, {
          type: 'user',
          content: entry.text,
          metadata: {},
        })
        console.log('[Debug:syncChannelUserMessages] inserted user message before assistant, sessionId:', sessionId, 'idx:', idx, 'firstNewIdx:', firstNewIdx)
      }
      else {
        userMessage = this.store.addMessage(sessionId, {
          type: 'user',
          content: entry.text,
          metadata: {},
        })
      }
      this.emit('message', sessionId, userMessage)
      localUserTexts.add(entry.text)
      syncedCount++
    }

    this.channelSyncCursor.set(sessionId, historyEntries.length)
    console.log('[Debug:syncChannelUserMessages] synced', syncedCount, 'new messages (firstNewIdx:', firstNewIdx, ', newCursor:', historyEntries.length, ')')
  }

  private getUserMessageCount(sessionId: string): number {
    const session = this.store.getSession(sessionId)
    if (!session)
      return 0
    return session.messages.filter((m: CoworkMessage) => m.type === 'user').length
  }

  /**
   * Sync full conversation history for a newly discovered channel session.
   * Adds both user and assistant messages to the local CoworkStore in order.
   * Skipped if the session has already been fully synced.
   *
   * Uses position-based matching to avoid false dedup of identical-content messages.
   */
  private async syncFullChannelHistory(sessionId: string, sessionKey: string): Promise<void> {
    if (this.fullySyncedSessions.has(sessionId))
      return
    this.fullySyncedSessions.add(sessionId)

    const client = this.gatewayClient
    if (!client)
      return

    console.log('[ChannelSync] syncFullChannelHistory: start — sessionId:', sessionId, 'sessionKey:', sessionKey)
    try {
      const history = await client.request<{ messages?: unknown[] }>('chat.history', {
        sessionKey,
        limit: OpenClawRuntimeAdapter.FULL_HISTORY_SYNC_LIMIT,
      })
      if (!Array.isArray(history?.messages) || history.messages.length === 0) {
        console.log('[ChannelSync] syncFullChannelHistory: no messages in history')
        return
      }
      this.markGatewayHistoryWindowConsumed(sessionId, history.messages)

      const session = this.store.getSession(sessionId)
      // Build ordered list of existing local messages for position-based matching
      interface MsgEntry { role: 'user' | 'assistant', text: string }
      const localEntries: MsgEntry[] = []
      if (session) {
        for (const msg of session.messages) {
          if (msg.type === 'user' || msg.type === 'assistant') {
            localEntries.push({ role: msg.type, text: msg.content.trim() })
          }
        }
      }

      const isDiscord = sessionKey.includes(':discord:')
      const isQQ = sessionKey.includes(':qqbot:')
      // Build history entries
      const historyEntries: MsgEntry[] = []
      for (const message of history.messages) {
        if (!isRecord(message))
          continue
        const role = typeof message.role === 'string' ? message.role.trim().toLowerCase() : ''
        if (role !== 'user' && role !== 'assistant')
          continue
        let text = extractMessageText(message).trim()
        if (isDiscord)
          text = stripDiscordMentions(text)
        if (isQQ && role === 'user')
          text = stripQQBotSystemPrompt(text)
        if (text) {
          historyEntries.push({ role: role as 'user' | 'assistant', text })
        }
      }

      // Find where local messages end in the history to determine firstNewIdx.
      // Primary strategy: reverse matching from the end of both arrays.
      // This handles the sliding window case where oldest local messages may no
      // longer appear in history (e.g. local has [m1..m50], history has [m3..m52]).
      let firstNewIdx = 0
      if (localEntries.length > 0) {
        const lastLocal = localEntries[localEntries.length - 1]
        let matchPos = -1
        for (let i = historyEntries.length - 1; i >= 0; i--) {
          if (historyEntries[i].role === lastLocal.role
            && historyEntries[i].text === lastLocal.text) {
            if (localEntries.length >= 2 && i > 0) {
              const secondLastLocal = localEntries[localEntries.length - 2]
              if (historyEntries[i - 1].role === secondLastLocal.role
                && historyEntries[i - 1].text === secondLastLocal.text) {
                matchPos = i
                break
              }
              continue
            }
            matchPos = i
            break
          }
        }

        // Fallback: if the last local entry is an assistant message and matching failed,
        // the stored text may be a segment (from resolveAssistantSegmentText) that differs
        // from the full text in gateway history. Retry with the last USER message instead.
        let usedUserFallback = false
        if (matchPos < 0 && lastLocal.role === 'assistant') {
          let lastLocalUserIdx = -1
          for (let j = localEntries.length - 1; j >= 0; j--) {
            if (localEntries[j].role === 'user') {
              lastLocalUserIdx = j
              break
            }
          }
          if (lastLocalUserIdx >= 0) {
            const lastLocalUser = localEntries[lastLocalUserIdx]
            // Find preceding user message in local for double-verification
            let prevLocalUserText: string | undefined
            for (let j = lastLocalUserIdx - 1; j >= 0; j--) {
              if (localEntries[j].role === 'user') {
                prevLocalUserText = localEntries[j].text
                break
              }
            }
            console.log('[ChannelSync] syncFullChannelHistory: assistant match failed, retrying with last user entry')
            for (let i = historyEntries.length - 1; i >= 0; i--) {
              if (historyEntries[i].role === 'user'
                && historyEntries[i].text === lastLocalUser.text) {
                // Double-check: verify the preceding user message also matches
                if (prevLocalUserText !== undefined && i > 0) {
                  let prevHistUserText: string | undefined
                  for (let k = i - 1; k >= 0; k--) {
                    if (historyEntries[k].role === 'user') {
                      prevHistUserText = historyEntries[k].text
                      break
                    }
                  }
                  if (prevHistUserText !== prevLocalUserText) {
                    continue // Double-check failed, keep searching
                  }
                }
                matchPos = i
                usedUserFallback = true
                break
              }
            }
          }
        }

        if (matchPos >= 0) {
          firstNewIdx = matchPos + 1
          // When user-message fallback was used, the assistant replies immediately following
          // the matched user message are already in local (as segments). Skip them to prevent
          // duplicate assistant messages.
          if (usedUserFallback) {
            while (firstNewIdx < historyEntries.length && historyEntries[firstNewIdx].role === 'assistant') {
              firstNewIdx++
            }
          }
        }
        else {
          // Reverse match failed — fall back to forward sequential matching.
          // This covers the case where local is a strict prefix of history.
          let localIdx = 0
          for (let i = 0; i < historyEntries.length; i++) {
            if (localIdx < localEntries.length
              && historyEntries[i].role === localEntries[localIdx].role
              && historyEntries[i].text === localEntries[localIdx].text) {
              localIdx++
              firstNewIdx = i + 1
            }
          }
        }
      }

      let syncedCount = 0
      for (let i = firstNewIdx; i < historyEntries.length; i++) {
        const entry = historyEntries[i]
        if (entry.role === 'user') {
          const userMsg = this.store.addMessage(sessionId, {
            type: 'user',
            content: entry.text,
            metadata: {},
          })
          this.emit('message', sessionId, userMsg)
        }
        else {
          const assistantMsg = this.store.addMessage(sessionId, {
            type: 'assistant',
            content: entry.text,
            metadata: { isStreaming: false, isFinal: true },
          })
          this.emit('message', sessionId, assistantMsg)
        }
        syncedCount++
      }

      console.log('[ChannelSync] syncFullChannelHistory: synced', syncedCount, 'messages for sessionId:', sessionId)

      // Initialize the sync cursor so incremental syncs know where to start
      this.channelSyncCursor.set(sessionId, historyEntries.length)

      // Notify renderer to refresh
      if (syncedCount > 0) {
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send('cowork:sessions:changed')
          }
        }
      }
    }
    catch (error) {
      console.error('[ChannelSync] syncFullChannelHistory: error:', error)
      // Remove from synced set so retry is possible
      this.fullySyncedSessions.delete(sessionId)
    }
  }

  /**
   * Incremental sync for an already-known channel session.
   * Fetches recent history and appends any messages not yet in the local store.
   * Lightweight: uses position-based matching so only truly new messages are added.
   */
  private async incrementalChannelSync(sessionId: string, sessionKey: string): Promise<void> {
    const client = this.gatewayClient
    if (!client)
      return

    const history = await client.request<{ messages?: unknown[] }>('chat.history', {
      sessionKey,
      limit: FINAL_HISTORY_SYNC_LIMIT,
    })
    if (!Array.isArray(history?.messages) || history.messages.length === 0)
      return

    const beforeCount = this.store.getSession(sessionId)?.messages.length ?? 0
    this.syncChannelUserMessages(sessionId, history.messages, false, sessionKey.includes(':discord:'), sessionKey.includes(':qqbot:'))
    const afterCount = this.store.getSession(sessionId)?.messages.length ?? 0

    if (afterCount > beforeCount) {
      console.log('[ChannelSync] incrementalSync: added', afterCount - beforeCount, 'messages for', sessionKey)
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('cowork:sessions:changed')
        }
      }
    }
  }

  /**
   * Trigger an immediate incremental sync after a channel session turn completes,
   * so that the renderer sees the latest messages without waiting for the next poll.
   */
  private syncChannelAfterTurn(sessionId: string, sessionKey: string): void {
    if (!this.channelSessionSync || !sessionKey)
      return
    if (!this.channelSessionSync.isChannelSessionKey(sessionKey))
      return
    if (!this.fullySyncedSessions.has(sessionId))
      return

    void this.incrementalChannelSync(sessionId, sessionKey).catch((err) => {
      console.warn('[ChannelSync] post-turn incremental sync failed for', sessionKey, err)
    })
  }

  private clearPendingApprovalsBySession(sessionId: string): void {
    for (const [requestId, pending] of this.pendingApprovals.entries()) {
      if (pending.sessionId === sessionId) {
        this.pendingApprovals.delete(requestId)
      }
    }
  }

  private cleanupSessionTurn(sessionId: string): void {
    const turn = this.activeTurns.get(sessionId)
    if (turn) {
      // Cancel any pending throttled messageUpdate timer for this turn
      if (turn.assistantMessageId) {
        this.clearPendingMessageUpdate(turn.assistantMessageId)
        this.lastMessageUpdateEmitTime.delete(turn.assistantMessageId)
      }
      turn.knownRunIds.forEach((knownRunId) => {
        this.sessionIdByRunId.delete(knownRunId)
        this.pendingAgentEventsByRunId.delete(knownRunId)
        this.lastChatSeqByRunId.delete(knownRunId)
        this.lastAgentSeqByRunId.delete(knownRunId)
      })
    }
    this.activeTurns.delete(sessionId)
    // NOTE: Do NOT clear lastSystemPromptBySession here — it must persist
    // across turns so that the system prompt is only injected on the first
    // turn of a session (or when it actually changes).  Cleanup happens in
    // onSessionDeleted() when the session is removed entirely.
    this.reCreatedChannelSessionIds.delete(sessionId)
  }

  /**
   * Called when a session is deleted from the store.
   * Purges all in-memory references so that new channel messages
   * with the same sessionKey can create a fresh session.
   */
  onSessionDeleted(sessionId: string): void {
    // Remove sessionIdBySessionKey entries pointing to this session
    const removedKeys: string[] = []
    for (const [key, id] of this.sessionIdBySessionKey.entries()) {
      if (id === sessionId) {
        this.sessionIdBySessionKey.delete(key)
        removedKeys.push(key)
      }
    }

    // Suppress polling re-creation for deleted channel keys.
    // Only real-time events (new IM messages) will re-create the session.
    for (const key of removedKeys) {
      this.deletedChannelKeys.add(key)
    }

    // Allow polling to rediscover channel sessions
    this.knownChannelSessionIds.delete(sessionId)

    // Allow full history re-sync when session is re-created
    this.fullySyncedSessions.delete(sessionId)
    this.channelSyncCursor.delete(sessionId)
    this.reCreatedChannelSessionIds.delete(sessionId)
    this.gatewayHistoryCountBySession.delete(sessionId)
    this.latestTurnTokenBySession.delete(sessionId)

    // Clean up active turn and related run-id mappings
    this.cleanupSessionTurn(sessionId)

    // Clean up pending approvals, bridged state, confirmation mode
    this.clearPendingApprovalsBySession(sessionId)
    this.bridgedSessions.delete(sessionId)
    this.confirmationModeBySession.delete(sessionId)

    // Propagate to channel session sync
    if (this.channelSessionSync) {
      this.channelSessionSync.onSessionDeleted(sessionId)
    }
  }

  /**
   * Ensure an ActiveTurn exists for a session. Used for channel-originated sessions
   * where new turns arrive after the previous turn was cleaned up.
   */
  private ensureActiveTurn(sessionId: string, sessionKey: string, runId: string): void {
    if (this.activeTurns.has(sessionId))
      return
    const turnRunId = runId || randomUUID()
    const turnToken = this.nextTurnToken(sessionId)
    const isChannel = this.channelSessionSync
      && !isManagedSessionKey(sessionKey)
      && this.channelSessionSync.isChannelSessionKey(sessionKey)
    console.log('[Debug:ensureActiveTurn] creating turn — sessionId:', sessionId, 'sessionKey:', sessionKey, 'runId:', turnRunId, 'isChannel:', !!isChannel, 'pendingUserSync:', !!isChannel)
    this.activeTurns.set(sessionId, {
      sessionId,
      sessionKey,
      runId: turnRunId,
      turnToken,
      knownRunIds: new Set(runId ? [runId] : [turnRunId]),
      assistantMessageId: null,
      committedAssistantText: '',
      currentAssistantSegmentText: '',
      currentText: '',
      currentContentText: '',
      currentContentBlocks: [],
      sawNonTextContentBlocks: false,
      textStreamMode: 'unknown',
      toolUseMessageIdByToolCallId: new Map(),
      toolResultMessageIdByToolCallId: new Map(),
      toolResultTextByToolCallId: new Map(),
      stopRequested: false,
      pendingUserSync: !!isChannel,
      bufferedChatPayloads: [],
      bufferedAgentPayloads: [],
    })
    if (runId) {
      this.sessionIdByRunId.set(runId, sessionId)
    }
    this.store.updateSession(sessionId, { status: 'running' })

    // For channel sessions, prefetch user messages before streaming starts
    if (isChannel) {
      void this.prefetchChannelUserMessages(sessionId, sessionKey)
    }
  }

  /**
   * Prefetch user messages from gateway history at the start of a channel session turn.
   * This ensures user messages appear before the assistant's streaming response.
   * Delta/final events are buffered until this completes.
   */
  private async prefetchChannelUserMessages(sessionId: string, sessionKey: string): Promise<void> {
    console.log('[Debug:prefetch] start — sessionId:', sessionId, 'sessionKey:', sessionKey)

    const MAX_ATTEMPTS = 5
    const BACKOFF_DELAYS = [500, 1000, 1500, 2000] // exponential-ish backoff
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const client = this.gatewayClient
        if (!client) {
          console.log('[Debug:prefetch] no gateway client available')
          break
        }

        const history = await client.request<{ messages?: unknown[] }>('chat.history', {
          sessionKey,
          limit: FINAL_HISTORY_SYNC_LIMIT,
        })
        const msgCount = Array.isArray(history?.messages) ? history.messages.length : 0
        console.log('[Debug:prefetch] chat.history returned', msgCount, 'messages (attempt', attempt, ')')

        if (Array.isArray(history?.messages) && history.messages.length > 0) {
          this.markGatewayHistoryWindowConsumed(sessionId, history.messages)
          const latestOnly = this.reCreatedChannelSessionIds.has(sessionId)
          const beforeCount = this.getUserMessageCount(sessionId)
          this.syncChannelUserMessages(sessionId, history.messages, latestOnly, sessionKey.includes(':discord:'), sessionKey.includes(':qqbot:'))
          const afterCount = this.getUserMessageCount(sessionId)
          const newUserMessages = afterCount - beforeCount
          console.log('[Debug:prefetch] synced user messages:', newUserMessages, '(before:', beforeCount, 'after:', afterCount, ')')

          if (newUserMessages > 0) {
            break // Successfully synced new user messages
          }

          // No new user messages but buffered events indicate agent is processing → history may lag
          const turn = this.activeTurns.get(sessionId)
          if (turn && (turn.bufferedChatPayloads.length > 0 || turn.bufferedAgentPayloads.length > 0)) {
            if (attempt < MAX_ATTEMPTS - 1) {
              const delay = BACKOFF_DELAYS[Math.min(attempt, BACKOFF_DELAYS.length - 1)]
              console.log('[Debug:prefetch] no new user messages but have buffered events, retrying after', delay, 'ms...')
              await new Promise(resolve => setTimeout(resolve, delay))
              continue
            }
          }
          break // No buffered events or max attempts reached
        }
        else {
          // Empty history — session may have just been created
          const turn = this.activeTurns.get(sessionId)
          if (turn && (turn.bufferedChatPayloads.length > 0 || turn.bufferedAgentPayloads.length > 0)) {
            if (attempt < MAX_ATTEMPTS - 1) {
              const delay = BACKOFF_DELAYS[Math.min(attempt, BACKOFF_DELAYS.length - 1)]
              console.log('[Debug:prefetch] empty history but have buffered events, retrying after', delay, 'ms...')
              await new Promise(resolve => setTimeout(resolve, delay))
              continue
            }
          }
          break
        }
      }
      catch (error) {
        console.warn('[OpenClawRuntime] prefetchChannelUserMessages attempt', attempt, 'failed:', error)
        if (attempt < MAX_ATTEMPTS - 1) {
          const delay = BACKOFF_DELAYS[Math.min(attempt, BACKOFF_DELAYS.length - 1)]
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    const turn = this.activeTurns.get(sessionId)
    if (!turn) {
      console.log('[Debug:prefetch] turn was removed during prefetch, cannot replay. sessionId:', sessionId)
      return
    }
    turn.pendingUserSync = false

    const chatBuffered = turn.bufferedChatPayloads.length
    const agentBuffered = turn.bufferedAgentPayloads.length
    console.log('[Debug:prefetch] replaying buffered events — chat:', chatBuffered, 'agent:', agentBuffered)

    // Merge and replay both chat and agent events in sequence order
    // so that tool use/result messages are interleaved with assistant text segments
    // just like in direct cowork sessions.
    const allBuffered: Array<{ type: 'chat' | 'agent', payload: unknown, seq?: number, bufferedAt: number, idx: number }> = []
    let bufIdx = 0
    for (const event of turn.bufferedChatPayloads) {
      allBuffered.push({ type: 'chat', payload: event.payload, seq: event.seq, bufferedAt: event.bufferedAt, idx: bufIdx++ })
    }
    for (const event of turn.bufferedAgentPayloads) {
      allBuffered.push({ type: 'agent', payload: event.payload, seq: event.seq, bufferedAt: event.bufferedAt, idx: bufIdx++ })
    }
    turn.bufferedChatPayloads = []
    turn.bufferedAgentPayloads = []

    allBuffered.sort((a, b) => {
      // Primary: sort by seq if both have it
      const hasSeqA = typeof a.seq === 'number'
      const hasSeqB = typeof b.seq === 'number'
      if (hasSeqA && hasSeqB)
        return a.seq! - b.seq!
      // Events with seq come before events without
      if (hasSeqA !== hasSeqB)
        return hasSeqA ? -1 : 1
      // Fallback: preserve arrival order via bufferedAt, then insertion index
      if (a.bufferedAt !== b.bufferedAt)
        return a.bufferedAt - b.bufferedAt
      return a.idx - b.idx
    })

    for (const event of allBuffered) {
      if (event.type === 'chat') {
        this.handleChatEvent(event.payload, event.seq)
      }
      else {
        this.handleAgentEvent(event.payload, event.seq)
      }
    }
    console.log('[Debug:prefetch] replay complete, sessionId:', sessionId)
  }

  private bindRunIdToTurn(sessionId: string, runId: string): void {
    const normalizedRunId = runId.trim()
    if (!normalizedRunId)
      return
    const turn = this.activeTurns.get(sessionId)
    if (!turn)
      return
    turn.knownRunIds.add(normalizedRunId)
    this.sessionIdByRunId.set(normalizedRunId, sessionId)
    this.flushPendingAgentEvents(sessionId, normalizedRunId)
  }

  private resolveTurn(sessionId: string): void {
    const pending = this.pendingTurns.get(sessionId)
    if (!pending)
      return
    this.pendingTurns.delete(sessionId)
    pending.resolve()
  }

  private rejectTurn(sessionId: string, error: Error): void {
    const pending = this.pendingTurns.get(sessionId)
    if (!pending)
      return
    this.pendingTurns.delete(sessionId)
    pending.reject(error)
  }

  private toSessionKey(sessionId: string): string {
    return buildManagedSessionKey(sessionId)
  }

  private requireGatewayClient(): GatewayClientLike {
    if (!this.gatewayClient) {
      throw new Error('OpenClaw gateway client is unavailable.')
    }
    return this.gatewayClient
  }

  /**
   * Return the current gateway client instance, or null if not yet connected.
   * Used by CronJobService to call cron.* APIs on the same gateway.
   */
  getGatewayClient(): GatewayClientLike | null {
    return this.gatewayClient
  }

  getSessionKeysForSession(sessionId: string): string[] {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) {
      return []
    }

    const keys: string[] = []
    for (const [key, mappedSessionId] of this.sessionIdBySessionKey.entries()) {
      if (mappedSessionId === normalizedSessionId) {
        keys.push(key)
      }
    }

    const managedKey = this.toSessionKey(normalizedSessionId)
    if (!keys.includes(managedKey)) {
      keys.push(managedKey)
    }

    keys.sort((left, right) => {
      const leftManaged = isManagedSessionKey(left)
      const rightManaged = isManagedSessionKey(right)
      if (leftManaged !== rightManaged) {
        return leftManaged ? 1 : -1
      }
      return left.localeCompare(right)
    })

    return keys
  }

  /**
   * Ensure the gateway client is connected and ready.
   * Resolves when the WebSocket connection is established and authenticated.
   */
  async ensureReady(): Promise<void> {
    await this.ensureGatewayClientReady()
  }
}
