import type { UserMessage } from '@xsai/shared-chat'

import type { ChatStreamEvent, ContextMessage } from '../../../types/chat'

import { isStageTamagotchi, isStageWeb } from '@proj-airi/stage-shared'
import { useBroadcastChannel } from '@vueuse/core'
import { Mutex } from 'es-toolkit'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { CHAT_STREAM_CHANNEL_NAME, CONTEXT_CHANNEL_NAME, useChatStore } from '../../chat'
import { useModsServerChannelStore } from './channel-server'

export const useContextBridgeStore = defineStore('mods:api:context-bridge', () => {
  const mutex = new Mutex()

  const chatStore = useChatStore()
  const serverChannelStore = useModsServerChannelStore()

  const { post: broadcastContext, data: incomingContext } = useBroadcastChannel<ContextMessage, ContextMessage>({ name: CONTEXT_CHANNEL_NAME })
  const { post: broadcastStreamEvent, data: incomingStreamEvent } = useBroadcastChannel<ChatStreamEvent, ChatStreamEvent>({ name: CHAT_STREAM_CHANNEL_NAME })

  const disposeHookFns = ref<Array<() => void>>([])

  async function initialize() {
    await mutex.acquire()

    try {
      let isProcessingRemoteStream = false

      const { stop } = watch(incomingContext, (event) => {
        if (event)
          chatStore.ingestContextMessage(event)
      })
      disposeHookFns.value.push(stop)

      disposeHookFns.value.push(serverChannelStore.onContextUpdate((event) => {
        chatStore.ingestContextMessage({ source: event.source, createdAt: Date.now(), ...event.data })
        broadcastContext(event.data as ContextMessage)
      }))

      disposeHookFns.value.push(
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
      )

      disposeHookFns.value.push(chatStore.onAssistantMessage(async (message, messageText) => {
        serverChannelStore.send({
          type: 'output:gen-ai:chat:message',
          data: {
            message,
            'stage-web': isStageWeb(),
            'stage-tamagotchi': isStageTamagotchi(),
            'gen-ai:chat': messageText || '',
          },
        })
      }))

      disposeHookFns.value.push(chatStore.onChatTurnComplete(async (chat) => {
        serverChannelStore.send({
          type: 'output:gen-ai:chat:complete',
          data: {
            'input': chat.input as UserMessage,
            'composedMessage': chat.composedMessage,
            'contexts': chat.contexts,
            'message': chat.output,
            'toolCalls': [],
            'stage-web': isStageWeb(),
            'stage-tamagotchi': isStageTamagotchi(),
            'gen-ai:chat': chat.outputText,
          },
        })
      }))

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
      disposeHookFns.value.push(stopIncomingStreamWatch)
    }
    finally {
      mutex.release()
    }
  }

  async function dispose() {
    await mutex.acquire()

    try {
      for (const fn of disposeHookFns.value) {
        fn()
      }
    }
    finally {
      mutex.release()
    }

    disposeHookFns.value = []
  }

  return {
    initialize,
    dispose,
  }
})
