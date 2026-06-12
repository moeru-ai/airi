import type { WebSocketEventInputs } from '@proj-airi/server-sdk'
import type { ChatHistoryItem, SendOutcome, StreamingAssistantMessage } from '@proj-airi/stage-ui/types/chat'
import type { ChatSessionMeta } from '@proj-airi/stage-ui/types/chat-session'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { errorMessageFrom } from '@moeru/std'
import { errorMessageFromValue } from '@proj-airi/stage-shared'
import { extractMessageText } from '@proj-airi/stage-ui/libs/chat-sync/wire-message'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatMaintenanceStore } from '@proj-airi/stage-ui/stores/chat/maintenance'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { defineStore, storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import { imageJournalTools } from './tools/builtin/image-journal'
import { weatherTools } from './tools/builtin/weather'
import { widgetsTools } from './tools/builtin/widgets'

type ChatSyncMode = 'inactive' | 'authority' | 'follower'
type ToolsetId = 'widgets' | 'artistry'

interface AttachmentPayload {
  type: 'image'
  data: string
  mimeType: string
}

interface SessionSnapshotPayload {
  activeSessionId: string
  sessionMessages: Record<string, ChatHistoryItem[]>
  sessionMetas: Record<string, ChatSessionMeta>
}

interface StreamSnapshotPayload {
  sending: boolean
  /**
   * Session that owns the in-flight send (null when idle). Mirrored so follower
   * windows can scope their stop button to the foreground session; without it a
   * follower's local `sendingSessionId` stays null and the button never shows.
   */
  sendingSessionId: string | null
  streamingMessage: StreamingAssistantMessage
}

interface IngestCommandPayload {
  text: string
  attachments?: AttachmentPayload[]
  input?: WebSocketEventInputs
  sessionId?: string
  toolset?: ToolsetId
  /** Forwarded to the orchestrator; see ChatOrchestratorSendOptions.rescuable. */
  rescuable?: boolean
}

interface SpotlightIngestPayload {
  text: string
}

interface SpotlightIngestResult {
  sessionId: string
  visibleText: string
}

interface ChatCommandMessage<C extends string = string, P = unknown> {
  type: 'command'
  authorityId?: string
  requestId: string
  senderId: string
  command: C
  payload: P
}

interface RetryCommandPayload {
  sessionId?: string
  index: number
}

type ChatResponsePayload
  = | { ok: true, result?: SpotlightIngestResult }
    | { ok: false, error?: string }

type ChatSyncMessage
  = | { type: 'authority-announcement', authorityId: string, sentAt: number }
    | { type: 'request-snapshot', requestId: string, senderId: string }
    | { type: 'session-snapshot', authorityId: string, snapshot: SessionSnapshotPayload }
    | { type: 'stream-snapshot', authorityId: string, snapshot: StreamSnapshotPayload }
    | ChatCommandMessage<'ingest', IngestCommandPayload>
    | ChatCommandMessage<'spotlight-ingest', SpotlightIngestPayload>
    | ChatCommandMessage<'retry', RetryCommandPayload>
    | ChatCommandMessage<'cleanup', { sessionId?: string }>
    | ChatCommandMessage<'delete-message', { sessionId?: string, messageId?: string, index?: number }>
    | ChatCommandMessage<'stop', { sessionId?: string }>
    | { type: 'ack', requestId: string, authorityId: string }
    | ({ type: 'response', requestId: string, authorityId: string, outcome?: SendOutcome } & ChatResponsePayload)

interface PendingRequest {
  resolve: (result?: unknown) => void
  reject: (error: Error) => void
  /**
   * Pre-ack deadline. The authority acks on receipt (before executing), and the
   * ack clears this so the request then waits for the real response with no
   * deadline (a send can stream for minutes). Undefined once acked, so only an
   * unanswered command (no live authority) ever times out.
   */
  timeout: ReturnType<typeof setTimeout> | undefined
}

const CHAT_SYNC_CHANNEL_NAME = 'airi:stage-tamagotchi:chat-sync'
const AUTHORITY_HEARTBEAT_INTERVAL_MS = 1000
const REQUEST_TIMEOUT_MS = 30000
const SPOTLIGHT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000

function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getRetryText(message: ChatHistoryItem | undefined): string | null {
  if (!message || message.role !== 'user')
    return null

  if (typeof message.content === 'string') {
    const text = message.content.trim()
    return text || null
  }

  if (!Array.isArray(message.content))
    return null

  const text = message.content.reduce<string[]>((texts, part) => {
    if (part.type !== 'text')
      return texts

    const value = part.text?.trim()
    if (value)
      texts.push(value)

    return texts
  }, []).join('\n\n')

  return text || null
}

function resolveRetrySourceIndex(messages: ChatHistoryItem[], index: number): number {
  const targetMessage = messages[index]
  if (!targetMessage)
    return -1

  if (targetMessage.role === 'user')
    return index

  if (targetMessage.role === 'assistant' || targetMessage.role === 'error') {
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (messages[cursor]?.role === 'user')
        return cursor
    }
  }

  return -1
}

function previewChatSyncPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') {
    return payload
  }

  const record = payload as Record<string, unknown>
  const text = typeof record.text === 'string' ? record.text : undefined

  return {
    ...record,
    text: text && text.length > 160 ? `${text.slice(0, 160)}...` : text,
    attachments: Array.isArray(record.attachments)
      ? `[${record.attachments.length} attachment(s)]`
      : record.attachments,
  }
}

function logChatSyncError(message: string, error: unknown, details: Record<string, unknown>) {
  console.error(`[chat-sync] ${message}`, {
    ...details,
    error,
    errorMessage: errorMessageFromValue(error),
  })
}

export const useChatSyncStore = defineStore('stage-tamagotchi:chat-sync', () => {
  const instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const mode = ref<ChatSyncMode>('inactive')
  const authorityId = ref<string | null>(null)

  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatOrchestrator = useChatOrchestratorStore()
  const { cleanupMessages } = useChatMaintenanceStore()
  const providersStore = useProvidersStore()
  const consciousnessStore = useConsciousnessStore()
  const { activeProvider, activeModel } = storeToRefs(consciousnessStore)
  const { activeSessionId, sessionMessages, sessionMetas } = storeToRefs(chatSession)
  const { streamingMessage } = storeToRefs(chatStream)
  const { sending, sendingSessionId } = storeToRefs(chatOrchestrator)

  const pendingRequests = new Map<string, PendingRequest>()
  const stopSyncWatchers: Array<() => void> = []
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let channel: BroadcastChannel | null = null

  function post(message: ChatSyncMessage) {
    channel?.postMessage(message)
  }

  function buildSessionSnapshot(): SessionSnapshotPayload {
    return chatSession.getSnapshot()
  }

  function buildStreamSnapshot(): StreamSnapshotPayload {
    return {
      sending: sending.value,
      sendingSessionId: sendingSessionId.value,
      streamingMessage: JSON.parse(JSON.stringify(streamingMessage.value)) as StreamingAssistantMessage,
    }
  }

  function broadcastAuthorityAnnouncement() {
    if (mode.value !== 'authority')
      return

    post({
      type: 'authority-announcement',
      authorityId: instanceId,
      sentAt: Date.now(),
    })
  }

  function broadcastSessionSnapshot() {
    if (mode.value !== 'authority')
      return

    post({
      type: 'session-snapshot',
      authorityId: instanceId,
      snapshot: buildSessionSnapshot(),
    })
  }

  function broadcastStreamSnapshot() {
    if (mode.value !== 'authority')
      return

    post({
      type: 'stream-snapshot',
      authorityId: instanceId,
      snapshot: buildStreamSnapshot(),
    })
  }

  function stopWatchers() {
    while (stopSyncWatchers.length > 0) {
      const stop = stopSyncWatchers.pop()
      stop?.()
    }
  }

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = undefined
    }
  }

  function registerAuthorityWatchers() {
    stopSyncWatchers.push(
      watch([activeSessionId, sessionMessages, sessionMetas], () => {
        broadcastSessionSnapshot()
      }, { deep: true, immediate: true }),
      watch([sending, sendingSessionId, streamingMessage], () => {
        broadcastStreamSnapshot()
      }, { deep: true, immediate: true }),
    )

    broadcastAuthorityAnnouncement()
    clearHeartbeat()
    heartbeatTimer = setInterval(() => {
      broadcastAuthorityAnnouncement()
    }, AUTHORITY_HEARTBEAT_INTERVAL_MS)
  }

  function applySessionSnapshot(snapshot: SessionSnapshotPayload) {
    const localActiveSessionId = activeSessionId.value
    const shouldPreserveLocalActiveSession = mode.value === 'follower'
      && !!localActiveSessionId
      && !!snapshot.sessionMessages[localActiveSessionId]

    chatSession.applyRemoteSnapshot({
      ...snapshot,
      activeSessionId: shouldPreserveLocalActiveSession
        ? localActiveSessionId
        : snapshot.activeSessionId,
    })
  }

  function applyStreamSnapshot(snapshot: StreamSnapshotPayload) {
    chatOrchestrator.sending = snapshot.sending
    chatOrchestrator.sendingSessionId = snapshot.sendingSessionId
    chatStream.streamingMessage = snapshot.streamingMessage
  }

  function resolveTools(toolset?: ToolsetId) {
    const toolsetRegistry: Record<string, () => Promise<any[]>> = {
      widgets: async () => {
        const [w, we] = await Promise.all([widgetsTools(), weatherTools()])
        return [...w, ...we]
      },
      artistry: async () => {
        const [ai, wi, we] = await Promise.all([
          imageJournalTools(),
          widgetsTools(),
          weatherTools(),
        ])
        return [...ai, ...wi, ...we]
      },
    }

    if (toolset && toolsetRegistry[toolset]) {
      return toolsetRegistry[toolset]
    }

    return undefined
  }

  function readNewAssistantVisibleText(sessionId: string, fromIndex: number): string {
    const assistant = chatSession.getSessionMessages(sessionId)
      .slice(fromIndex)
      .reverse()
      .find(message => message.role === 'assistant')
    return assistant ? extractMessageText(assistant) : ''
  }

  async function executeIngest(payload: IngestCommandPayload): Promise<SendOutcome> {
    const providerId = activeProvider.value
    const modelId = activeModel.value
    // Pre-orchestrator failures resolve with a structured error instead of
    // throwing. A resolved outcome rides the BroadcastChannel response back to a
    // follower window, where the composer's outcome.error branch surfaces it;
    // a throw would only reach the authority window and reject the relay, so the
    // two windows would take divergent paths. These all happen before any user
    // turn is appended, so turnCommitted is false.
    if (!providerId || !modelId)
      return { error: { message: 'No active chat provider or model configured', turnCommitted: false } }

    let chatProvider: ChatProvider | undefined
    try {
      chatProvider = await providersStore.getProviderInstance<ChatProvider>(providerId)
    }
    catch (error) {
      return { error: { message: errorMessageFrom(error) ?? `Failed to resolve chat provider "${providerId}"`, turnCommitted: false } }
    }
    if (!chatProvider)
      return { error: { message: `Failed to resolve chat provider "${providerId}"`, turnCommitted: false } }

    return await chatOrchestrator.ingest(payload.text, {
      model: modelId,
      chatProvider,
      attachments: payload.attachments,
      input: payload.input,
      tools: resolveTools(payload.toolset),
      rescuable: payload.rescuable,
    }, payload.sessionId)
  }

  async function executeSpotlightIngest(payload: SpotlightIngestPayload): Promise<SpotlightIngestResult> {
    // NOTICE: `chatOrchestrator.ingest()` returns void; remove this snapshot
    // read once ingest returns `{ sessionId, visibleText }`.
    const sessionId = activeSessionId.value
    const previousMessageCount = chatSession.getSessionMessages(sessionId).length

    await executeIngest({
      text: payload.text,
      toolset: 'artistry',
      sessionId,
    })

    const visibleText = readNewAssistantVisibleText(sessionId, previousMessageCount)
    if (!visibleText.trim())
      throw new Error('Spotlight returned an empty response')

    return {
      sessionId,
      visibleText,
    }
  }

  async function executeRetry(payload: RetryCommandPayload) {
    const sessionId = payload.sessionId || activeSessionId.value
    const currentMessages = chatSession.getSessionMessages(sessionId)
    const sourceIndex = resolveRetrySourceIndex(currentMessages, payload.index)
    if (sourceIndex < 0)
      throw new Error('Retry target has no retriable source message')

    const text = getRetryText(currentMessages[sourceIndex])
    if (!text)
      throw new Error('Retry target has no retriable user message')

    // Snapshot the pre-truncation history before the re-send: setSessionMessages
    // truncates from the source turn down, but the re-send may never run (a Stop
    // while it is queued behind an active send resolves rolledBack) or may fail.
    // Without the snapshot the truncated history would persist, silently dropping
    // the retried user turn and everything after it.
    const snapshot = currentMessages.slice()
    const nextMessages = currentMessages.slice(0, sourceIndex)
    chatSession.setSessionMessages(sessionId, nextMessages)

    const outcome = await executeIngest({
      text,
      sessionId,
      toolset: 'widgets',
    })

    // Guard the restore: a concurrent re-send or reset/fork may have changed
    // history since the truncation. Reference identity on the kept prefix tells
    // the cases apart: prefix gone means restore is skipped; prefix intact and
    // unchanged means restore the full snapshot; prefix intact but grown means
    // append only the missing tail.
    const restoreTruncation = () => {
      const current = chatSession.getSessionMessages(sessionId)
      const prefixIntact = nextMessages.every((message, index) => current[index] === message)
      if (!prefixIntact)
        return
      if (current.length === nextMessages.length) {
        chatSession.setSessionMessages(sessionId, snapshot)
        return
      }
      const removedTail = snapshot.slice(nextMessages.length)
      const presentIds = new Set(current.map(message => message.id).filter(Boolean))
      const missingTail = removedTail.filter(message => !message.id || !presentIds.has(message.id))
      if (missingTail.length === 0)
        return
      chatSession.setSessionMessages(sessionId, [...current, ...missingTail])
    }

    // Never started (stopped/cancelled before any output): undo the truncation
    // so the retried turn and the tail survive. A deliberate stop is a silent
    // success, so no error is surfaced.
    if (outcome?.rolledBack) {
      restoreTruncation()
      return
    }

    // Send-level failure: restore the tail only when the user turn never landed
    // (mirroring the composer policy). The error row must land in authority
    // history (as executeIngestDurable does for ingest): a follower-local row
    // would be wiped by the session snapshot the restore above just triggered.
    if (outcome?.error) {
      if (!outcome.error.turnCommitted)
        restoreTruncation()
      appendSessionErrorMessage(sessionId, outcome.error.message)
    }
  }

  function executeDeleteMessage(payload: { sessionId?: string, messageId?: string, index?: number }) {
    const sessionId = payload.sessionId || activeSessionId.value
    const nextMessages = chatSession.getSessionMessages(sessionId).filter((message, index) => {
      if (payload.messageId)
        return message.id !== payload.messageId
      if (payload.index !== undefined)
        return index !== payload.index
      return true
    })

    chatSession.setSessionMessages(sessionId, nextMessages)
  }

  /**
   * Authority-side ingest that makes a resolved stream/hook failure durable. A
   * resolved `outcome.error` leaves no record in authority history, so append the
   * error row here: it broadcasts to every window and survives the next session
   * snapshot, and the follower's composer suppresses its own local row for the
   * `outcome` source to avoid a duplicate.
   */
  async function executeIngestDurable(payload: IngestCommandPayload): Promise<SendOutcome> {
    const outcome = await executeIngest(payload)
    if (outcome.error)
      appendSessionErrorMessage(payload.sessionId || chatSession.activeSessionId, outcome.error.message)
    return outcome
  }

  function appendSessionErrorMessage(sessionId: string, message: string) {
    const nextMessages = [
      ...chatSession.getSessionMessages(sessionId),
      {
        role: 'error',
        content: message,
      } satisfies ChatHistoryItem,
    ]
    chatSession.setSessionMessages(sessionId, nextMessages)
  }

  function authorityCommandMeta(message: { requestId: string, senderId: string, command: string, payload: unknown }) {
    return {
      mode: mode.value,
      authorityId: authorityId.value,
      requestId: message.requestId,
      senderId: message.senderId,
      command: message.command,
      payload: previewChatSyncPayload(message.payload),
    }
  }

  async function handleCommand(message: Extract<ChatSyncMessage, { type: 'command' }>) {
    if (mode.value !== 'authority')
      return

    // Two-phase response: ack the moment a live authority receives the command,
    // BEFORE executing it. The requester drops its 30s deadline on the ack, so the
    // timeout fires only when no authority acks (the window is closed), a genuine
    // pre-append failure that preserves the throw-means-uncommitted invariant.
    post({ type: 'ack', requestId: message.requestId, authorityId: instanceId })

    const respond = (response: ChatResponsePayload & { outcome?: SendOutcome }) => {
      post({
        type: 'response',
        requestId: message.requestId,
        authorityId: instanceId,
        ...response,
      })
    }

    try {
      // Only `ingest` produces an outcome the composer can act on.
      let outcome: SendOutcome | undefined
      switch (message.command) {
        case 'ingest':
          outcome = await executeIngestDurable(message.payload)
          break
        case 'spotlight-ingest':
          respond({ ok: true, result: await executeSpotlightIngest(message.payload) })
          return
        case 'retry':
          await executeRetry(message.payload)
          break
        case 'cleanup':
          cleanupMessages(message.payload.sessionId)
          break
        case 'delete-message':
          executeDeleteMessage(message.payload)
          break
        case 'stop':
          chatOrchestrator.stopSending(message.payload.sessionId)
          break
      }

      respond({ ok: true, outcome })
    }
    catch (error) {
      const errorMessage = errorMessageFrom(error) ?? 'Unknown chat sync command failure'

      logChatSyncError('command failed', error, authorityCommandMeta(message))

      if (message.command === 'ingest')
        appendSessionErrorMessage(message.payload.sessionId || chatSession.activeSessionId, errorMessage)
      else if (message.command === 'spotlight-ingest')
        appendSessionErrorMessage(activeSessionId.value, errorMessage)

      respond({ ok: false, error: errorMessage })
    }
  }

  function handleAck(message: Extract<ChatSyncMessage, { type: 'ack' }>) {
    const pending = pendingRequests.get(message.requestId)
    if (!pending || pending.timeout === undefined)
      return

    // The authority is alive and now owns the command; the only failure mode the
    // pre-ack deadline guarded (no authority window) cannot happen anymore. Clear
    // it and wait for the response with no further deadline.
    // NOTICE: accepted limitation: if the authority window closes mid-stream the
    // request stays pending until dispose() rejects it. No post-ack timeout is
    // used because the legitimate wait (a long stream) is unbounded, so any
    // deadline here would risk the duplicate-turn bug a timeout-then-restore
    // reintroduces.
    clearTimeout(pending.timeout)
    pending.timeout = undefined
  }

  function handleResponse(message: Extract<ChatSyncMessage, { type: 'response' }>) {
    const pending = pendingRequests.get(message.requestId)
    if (!pending)
      return

    clearTimeout(pending.timeout)
    pendingRequests.delete(message.requestId)

    if (message.ok) {
      pending.resolve('result' in message ? message.result : message.outcome)
      return
    }

    pending.reject(new Error(message.error ?? 'Remote chat command failed'))
  }

  function handleMessage(event: MessageEvent<ChatSyncMessage>) {
    const message = event.data
    if (!message)
      return

    switch (message.type) {
      case 'authority-announcement':
        authorityId.value = message.authorityId
        if (mode.value === 'follower')
          post({ type: 'request-snapshot', requestId: createRequestId(), senderId: instanceId })
        return
      case 'request-snapshot':
        if (mode.value === 'authority')
          broadcastSessionSnapshot()
        return
      case 'session-snapshot':
        if (mode.value !== 'follower')
          return
        authorityId.value = message.authorityId
        applySessionSnapshot(message.snapshot)
        return
      case 'stream-snapshot':
        if (mode.value !== 'follower')
          return
        authorityId.value = message.authorityId
        applyStreamSnapshot(message.snapshot)
        return
      case 'command':
        void handleCommand(message)
        return
      case 'ack':
        handleAck(message)
        return
      case 'response':
        handleResponse(message)
    }
  }

  function attachChannel() {
    if (channel)
      return

    channel = new BroadcastChannel(CHAT_SYNC_CHANNEL_NAME)
    channel.addEventListener('message', handleMessage as EventListener)
  }

  function detachChannel() {
    if (!channel)
      return

    channel.removeEventListener('message', handleMessage as EventListener)
    channel.close()
    channel = null
  }

  function resetPendingRequests() {
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Chat sync channel disposed'))
    }
    pendingRequests.clear()
  }

  function initialize(nextMode: Exclude<ChatSyncMode, 'inactive'>) {
    if (mode.value === nextMode && channel)
      return

    dispose()
    attachChannel()
    mode.value = nextMode
    authorityId.value = nextMode === 'authority' ? instanceId : authorityId.value

    if (nextMode === 'authority') {
      registerAuthorityWatchers()
      broadcastSessionSnapshot()
      broadcastStreamSnapshot()
      return
    }

    post({ type: 'request-snapshot', requestId: createRequestId(), senderId: instanceId })
  }

  function dispatch<T>(
    message: Extract<ChatSyncMessage, { type: 'command' }>,
    timeoutMs: number = REQUEST_TIMEOUT_MS,
    timeoutError: () => Error = () => new Error('Timed out waiting for chat authority response'),
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(message.requestId)
        const error = timeoutError()
        logChatSyncError('command timed out waiting for authority response', error, authorityCommandMeta(message))
        reject(error)
      }, timeoutMs)

      pendingRequests.set(message.requestId, {
        resolve: result => resolve(result as T),
        reject,
        timeout,
      })
      post(message)
    })
  }

  async function requestIngest(payload: IngestCommandPayload): Promise<SendOutcome | undefined> {
    if (mode.value === 'authority') {
      // Same-window send: no command crosses the channel, so append the durable
      // error row here too (handleCommand only runs for follower-originated
      // commands). The composer suppresses its own `outcome` row to match.
      return await executeIngestDurable(payload)
    }

    return await dispatch<SendOutcome>({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'ingest',
      payload,
    })
  }

  async function requestSpotlightIngest(payload: SpotlightIngestPayload) {
    if (mode.value === 'authority')
      return executeSpotlightIngest(payload)

    return dispatch<SpotlightIngestResult>({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'spotlight-ingest',
      payload,
    }, SPOTLIGHT_REQUEST_TIMEOUT_MS, () => new Error('Spotlight response timed out'))
  }

  async function requestRetry(payload: RetryCommandPayload) {
    if (mode.value === 'authority') {
      await executeRetry(payload)
      return
    }

    return await dispatch<void>({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'retry',
      payload,
    })
  }

  async function requestCleanup(sessionId?: string) {
    if (mode.value === 'authority') {
      cleanupMessages(sessionId)
      return
    }

    return await dispatch<void>({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'cleanup',
      payload: { sessionId },
    })
  }

  async function requestDeleteMessage(payload: { sessionId?: string, messageId?: string, index?: number }) {
    if (mode.value === 'authority') {
      executeDeleteMessage(payload)
      return
    }

    return await dispatch<void>({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'delete-message',
      payload,
    })
  }

  async function requestStop(sessionId?: string) {
    if (mode.value === 'authority') {
      chatOrchestrator.stopSending(sessionId)
      return
    }

    return await dispatch<void>({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'stop',
      payload: { sessionId },
    })
  }

  function dispose() {
    stopWatchers()
    clearHeartbeat()
    resetPendingRequests()
    detachChannel()
    mode.value = 'inactive'
    authorityId.value = null
  }

  return {
    authorityId,
    mode,
    initialize,
    dispose,
    requestIngest,
    requestSpotlightIngest,
    requestRetry,
    requestCleanup,
    requestDeleteMessage,
    requestStop,
  }
})
