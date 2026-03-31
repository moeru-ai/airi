import type { WebSocketEventInputs } from '@proj-airi/server-sdk'
import type { ChatHistoryItem, StreamingAssistantMessage } from '@proj-airi/stage-ui/types/chat'
import type { ChatSessionMeta } from '@proj-airi/stage-ui/types/chat-session'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { errorMessageFrom } from '@moeru/std'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatMaintenanceStore } from '@proj-airi/stage-ui/stores/chat/maintenance'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { defineStore, storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import { widgetsTools } from './tools/builtin/widgets'

type ChatSyncMode = 'inactive' | 'authority' | 'follower'
type ToolsetId = 'widgets'

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
  streamingMessage: StreamingAssistantMessage
}

interface IngestCommandPayload {
  text: string
  attachments?: AttachmentPayload[]
  input?: WebSocketEventInputs
  sessionId?: string
  toolset?: ToolsetId
}

type ChatSyncMessage
  = | { type: 'authority-announcement', authorityId: string, sentAt: number }
    | { type: 'request-snapshot', requestId: string, senderId: string }
    | { type: 'session-snapshot', authorityId: string, snapshot: SessionSnapshotPayload }
    | { type: 'stream-snapshot', authorityId: string, snapshot: StreamSnapshotPayload }
    | { type: 'command', authorityId?: string, requestId: string, senderId: string, command: 'ingest', payload: IngestCommandPayload }
    | { type: 'command', authorityId?: string, requestId: string, senderId: string, command: 'cleanup', payload: { sessionId?: string } }
    | { type: 'command', authorityId?: string, requestId: string, senderId: string, command: 'delete-message', payload: { sessionId?: string, messageId?: string, index?: number } }
    | { type: 'response', requestId: string, authorityId: string, ok: boolean, error?: string }

interface PendingRequest {
  resolve: () => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

const CHAT_SYNC_CHANNEL_NAME = 'airi:stage-tamagotchi:chat-sync'
const AUTHORITY_HEARTBEAT_INTERVAL_MS = 1000
const REQUEST_TIMEOUT_MS = 30000

function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
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
  const { sending } = storeToRefs(chatOrchestrator)

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
      watch([sending, streamingMessage], () => {
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
    chatSession.applyRemoteSnapshot(snapshot)
  }

  function applyStreamSnapshot(snapshot: StreamSnapshotPayload) {
    chatOrchestrator.sending = snapshot.sending
    chatStream.streamingMessage = snapshot.streamingMessage
  }

  function resolveTools(toolset?: ToolsetId) {
    if (toolset === 'widgets')
      return widgetsTools

    return undefined
  }

  async function executeIngest(payload: IngestCommandPayload) {
    const providerId = activeProvider.value
    const modelId = activeModel.value
    if (!providerId || !modelId) {
      throw new Error('No active chat provider or model configured')
    }

    const chatProvider = await providersStore.getProviderInstance<ChatProvider>(providerId)
    if (!chatProvider) {
      throw new Error(`Failed to resolve chat provider "${providerId}"`)
    }

    await chatOrchestrator.ingest(payload.text, {
      model: modelId,
      chatProvider,
      attachments: payload.attachments,
      input: payload.input,
      tools: resolveTools(payload.toolset),
    }, payload.sessionId)
  }

  function executeDeleteMessage(payload: { sessionId?: string, messageId?: string, index?: number }) {
    const sessionId = payload.sessionId || chatSession.activeSessionId
    const nextMessages = chatSession.getSessionMessages(sessionId).filter((message, index) => {
      if (payload.messageId)
        return message.id !== payload.messageId
      if (payload.index !== undefined)
        return index !== payload.index
      return true
    })

    chatSession.setSessionMessages(sessionId, nextMessages)
  }

  async function handleCommand(message: Extract<ChatSyncMessage, { type: 'command' }>) {
    if (mode.value !== 'authority')
      return

    const respond = (ok: boolean, error?: string) => {
      post({
        type: 'response',
        requestId: message.requestId,
        authorityId: instanceId,
        ok,
        error,
      })
    }

    try {
      switch (message.command) {
        case 'ingest':
          await executeIngest(message.payload)
          break
        case 'cleanup':
          cleanupMessages(message.payload.sessionId)
          break
        case 'delete-message':
          executeDeleteMessage(message.payload)
          break
      }

      respond(true)
    }
    catch (error) {
      respond(false, errorMessageFrom(error) ?? 'Unknown chat sync command failure')
    }
  }

  function handleResponse(message: Extract<ChatSyncMessage, { type: 'response' }>) {
    const pending = pendingRequests.get(message.requestId)
    if (!pending)
      return

    clearTimeout(pending.timeout)
    pendingRequests.delete(message.requestId)

    if (message.ok) {
      pending.resolve()
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

  function dispatchCommand(message: Extract<ChatSyncMessage, { type: 'command' }>) {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(message.requestId)
        reject(new Error('Timed out waiting for chat authority response'))
      }, REQUEST_TIMEOUT_MS)

      pendingRequests.set(message.requestId, { resolve, reject, timeout })
      post(message)
    })
  }

  async function requestIngest(payload: IngestCommandPayload) {
    if (mode.value === 'authority') {
      await executeIngest(payload)
      return
    }

    return await dispatchCommand({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'ingest',
      payload,
    })
  }

  async function requestCleanup(sessionId?: string) {
    if (mode.value === 'authority') {
      cleanupMessages(sessionId)
      return
    }

    return await dispatchCommand({
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

    return await dispatchCommand({
      type: 'command',
      requestId: createRequestId(),
      senderId: instanceId,
      command: 'delete-message',
      payload,
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
    requestCleanup,
    requestDeleteMessage,
  }
})
