import type { ContextMessage } from '@proj-airi/server-sdk'

import type { ChatStreamEvent, ContextPayload } from '../chat'

import { useBroadcastChannel } from '@vueuse/core'
import { watch } from 'vue'

import { CHAT_STREAM_CHANNEL_NAME, CONTEXT_CHANNEL_NAME, useChatStore } from '../chat'
import { useModsServerChannelStore } from '../mods/api/channel-server'

let installed = false

export function installChatContextBridge() {
  if (installed) {
    return {
      dispose: () => {},
    }
  }

  const chatStore = useChatStore()
  const modsChannelServer = useModsServerChannelStore()
  const { post: broadcastContext, data: incomingContext } = useBroadcastChannel<ContextMessage<ContextPayload>, ContextMessage<ContextPayload>>({
    name: CONTEXT_CHANNEL_NAME,
  })
  const { post: broadcastStreamEvent, data: incomingStreamEvent } = useBroadcastChannel<ChatStreamEvent, ChatStreamEvent>({
    name: CHAT_STREAM_CHANNEL_NAME,
  })

  let isProcessingRemoteStream = false

  const stopStreamBroadcastHooks = [
    chatStore.onBeforeMessageComposed(async (message) => {
      if (isProcessingRemoteStream)
        return
      broadcastStreamEvent({ type: 'before-compose', message, sessionId: chatStore.activeSessionId })
    }),
    chatStore.onAfterMessageComposed(async (message) => {
      if (isProcessingRemoteStream)
        return
      broadcastStreamEvent({ type: 'after-compose', message, sessionId: chatStore.activeSessionId })
    }),
    chatStore.onBeforeSend(async (message) => {
      if (isProcessingRemoteStream)
        return
      broadcastStreamEvent({ type: 'before-send', message, sessionId: chatStore.activeSessionId })
    }),
    chatStore.onAfterSend(async (message) => {
      if (isProcessingRemoteStream)
        return
      broadcastStreamEvent({ type: 'after-send', message, sessionId: chatStore.activeSessionId })
    }),
    chatStore.onTokenLiteral(async (literal) => {
      if (isProcessingRemoteStream)
        return
      broadcastStreamEvent({ type: 'token-literal', literal, sessionId: chatStore.activeSessionId })
    }),
    chatStore.onTokenSpecial(async (special) => {
      if (isProcessingRemoteStream)
        return
      broadcastStreamEvent({ type: 'token-special', special, sessionId: chatStore.activeSessionId })
    }),
    chatStore.onStreamEnd(async () => {
      if (isProcessingRemoteStream)
        return
      broadcastStreamEvent({ type: 'stream-end', sessionId: chatStore.activeSessionId })
    }),
    chatStore.onAssistantResponseEnd(async (message) => {
      if (isProcessingRemoteStream)
        return
      broadcastStreamEvent({ type: 'assistant-end', message, sessionId: chatStore.activeSessionId })
    }),
  ]

  const stopIncomingWatch = watch(incomingContext, (event) => {
    if (event)
      chatStore.ingestContextMessage(event)
  })

  const stopIncomingStreamWatch = watch(incomingStreamEvent, async (event) => {
    if (!event)
      return

    isProcessingRemoteStream = true
    try {
      if (event.sessionId && chatStore.activeSessionId !== event.sessionId)
        chatStore.setActiveSession(event.sessionId)

      switch (event.type) {
        case 'before-compose':
          await chatStore.emitBeforeMessageComposedHooks(event.message)
          break
        case 'after-compose':
          await chatStore.emitAfterMessageComposedHooks(event.message)
          break
        case 'before-send':
          await chatStore.emitBeforeSendHooks(event.message)
          break
        case 'after-send':
          await chatStore.emitAfterSendHooks(event.message)
          break
        case 'token-literal':
          await chatStore.emitTokenLiteralHooks(event.literal)
          break
        case 'token-special':
          await chatStore.emitTokenSpecialHooks(event.special)
          break
        case 'stream-end':
          await chatStore.emitStreamEndHooks()
          break
        case 'assistant-end':
          await chatStore.emitAssistantResponseEndHooks(event.message)
          break
      }
    }
    finally {
      isProcessingRemoteStream = false
    }
  })

  const offPublish = chatStore.onContextPublish((envelope, origin) => {
    if (origin !== 'broadcast')
      broadcastContext(envelope)

    if (origin === 'local')
      modsChannelServer.sendContextUpdate(envelope)
  })

  modsChannelServer.initialize({ possibleEvents: ['context:update'] }).catch(error => console.error('Context bridge init error:', error))
  const offWs = modsChannelServer.onContextUpdate((event) => {
    const envelope = event.data as ContextMessage<ContextPayload, Record<string, unknown>>
    chatStore.ingestContextMessage(envelope)
    broadcastContext(envelope)
  })

  installed = true

  return {
    dispose: () => {
      stopIncomingWatch()
      stopIncomingStreamWatch()
      offPublish()
      offWs?.()
      stopStreamBroadcastHooks.forEach(stop => stop())
      installed = false
    },
  }
}
