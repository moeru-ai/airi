import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { UserMessage } from '@xsai/shared-chat'

import type { ChatStreamEvent, ChatStreamEventContext, ContextMessage } from '../../../types/chat'

import { isStageTamagotchi, isStageWeb } from '@proj-airi/stage-shared'
import { useBroadcastChannel } from '@vueuse/core'
import { Mutex } from 'es-toolkit'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { ref, toRaw, watch } from 'vue'

import { getEventSourceKey } from '../../../utils/event-source'
import { useChatOrchestratorStore } from '../../chat'
import { CHAT_STREAM_CHANNEL_NAME, CONTEXT_CHANNEL_NAME } from '../../chat/constants'
import { useChatContextStore } from '../../chat/context-store'
import { useChatSessionStore } from '../../chat/session-store'
import { useChatStreamStore } from '../../chat/stream-store'
import { useContextObservabilityStore } from '../../devtools/context-observability'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useProvidersStore } from '../../providers'
import { useModsServerChannelStore } from './channel-server'

export function normalizeContextSnapshot<C extends Pick<ChatStreamEventContext, 'contexts'>>(contexts: C): C {
  return {
    ...contexts,
    contexts: Object.fromEntries(
      Object
        .entries(toRaw(contexts.contexts))
        .map(([key, ctx]) => [
          key,
          ctx.map(c => toRaw(c)),
        ]),
    ),
  }
}

