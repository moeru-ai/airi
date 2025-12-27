import type { ChatStreamEvent, ContextMessage } from '../types/chat'

import { useBroadcastChannel } from '@vueuse/core'
import { Mutex } from 'es-toolkit'
import { watch } from 'vue'

import { CHAT_STREAM_CHANNEL_NAME, CONTEXT_CHANNEL_NAME, useChatStore } from '../stores/chat'
import { useModsServerChannelStore } from '../stores/mods/api/channel-server'

const mutex = new Mutex()

export function useContextBridge() {
  const chatStore = useChatStore()
  const serverChannelStore = useModsServerChannelStore()

  const { post: broadcastContext, data: incomingContext } = useBroadcastChannel<ContextMessage, ContextMessage>({ name: CONTEXT_CHANNEL_NAME })
  const { post: broadcastStreamEvent, data: incomingStreamEvent } = useBroadcastChannel<ChatStreamEvent, ChatStreamEvent>({ name: CHAT_STREAM_CHANNEL_NAME })

  let disposeHookFns = [] as Array<() => void>

  return {
    initialize: async () => {
      await mutex.acquire()

      try {
        let isProcessingRemoteStream = false

        const { stop } = watch(incomingContext, (event) => {
          if (event)
            chatStore.ingestContextMessage(event)
        })
        disposeHookFns.push(stop)

        // Helper function to safely broadcast context
        const safeBroadcastContext = (event: ContextMessage) => {
          try {
            broadcastContext(event)
          }
          catch (error) {
            // BroadcastChannel might be closed (e.g., page unmounted, channel disposed)
            // Silently ignore the error to prevent breaking the chat flow
            if (error instanceof Error && error.name === 'InvalidStateError') {
              // Channel is closed, which is fine - just skip broadcasting
              return
            }
            // Re-throw other errors
            throw error
          }
        }

        disposeHookFns.push(serverChannelStore.onContextUpdate((event) => {
          chatStore.ingestContextMessage({ source: event.source, createdAt: Date.now(), ...event.data })
          safeBroadcastContext(event.data as ContextMessage)
        }))

        // Helper function to safely broadcast events
        const safeBroadcast = (event: ChatStreamEvent) => {
          try {
            broadcastStreamEvent(event)
          }
          catch (error) {
            // BroadcastChannel might be closed (e.g., page unmounted, channel disposed)
            // Silently ignore the error to prevent breaking the chat flow
            if (error instanceof Error && error.name === 'InvalidStateError') {
              // Channel is closed, which is fine - just skip broadcasting
              return
            }
            // Re-throw other errors
            throw error
          }
        }

        disposeHookFns.push(...[
          chatStore.onBeforeMessageComposed(async (message) => {
            if (isProcessingRemoteStream)
              return
            safeBroadcast({ type: 'before-compose', message, sessionId: chatStore.activeSessionId })
          }),
          chatStore.onAfterMessageComposed(async (message) => {
            if (isProcessingRemoteStream)
              return
            safeBroadcast({ type: 'after-compose', message, sessionId: chatStore.activeSessionId })
          }),
          chatStore.onBeforeSend(async (message) => {
            if (isProcessingRemoteStream)
              return
            safeBroadcast({ type: 'before-send', message, sessionId: chatStore.activeSessionId })
          }),
          chatStore.onAfterSend(async (message) => {
            if (isProcessingRemoteStream)
              return
            safeBroadcast({ type: 'after-send', message, sessionId: chatStore.activeSessionId })
          }),
          chatStore.onTokenLiteral(async (literal) => {
            if (isProcessingRemoteStream)
              return
            safeBroadcast({ type: 'token-literal', literal, sessionId: chatStore.activeSessionId })
          }),
          chatStore.onTokenSpecial(async (special) => {
            if (isProcessingRemoteStream)
              return
            safeBroadcast({ type: 'token-special', special, sessionId: chatStore.activeSessionId })
          }),
          chatStore.onStreamEnd(async () => {
            if (isProcessingRemoteStream)
              return
            safeBroadcast({ type: 'stream-end', sessionId: chatStore.activeSessionId })
          }),
          chatStore.onAssistantResponseEnd(async (message) => {
            if (isProcessingRemoteStream)
              return
            safeBroadcast({ type: 'assistant-end', message, sessionId: chatStore.activeSessionId })
          }),
        ])

        const { stop: stopIncomingStreamWatch } = watch(incomingStreamEvent, async (event) => {
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
        disposeHookFns.push(stopIncomingStreamWatch)
      }
      finally {
        mutex.release()
      }
    },

    dispose: async () => {
      await mutex.acquire()

      try {
        for (const fn of disposeHookFns) {
          fn()
        }
      }
      finally {
        mutex.release()
      }

      disposeHookFns = []
    },
  }
}
