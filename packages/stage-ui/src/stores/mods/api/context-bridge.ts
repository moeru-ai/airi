import type { UserMessage } from '@xsai/shared-chat'
import type { ChatProvider } from '@xsai/shared-chat'

import type { ChatStreamEvent, ContextMessage } from '../../../types/chat'

import { isStageTamagotchi, isStageWeb } from '@proj-airi/stage-shared'
import { useBroadcastChannel } from '@vueuse/core'
import { Mutex, noop } from 'es-toolkit'
import { defineStore, storeToRefs } from 'pinia'
import { ref, watch } from 'vue'

import { CHAT_STREAM_CHANNEL_NAME, CONTEXT_CHANNEL_NAME, useChatStore } from '../../chat'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useProvidersStore } from '../../providers'
import { useModsServerChannelStore } from './channel-server'

export const useContextBridgeStore = defineStore('mods:api:context-bridge', () => {
  const mutex = new Mutex()

  const chatStore = useChatStore()
  const serverChannelStore = useModsServerChannelStore()
  const consciousnessStore = useConsciousnessStore()
  const providersStore = useProvidersStore()
  const { activeProvider, activeModel, effectiveModel } = storeToRefs(consciousnessStore)

  const { post: broadcastContext, data: incomingContext } = useBroadcastChannel<ContextMessage, ContextMessage>({ name: CONTEXT_CHANNEL_NAME })
  const { post: broadcastStreamEvent, data: incomingStreamEvent } = useBroadcastChannel<ChatStreamEvent, ChatStreamEvent>({ name: CHAT_STREAM_CHANNEL_NAME })

  const disposeHookFns = ref<Array<() => void>>([])
  let remoteStreamGuard: { sessionId: string, generation: number } | null = null

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

      // Handle input:text events from plugins (e.g., YouTube Live Chat)
      disposeHookFns.value.push(serverChannelStore.onEvent('input:text', async (event) => {
        const text = event.data?.text
        if (!text || typeof text !== 'string')
          return

        // eslint-disable-next-line no-console
        console.log('[context-bridge] Received input:text:', { source: event.source, text })

        // Check if we have a valid provider and model configured
        if (!activeProvider.value || !effectiveModel.value) {
          console.warn('[context-bridge] Received input:text but no provider/model configured')
          return
        }

        let chatProvider: ChatProvider
        try {
          chatProvider = await providersStore.getProviderInstance<ChatProvider>(activeProvider.value)
        }
        catch (err) {
          console.warn('[context-bridge] Failed to create chat provider instance for:', activeProvider.value, err)
          return
        }

        // eslint-disable-next-line no-console
        console.log('[context-bridge] Processing input:text from plugin:', text)

        // Send the message to chat
        chatStore.send(text, {
          model: effectiveModel.value,
          chatProvider,
        }).catch((err) => {
          console.warn('[context-bridge] chatStore.send failed:', err)
          noop(err)
        })
      }))

      disposeHookFns.value.push(
        chatStore.onBeforeMessageComposed(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'before-compose', message, sessionId: chatStore.activeSessionId, context })
        }),
        chatStore.onAfterMessageComposed(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'after-compose', message, sessionId: chatStore.activeSessionId, context })
        }),
        chatStore.onBeforeSend(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'before-send', message, sessionId: chatStore.activeSessionId, context })
        }),
        chatStore.onAfterSend(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'after-send', message, sessionId: chatStore.activeSessionId, context })
        }),
        chatStore.onTokenLiteral(async (literal, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'token-literal', literal, sessionId: chatStore.activeSessionId, context })
        }),
        chatStore.onTokenSpecial(async (special, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'token-special', special, sessionId: chatStore.activeSessionId, context })
        }),
        chatStore.onStreamEnd(async (context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'stream-end', sessionId: chatStore.activeSessionId, context })
        }),
        chatStore.onAssistantResponseEnd(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'assistant-end', message, sessionId: chatStore.activeSessionId, context })
        }),

        chatStore.onAssistantMessage(async (message, _messageText, context) => {
          serverChannelStore.send({
            type: 'output:gen-ai:chat:message',
            data: {
              message,
              'stage-web': isStageWeb(),
              'stage-tamagotchi': isStageTamagotchi(),
              'gen-ai:chat': {
                input: context.input as UserMessage,
                composedMessage: context.composedMessage,
                contexts: context.contexts,
              },
            },
          })
        }),

        chatStore.onChatTurnComplete(async (chat, context) => {
          serverChannelStore.send({
            type: 'output:gen-ai:chat:complete',
            data: {
              'message': chat.output,
              'toolCalls': [],
              'stage-web': isStageWeb(),
              'stage-tamagotchi': isStageTamagotchi(),
              // TODO: Properly calculate usage data
              'usage': {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0,
                source: 'estimate-based',
              },
              'gen-ai:chat': {
                input: context.input as UserMessage,
                composedMessage: context.composedMessage,
                contexts: context.contexts,
              },
            },
          })
        }),
      )

      const { stop: stopIncomingStreamWatch } = watch(incomingStreamEvent, async (event) => {
        if (!event)
          return

        isProcessingRemoteStream = true

        try {
          // Use the receiver's active session to avoid clobbering chat state when events come from other windows/devtools.
          switch (event.type) {
            case 'before-compose':
              await chatStore.emitBeforeMessageComposedHooks(event.message, event.context)
              break
            case 'after-compose':
              await chatStore.emitAfterMessageComposedHooks(event.message, event.context)
              break
            case 'before-send':
              await chatStore.emitBeforeSendHooks(event.message, event.context)
              remoteStreamGuard = {
                sessionId: chatStore.activeSessionId,
                generation: chatStore.getSessionGenerationValue(),
              }
              chatStore.sending = true
              chatStore.beginRemoteStream()
              break
            case 'after-send':
              await chatStore.emitAfterSendHooks(event.message, event.context)
              break
            case 'token-literal':
              if (!remoteStreamGuard)
                return
              if (remoteStreamGuard.sessionId !== chatStore.activeSessionId)
                return
              if (chatStore.getSessionGenerationValue(remoteStreamGuard.sessionId) !== remoteStreamGuard.generation)
                return
              chatStore.appendRemoteLiteral(event.literal)
              await chatStore.emitTokenLiteralHooks(event.literal, event.context)
              break
            case 'token-special':
              await chatStore.emitTokenSpecialHooks(event.special, event.context)
              break
            case 'stream-end':
              if (!remoteStreamGuard)
                break
              if (remoteStreamGuard.sessionId !== chatStore.activeSessionId)
                break
              if (chatStore.getSessionGenerationValue(remoteStreamGuard.sessionId) !== remoteStreamGuard.generation)
                break
              await chatStore.emitStreamEndHooks(event.context)
              chatStore.finalizeRemoteStream()
              chatStore.sending = false
              remoteStreamGuard = null
              break
            case 'assistant-end':
              if (!remoteStreamGuard)
                break
              if (remoteStreamGuard.sessionId !== chatStore.activeSessionId)
                break
              if (chatStore.getSessionGenerationValue(remoteStreamGuard.sessionId) !== remoteStreamGuard.generation)
                break
              await chatStore.emitAssistantResponseEndHooks(event.message, event.context)
              chatStore.finalizeRemoteStream(event.message)
              chatStore.sending = false
              remoteStreamGuard = null
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