export const useContextBridgeStore = defineStore('mods:api:context-bridge', () => {
  const consumerRegistrationEvents = [
    'input:text',
    'input:text:voice',
    'input:voice',
  ] as const
  const mutex = new Mutex()

  const chatOrchestrator = useChatOrchestratorStore()
  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatContext = useChatContextStore()
  const serverChannelStore = useModsServerChannelStore()
  const contextObservability = useContextObservabilityStore()
  const consciousnessStore = useConsciousnessStore()
  const providersStore = useProvidersStore()
  const { activeProvider, activeModel } = storeToRefs(consciousnessStore)

  const { post: broadcastContext, data: incomingContext } = useBroadcastChannel<ContextMessage, ContextMessage>({ name: CONTEXT_CHANNEL_NAME })
  const { post: broadcastStreamEvent, data: incomingStreamEvent } = useBroadcastChannel<ChatStreamEvent, ChatStreamEvent>({ name: CHAT_STREAM_CHANNEL_NAME })

  const disposeHookFns = ref<Array<() => void>>([])
  let remoteStreamGuard: { sessionId: string, generation: number } | null = null

  async function initialize() {
    await mutex.acquire()

    try {
      await serverChannelStore.ensureConnected()

      for (const consumerEvent of consumerRegistrationEvents) {
        serverChannelStore.send({
          type: 'module:consumer:register',
          data: {
            event: consumerEvent,
            mode: 'consumer-group',
            group: 'chat-ingestion',
          },
        })
      }

      let isProcessingRemoteStream = false

      const { stop } = watch(incomingContext, (event) => {
        if (!event)
          return

        contextObservability.recordLifecycle({
          phase: 'broadcast-received',
          channel: 'broadcast',
          sourceKey: getEventSourceKey(event),
          strategy: event.strategy,
          lane: event.lane,
          contextId: event.contextId,
          eventId: event.id,
          textPreview: event.text,
          sourceLabel: event.metadata?.source?.plugin?.id ?? event.metadata?.source?.id,
          details: event,
        })
        const result = chatContext.ingestContextMessage(event)
        if (result) {
          contextObservability.recordLifecycle({
            phase: 'store-ingested',
            channel: 'broadcast',
            sourceKey: result.sourceKey,
            strategy: event.strategy,
            lane: event.lane,
            contextId: event.contextId,
            eventId: event.id,
            mutation: result.mutation,
            textPreview: event.text,
            sourceLabel: event.metadata?.source?.plugin?.id ?? event.metadata?.source?.id,
            details: {
              entryCount: result.entryCount,
              event,
            },
          })
        }
      })
      disposeHookFns.value.push(stop)

      disposeHookFns.value.push(serverChannelStore.onContextUpdate((event) => {
        contextObservability.recordLifecycle({
          phase: 'server-received',
          channel: 'server',
          sourceKey: getEventSourceKey(event),
          strategy: event.data.strategy,
          lane: event.data.lane,
          contextId: event.data.contextId,
          eventId: event.data.id,
          textPreview: event.data.text,
          sourceLabel: event.metadata?.source?.plugin?.id ?? event.metadata?.source?.id ?? event.source,
          details: event,
        })
        const contextMessage: ContextMessage = {
          ...event.data,
          metadata: event.metadata,
          createdAt: Date.now(),
        }
        const result = chatContext.ingestContextMessage(contextMessage)
        if (result) {
          contextObservability.recordLifecycle({
            phase: 'store-ingested',
            channel: 'server',
            sourceKey: result.sourceKey,
            strategy: contextMessage.strategy,
            lane: contextMessage.lane,
            contextId: contextMessage.contextId,
            eventId: contextMessage.id,
            mutation: result.mutation,
            textPreview: contextMessage.text,
            sourceLabel: event.metadata?.source?.plugin?.id ?? event.metadata?.source?.id ?? event.source,
            details: {
              entryCount: result.entryCount,
              event,
            },
          })
        }
        broadcastContext(toRaw(contextMessage))
        contextObservability.recordLifecycle({
          phase: 'broadcast-posted',
          channel: 'broadcast',
          sourceKey: getEventSourceKey(contextMessage),
          strategy: contextMessage.strategy,
          lane: contextMessage.lane,
          contextId: contextMessage.contextId,
          eventId: contextMessage.id,
          textPreview: contextMessage.text,
          sourceLabel: event.metadata?.source?.plugin?.id ?? event.metadata?.source?.id ?? event.source,
          details: contextMessage,
        })
      }))

      disposeHookFns.value.push(serverChannelStore.onEvent('input:text', async (event) => {
        const {
          text,
          textRaw,
          overrides,
          contextUpdates,
        } = event.data

        const normalizedContextUpdates = contextUpdates?.map((update) => {
          const id = update.id ?? nanoid()
          const contextId = update.contextId ?? id
          return {
            ...update,
            id,
            contextId,
          }
        })

        if (normalizedContextUpdates?.length) {
          const createdAt = Date.now()
          for (const update of normalizedContextUpdates) {
            contextObservability.recordLifecycle({
              phase: 'input-context-update',
              channel: 'input',
              strategy: update.strategy,
              lane: update.lane,
              contextId: update.contextId,
              eventId: update.id,
              textPreview: update.text,
              sourceLabel: event.metadata?.source?.plugin?.id ?? event.metadata?.source?.id ?? event.source,
              details: {
                inputType: event.type,
                update,
              },
            })
            const contextMessage = {
              ...update,
              metadata: event.metadata,
              createdAt,
            }
            const result = chatContext.ingestContextMessage(contextMessage)
            if (result) {
              contextObservability.recordLifecycle({
                phase: 'store-ingested',
                channel: 'input',
                sourceKey: result.sourceKey,
                strategy: contextMessage.strategy,
                lane: contextMessage.lane,
                contextId: contextMessage.contextId,
                eventId: contextMessage.id,
                mutation: result.mutation,
                textPreview: contextMessage.text,
                sourceLabel: event.metadata?.source?.plugin?.id ?? event.metadata?.source?.id ?? event.source,
                details: {
                  entryCount: result.entryCount,
                  inputType: event.type,
                  update: contextMessage,
                },
              })
            }
          }
        }

        if (activeProvider.value && activeModel.value) {
          let chatProvider: ChatProvider
          try {
            chatProvider = await providersStore.getProviderInstance<ChatProvider>(activeProvider.value)
          }
          catch (err) {
            console.error('[context-bridge] getProviderInstance failed for provider:', activeProvider.value, err)
            return
          }

          let messageText = text
          const targetSessionId = overrides?.sessionId

          if (overrides?.messagePrefix) {
            messageText = `${overrides.messagePrefix}${text}`
          }

          // TODO(@nekomeowww): This only guard for input:text events handling and doesn't cover the entire ingestion
          // process. Another critical path of spark:notify is affected too, I think for better future development
          // experience, we should discover and find either a leader election or distributed lock solution to
          // coordinate the modules that handles context bridge ingestion across multiple windows/tabs.
          //
          // Background behind this, as server-sdk is in fact integrated in every Stage Web window/tab, each
          // window/tab has its own connection & chat orchestrator instance, when multiple windows/tabs are open,
          // each of them will receive the same input:text event and process ingestion independently, causing
          // duplicated messages handling and output:* events emission.
          //
          // We don't have ability to control how many windows/tabs the user will open (sometimes) user will forget
          // to close the extra windows/tabs, so we need a way to coordinate the ingestion processing to
          // ensure only one window/tab is handling the ingestion at a time.
          //
          // SharedWorker solution was considered but it's completely disabled in Chromium based Android browsers
          // (which is a big portion of mobile Stage Web users as stage-ui serves as the unified / universal
          // api wrapper for most of the shared logic across Web, Pocket, and Tamagotchi).
          //
          // Read more here:
          // - https://chromestatus.com/feature/6265472244514816
          // - https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker
          // - https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
          navigator.locks.request('context-bridge:event:input:text', async () => {
            try {
              await chatOrchestrator.ingest(messageText, {
                model: activeModel.value,
                chatProvider,
                input: {
                  type: 'input:text',
                  data: {
                    ...event.data,
                    text,
                    textRaw,
                    overrides,
                    contextUpdates: normalizedContextUpdates,
                  },
                },
              }, targetSessionId)
            }
            catch (err) {
              console.error('Error ingesting text input via context bridge:', err)
            }
          })
        }
      }))

      disposeHookFns.value.push(
        chatOrchestrator.onBeforeMessageComposed(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'before-compose', message, sessionId: chatSession.activeSessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onAfterMessageComposed(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'after-compose', message, sessionId: chatSession.activeSessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onBeforeSend(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'before-send', message, sessionId: chatSession.activeSessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onAfterSend(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'after-send', message, sessionId: chatSession.activeSessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onTokenLiteral(async (literal, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'token-literal', literal, sessionId: chatSession.activeSessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onTokenSpecial(async (special, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'token-special', special, sessionId: chatSession.activeSessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onStreamEnd(async (context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'stream-end', sessionId: chatSession.activeSessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onAssistantResponseEnd(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          broadcastStreamEvent({ type: 'assistant-end', message, sessionId: chatSession.activeSessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),

        chatOrchestrator.onAssistantMessage(async (message, _messageText, context) => {
          serverChannelStore.send({
            type: 'output:gen-ai:chat:message',
            data: {
              ...context.input?.data,
              message,
              'stage-web': isStageWeb(),
              'stage-tamagotchi': isStageTamagotchi(),
              'gen-ai:chat': {
                message: context.message as UserMessage,
                composedMessage: context.composedMessage,
                contexts: context.contexts as any,
                input: context.input,
              },
            },
          })
        }),

        chatOrchestrator.onChatTurnComplete(async (chat, context) => {
          serverChannelStore.send({
            type: 'output:gen-ai:chat:complete',
            data: {
              ...context.input?.data,
              'message': chat.output,
              // TODO: tool calls should be captured properly
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
                message: context.message as UserMessage,
                composedMessage: context.composedMessage,
                contexts: context.contexts as any,
                input: context.input,
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
              await chatOrchestrator.emitBeforeMessageComposedHooks(event.message, event.context)
              break
            case 'after-compose':
              await chatOrchestrator.emitAfterMessageComposedHooks(event.message, event.context)
              break
            case 'before-send':
              await chatOrchestrator.emitBeforeSendHooks(event.message, event.context)
              remoteStreamGuard = {
                sessionId: chatSession.activeSessionId,
                generation: chatSession.getSessionGenerationValue(),
              }
              chatOrchestrator.sending = true
              chatStream.beginStream()
              break
            case 'after-send':
              await chatOrchestrator.emitAfterSendHooks(event.message, event.context)
              break
            case 'token-literal':
              if (!remoteStreamGuard)
                return
              if (remoteStreamGuard.sessionId !== chatSession.activeSessionId)
                return
              if (chatSession.getSessionGenerationValue(remoteStreamGuard.sessionId) !== remoteStreamGuard.generation)
                return
              chatStream.appendStreamLiteral(event.literal)
              await chatOrchestrator.emitTokenLiteralHooks(event.literal, event.context)
              break
            case 'token-special':
              await chatOrchestrator.emitTokenSpecialHooks(event.special, event.context)
              break
            case 'stream-end':
              if (!remoteStreamGuard)
                break
              if (remoteStreamGuard.sessionId !== chatSession.activeSessionId)
                break
              if (chatSession.getSessionGenerationValue(remoteStreamGuard.sessionId) !== remoteStreamGuard.generation)
                break
              await chatOrchestrator.emitStreamEndHooks(event.context)
              // NOTICE: Remote stream events are mirrored across renderer windows for UI feedback only.
              // Persisting them here would append assistant messages into the receiver's local session
              // without the corresponding user message, corrupting IndexedDB history across windows.
              chatStream.resetStream()
              chatOrchestrator.sending = false
              remoteStreamGuard = null
              break
            case 'assistant-end':
              if (!remoteStreamGuard)
                break
              if (remoteStreamGuard.sessionId !== chatSession.activeSessionId)
                break
              if (chatSession.getSessionGenerationValue(remoteStreamGuard.sessionId) !== remoteStreamGuard.generation)
                break
              await chatOrchestrator.emitAssistantResponseEndHooks(event.message, event.context)
              // NOTICE: The originating renderer already persists the final assistant message.
              // Receiver windows must not write it again, or they can overwrite the same session
              // with assistant-only history when their local session state is stale.
              chatStream.resetStream()
              chatOrchestrator.sending = false
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
      for (const consumerEvent of consumerRegistrationEvents) {
        serverChannelStore.send({
          type: 'module:consumer:unregister',
          data: {
            event: consumerEvent,
            mode: 'consumer-group',
            group: 'chat-ingestion',
          },
        })
      }

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
