import type { LlmStreamingControlCallManifest } from '@proj-airi/pipelines-audio'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { UserMessage } from '@xsai/shared-chat'

import type { ChatStreamEventContext, ContextMessage } from '../../../types/chat'
import type { SparkNotifyPerformanceResult, SparkNotifyReactionOptions } from './spark-notify-reaction'

import { errorMessageFrom } from '@moeru/std'
import { isStageTamagotchi, isStageWeb } from '@proj-airi/stage-shared'
import { useBroadcastChannel } from '@vueuse/core'
import { Mutex } from 'es-toolkit'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, shallowRef, toRaw, watch } from 'vue'

import { getEventSourceKey, getMetadataSourceLabel } from '../../../utils/event-source'
import { useLlmStreamingControlStore } from '../../ai/chat-llm/streaming-control'
import { useCharacterOrchestratorStore } from '../../character'
import { useChatStore } from '../../chat'
import { useChatContextStore } from '../../chat/context-store'
import { useChatSessionStore } from '../../chat/session-store'
import { useChatStreamStore } from '../../chat/stream-store'
import { useContextObservabilityStore } from '../../devtools/context-observability'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useModsServerChannelStore } from './channel-server'
import { createContextChannel } from './context-channel'

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

  const chatOrchestrator = useChatStore()
  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const chatContext = useChatContextStore()
  const serverChannelStore = useModsServerChannelStore()
  const contextObservability = useContextObservabilityStore()
  const characterOrchestratorStore = useCharacterOrchestratorStore()
  const consciousnessStore = useConsciousnessStore()
  const { activeModel, activeProvider } = storeToRefs(consciousnessStore)
  const streamingControl = useLlmStreamingControlStore()

  type SparkNotifyBridgeMessage
    = | {
      fromInstanceId: string
      payload: SparkNotifyReactionOptions
      performance?: {
        callManifests: LlmStreamingControlCallManifest[]
        timeoutMs?: number
      }
      requestId: string
      type: 'request'
    }
    | {
      performance?: SparkNotifyPerformanceResult
      reaction: string
      requestId: string
      toInstanceId: string
      type: 'response'
    }
  const SPARK_NOTIFY_BRIDGE_CHANNEL_NAME = 'airi-spark-notify-bridge'
  const sparkNotifyBridgeInstanceId = `spark-notify-${nanoid()}`
  const sparkNotifyHostRole = ref<'client' | 'main'>('client')
  const sparkNotifyBridgeWaiters = new Map<string, {
    resolve: (result: { performance?: SparkNotifyPerformanceResult, reaction: string }) => Promise<void> | void
    timeout?: ReturnType<typeof setTimeout>
  }>()
  const { data: incomingSparkNotifyBridgeMessage, post: postSparkNotifyBridgeMessage } = useBroadcastChannel<SparkNotifyBridgeMessage, SparkNotifyBridgeMessage>({ name: SPARK_NOTIFY_BRIDGE_CHANNEL_NAME })

  const disposeHookFns = ref<Array<() => void>>([])
  // Remote stream data belongs to this renderer only. Keeping its visibility
  // outside the synchronized chat store prevents a follower from publishing
  // its local runtime state over the elected authority's snapshot.
  const remoteStreamGuard = shallowRef<{
    completed: boolean
    generation: number
    pendingLiterals: string[]
    refreshing: boolean
    sessionId: string
    started: boolean
    turnId: string
  }>()
  const isReceivingRemoteStream = computed(() => remoteStreamGuard.value?.sessionId === chatSession.activeSessionId)
  let contextChannel: ReturnType<typeof createContextChannel> | undefined
  let initialized = false

  function presentRemoteStreamIfActive() {
    const guard = remoteStreamGuard.value
    if (!guard || guard.sessionId !== chatSession.activeSessionId)
      return false
    if (chatSession.getSessionGenerationValue(guard.sessionId) !== guard.generation)
      return false

    if (!guard.started) {
      guard.started = true
      chatStream.beginStream(guard.turnId)
    }
    for (const literal of guard.pendingLiterals.splice(0))
      chatStream.appendStreamLiteral(literal)
    if (guard.completed && !guard.refreshing)
      void refreshCompletedRemoteStream(guard)
    return true
  }

  async function refreshCompletedRemoteStream(guard: NonNullable<typeof remoteStreamGuard.value>) {
    guard.refreshing = true
    let loaded = false
    try {
      loaded = await chatSession.refreshSession(guard.sessionId)
    }
    catch (error) {
      console.warn('[context-bridge] Failed to refresh completed remote stream:', errorMessageFrom(error))
    }
    if (remoteStreamGuard.value !== guard)
      return
    guard.refreshing = false
    if (!loaded || guard.sessionId !== chatSession.activeSessionId)
      return
    if (chatSession.getSessionGenerationValue(guard.sessionId) !== guard.generation)
      return

    chatStream.resetStream()
    remoteStreamGuard.value = undefined
  }

  function recordContextIngestRejected(options: {
    channel: 'broadcast' | 'input' | 'server'
    contextMessage: ContextMessage
    details?: unknown
    error: unknown
    sourceLabel?: string
  }) {
    contextObservability.recordLifecycle({
      channel: options.channel,
      contextId: options.contextMessage.contextId,
      details: {
        errorMessage: errorMessageFrom(options.error) ?? 'Unknown context ingest error',
        event: options.details,
      },
      eventId: options.contextMessage.id,
      lane: options.contextMessage.lane,
      phase: 'store-ingest-rejected',
      sourceKey: getEventSourceKey(options.contextMessage),
      sourceLabel: options.sourceLabel,
      strategy: options.contextMessage.strategy,
      textPreview: options.contextMessage.text,
    })
  }

  function ingestContextMessageSafely(options: {
    channel: 'broadcast' | 'input' | 'server'
    contextMessage: ContextMessage
    details?: unknown
    sourceLabel?: string
  }) {
    try {
      return {
        ok: true as const,
        result: chatContext.ingestContextMessage(options.contextMessage),
      }
    }
    catch (error) {
      recordContextIngestRejected({
        ...options,
        error,
      })
      return {
        ok: false as const,
      }
    }
  }

  function withStreamingCallPrompt(options: SparkNotifyReactionOptions, callPrompt: string): SparkNotifyReactionOptions {
    if (!callPrompt) {
      return options
    }

    return {
      ...options,
      messageOverride: {
        ...options.messageOverride,
        appendSystemInstructions: [
          ...(options.messageOverride?.appendSystemInstructions ?? []),
          callPrompt,
        ],
      },
    }
  }

  async function handleSparkNotifyReactionLocal(options: SparkNotifyReactionOptions, identity?: { eventId?: string, id?: string }) {
    const event: WebSocketEventOf<'spark:notify'> = {
      data: {
        destinations: options.destinations?.length ? options.destinations : ['character'],
        eventId: identity?.eventId ?? nanoid(),
        headline: options.headline,
        id: identity?.id ?? nanoid(),
        kind: options.kind ?? 'ping',
        lane: options.lane,
        metadata: options.metadata,
        note: options.note,
        payload: options.payload,
        requiresAck: options.requiresAck,
        ttlMs: options.ttlMs,
        urgency: options.urgency ?? 'immediate',
      },
      source: options.source ?? 'plugin-module-host',
      type: 'spark:notify',
    }

    try {
      return await characterOrchestratorStore.handleSparkNotifyWithReaction(event, {
        fallbackText: options.fallbackResponseText,
        forceResponse: options.forceResponse,
        forceSparkCommandResponse: options.forceSparkCommandResponse,
        forceTextResponse: options.forceTextResponse,
        messageOverride: options.messageOverride,
      })
    }
    catch (error) {
      console.warn('[context-bridge] spark:notify handling failed; using fallback', error)
      return options.fallbackResponseText
    }
  }

  function setSparkNotifyHostRole(role: 'client' | 'main') {
    sparkNotifyHostRole.value = role
  }

  async function dispatchSparkNotifyReaction(options: SparkNotifyReactionOptions) {
    if (sparkNotifyHostRole.value === 'main') {
      return await handleSparkNotifyReactionLocal(options)
    }

    const requestId = nanoid()
    return await new Promise<string>((resolve) => {
      const timeout = setTimeout(() => {
        sparkNotifyBridgeWaiters.delete(requestId)
        resolve(options.fallbackResponseText)
      }, 5000)

      sparkNotifyBridgeWaiters.set(requestId, {
        resolve: ({ reaction }) => {
          clearTimeout(timeout)
          resolve(reaction || options.fallbackResponseText)
        },
        timeout,
      })

      postSparkNotifyBridgeMessage({
        fromInstanceId: sparkNotifyBridgeInstanceId,
        payload: options,
        requestId,
        type: 'request',
      })
    })
  }

  async function handleSparkNotifyPerformanceLocal(options: SparkNotifyReactionOptions): Promise<SparkNotifyPerformanceResult> {
    const calls = options.calls ?? []

    if (calls.length === 0) {
      const reaction = await handleSparkNotifyReactionLocal(options)
      return {
        reaction,
        type: 'completed',
      }
    }

    const sparkNotifyId = nanoid()
    const turn = streamingControl.beginTurn({ turnId: `spark:${sparkNotifyId}` })

    let latestReaction = ''
    let reactionPromise: Promise<string> | undefined
    let dispose: (() => void) | undefined

    const calledPromise = new Promise<SparkNotifyPerformanceResult>((resolve) => {
      const disposers = calls.map(call => turn.on(call.manifest, async (payload) => {
        await call.handler(payload)
        const reaction = await (reactionPromise ?? Promise.resolve(latestReaction || options.fallbackResponseText))
        resolve({
          name: call.manifest.name,
          payload,
          reaction,
          type: 'called',
        })
      }))
      dispose = () => {
        for (const item of disposers) {
          item()
        }
      }
    })

    reactionPromise = handleSparkNotifyReactionLocal(withStreamingCallPrompt(
      options,
      turn.renderManifestPrompt(),
    ), { id: sparkNotifyId })
      .then((reaction) => {
        latestReaction = reaction
        return reaction
      })
      .catch(() => {
        latestReaction = options.fallbackResponseText
        return options.fallbackResponseText
      })

    const turnDonePromise = turn.done.then(async (result): Promise<SparkNotifyPerformanceResult> => {
      const reaction = await (reactionPromise ?? Promise.resolve(latestReaction || options.fallbackResponseText))
      return {
        reaction: reaction || options.fallbackResponseText,
        type: result.type === 'cancelled' ? 'cancelled' : 'completed',
      }
    })

    const result = await Promise.race([calledPromise, turnDonePromise])
    dispose?.()
    return result
  }

  async function dispatchSparkNotifyPerformance(options: SparkNotifyReactionOptions): Promise<SparkNotifyPerformanceResult> {
    const calls = options.calls ?? []

    if (sparkNotifyHostRole.value === 'main') {
      return await handleSparkNotifyPerformanceLocal(options)
    }

    if (calls.length === 0) {
      const reaction = await dispatchSparkNotifyReaction(options)
      return {
        reaction,
        type: 'completed',
      }
    }

    const requestId = nanoid()
    return await new Promise<SparkNotifyPerformanceResult>((resolve) => {
      const timeout = setTimeout(() => {
        sparkNotifyBridgeWaiters.delete(requestId)
        resolve(createFallbackPerformanceResult(options, 'timeout'))
      }, Math.max(1, options.timeoutMs ?? 5000))

      sparkNotifyBridgeWaiters.set(requestId, {
        resolve: async ({ performance, reaction }) => {
          clearTimeout(timeout)
          if (performance?.type === 'called' && performance.name) {
            await findPerformanceCall(options, performance.name)?.handler(performance.payload)
          }

          resolve(performance ?? createFallbackPerformanceResult(options, 'completed', reaction))
        },
        timeout,
      })

      const { calls: _calls, timeoutMs: _timeoutMs, ...payload } = options
      postSparkNotifyBridgeMessage({
        fromInstanceId: sparkNotifyBridgeInstanceId,
        payload,
        performance: {
          callManifests: calls.map(call => call.manifest),
          timeoutMs: options.timeoutMs,
        },
        requestId,
        type: 'request',
      })
    })
  }

  function createFallbackPerformanceResult(
    options: SparkNotifyReactionOptions,
    type: Extract<SparkNotifyPerformanceResult['type'], 'completed' | 'timeout'>,
    reaction?: string,
  ): SparkNotifyPerformanceResult {
    return {
      reaction: reaction || options.fallbackResponseText,
      type,
    }
  }

  function findPerformanceCall(options: SparkNotifyReactionOptions, name: string) {
    return options.calls?.find(call => call.manifest.name === name)
  }

  function withContextBridgeLock<T>(key: string, callback: () => Promise<T>) {
    if (typeof navigator !== 'undefined' && 'locks' in navigator && typeof navigator.locks.request === 'function') {
      return navigator.locks.request(key, callback)
    }
    return callback()
  }

  async function withContextBridgeExclusiveLock<T>(key: string, callback: () => Promise<T>) {
    if (typeof navigator !== 'undefined' && 'locks' in navigator && typeof navigator.locks.request === 'function') {
      // BroadcastChannel delivers the same bridge request to every Stage window.
      // `ifAvailable` makes non-owning windows skip instead of queueing and replaying
      // the same spark reaction after the first window finishes.
      return await navigator.locks.request(key, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          return undefined
        }
        return await callback()
      })
    }

    return await callback()
  }

  async function initialize() {
    await mutex.acquire()

    try {
      if (initialized)
        return

      contextChannel = createContextChannel()

      const registerConsumers = () => {
        for (const consumerEvent of consumerRegistrationEvents) {
          serverChannelStore.send({
            data: {
              event: consumerEvent,
              group: 'chat-ingestion',
              mode: 'consumer-group',
            },
            type: 'module:consumer:register',
          })
        }
      }

      await serverChannelStore.ensureConnected()

      registerConsumers()
      disposeHookFns.value.push(serverChannelStore.onReconnected(() => registerConsumers()))

      let isProcessingRemoteStream = false

      const stopContextUpdates = contextChannel.onContext((event) => {
        contextObservability.recordLifecycle({
          channel: 'broadcast',
          contextId: event.contextId,
          details: event,
          eventId: event.id,
          lane: event.lane,
          phase: 'broadcast-received',
          sourceKey: getEventSourceKey(event),
          sourceLabel: getMetadataSourceLabel(event.metadata?.source),
          strategy: event.strategy,
          textPreview: event.text,
        })
        const ingestAttempt = ingestContextMessageSafely({
          channel: 'broadcast',
          contextMessage: event,
          details: event,
          sourceLabel: getMetadataSourceLabel(event.metadata?.source),
        })
        if (ingestAttempt.ok && ingestAttempt.result) {
          contextObservability.recordLifecycle({
            channel: 'broadcast',
            contextId: event.contextId,
            details: {
              entryCount: ingestAttempt.result.entryCount,
              event,
            },
            eventId: event.id,
            lane: event.lane,
            mutation: ingestAttempt.result.mutation,
            phase: 'store-ingested',
            sourceKey: ingestAttempt.result.sourceKey,
            sourceLabel: getMetadataSourceLabel(event.metadata?.source),
            strategy: event.strategy,
            textPreview: event.text,
          })
        }
      })
      disposeHookFns.value.push(stopContextUpdates)

      const { stop: stopSparkNotifyBridgeWatch } = watch(incomingSparkNotifyBridgeMessage, async (event) => {
        if (!event) {
          return
        }

        if (event.type === 'request') {
          if (sparkNotifyHostRole.value !== 'main' || event.fromInstanceId === sparkNotifyBridgeInstanceId) {
            return
          }

          await withContextBridgeExclusiveLock(`context-bridge:spark-notify:${event.requestId}`, async () => {
            const performance = event.performance?.callManifests.length
              ? await handleSparkNotifyPerformanceLocal({
                  ...event.payload,
                  calls: event.performance.callManifests.map(manifest => ({
                    handler: async () => undefined,
                    manifest,
                  })),
                  timeoutMs: event.performance.timeoutMs,
                })
              : undefined
            const reaction = performance?.reaction ?? await handleSparkNotifyReactionLocal(event.payload)
            postSparkNotifyBridgeMessage({
              reaction,
              requestId: event.requestId,
              toInstanceId: event.fromInstanceId,
              type: 'response',
              ...(performance ? { performance } : {}),
            })
          })
          return
        }

        if (event.type === 'response') {
          if (event.toInstanceId !== sparkNotifyBridgeInstanceId) {
            return
          }

          const waiter = sparkNotifyBridgeWaiters.get(event.requestId)
          if (!waiter) {
            return
          }

          sparkNotifyBridgeWaiters.delete(event.requestId)
          await waiter.resolve({
            performance: event.performance,
            reaction: event.reaction,
          })
        }
      })
      disposeHookFns.value.push(stopSparkNotifyBridgeWatch)

      disposeHookFns.value.push(serverChannelStore.onContextUpdate((event) => {
        contextObservability.recordLifecycle({
          channel: 'server',
          contextId: event.data.contextId,
          details: event,
          eventId: event.data.id,
          lane: event.data.lane,
          phase: 'server-received',
          sourceKey: getEventSourceKey(event),
          sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
          strategy: event.data.strategy,
          textPreview: event.data.text,
        })
        const contextMessage: ContextMessage = {
          ...event.data,
          createdAt: Date.now(),
          metadata: event.metadata,
        }
        const ingestAttempt = ingestContextMessageSafely({
          channel: 'server',
          contextMessage,
          details: event,
          sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
        })
        if (!ingestAttempt.ok)
          return

        if (ingestAttempt.result) {
          contextObservability.recordLifecycle({
            channel: 'server',
            contextId: contextMessage.contextId,
            details: {
              entryCount: ingestAttempt.result.entryCount,
              event,
            },
            eventId: contextMessage.id,
            lane: contextMessage.lane,
            mutation: ingestAttempt.result.mutation,
            phase: 'store-ingested',
            sourceKey: ingestAttempt.result.sourceKey,
            sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
            strategy: contextMessage.strategy,
            textPreview: contextMessage.text,
          })
        }
        void contextChannel?.emitContext(toRaw(contextMessage))
        contextObservability.recordLifecycle({
          channel: 'broadcast',
          contextId: contextMessage.contextId,
          details: contextMessage,
          eventId: contextMessage.id,
          lane: contextMessage.lane,
          phase: 'broadcast-posted',
          sourceKey: getEventSourceKey(contextMessage),
          sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
          strategy: contextMessage.strategy,
          textPreview: contextMessage.text,
        })
      }))

      disposeHookFns.value.push(serverChannelStore.onEvent('input:text', async (event) => {
        const {
          contextUpdates,
          overrides,
          text,
          textRaw,
        } = event.data

        const normalizedContextUpdates = contextUpdates?.map((update) => {
          const id = update.id ?? nanoid()
          const contextId = update.contextId ?? id
          return {
            ...update,
            contextId,
            id,
          }
        })
        const acceptedContextUpdates: typeof normalizedContextUpdates = normalizedContextUpdates ? [] : undefined

        if (normalizedContextUpdates?.length) {
          const createdAt = Date.now()
          for (const update of normalizedContextUpdates) {
            contextObservability.recordLifecycle({
              channel: 'input',
              contextId: update.contextId,
              details: {
                inputType: event.type,
                update,
              },
              eventId: update.id,
              lane: update.lane,
              phase: 'input-context-update',
              sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
              strategy: update.strategy,
              textPreview: update.text,
            })
            const contextMessage: ContextMessage = {
              ...update,
              createdAt,
              metadata: event.metadata,
            }
            const ingestAttempt = ingestContextMessageSafely({
              channel: 'input',
              contextMessage,
              details: {
                inputType: event.type,
                update: contextMessage,
              },
              sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
            })
            if (!ingestAttempt.ok)
              continue

            acceptedContextUpdates?.push(update)

            if (ingestAttempt.result) {
              contextObservability.recordLifecycle({
                channel: 'input',
                contextId: contextMessage.contextId,
                details: {
                  entryCount: ingestAttempt.result.entryCount,
                  inputType: event.type,
                  update: contextMessage,
                },
                eventId: contextMessage.id,
                lane: contextMessage.lane,
                mutation: ingestAttempt.result.mutation,
                phase: 'store-ingested',
                sourceKey: ingestAttempt.result.sourceKey,
                sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
                strategy: contextMessage.strategy,
                textPreview: contextMessage.text,
              })
            }
          }
        }

        if (activeProvider.value && activeModel.value) {
          let chatProvider: ChatProvider
          try {
            chatProvider = await consciousnessStore.getChatProviderInstance(activeProvider.value)
          }
          catch (err) {
            console.error('[context-bridge] getChatProviderInstance failed for provider:', activeProvider.value, err)
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
          await withContextBridgeLock('context-bridge:event:input:text', async () => {
            try {
              await chatOrchestrator.ingest(messageText, {
                chatProvider,
                input: {
                  data: {
                    ...event.data,
                    contextUpdates: acceptedContextUpdates,
                    overrides,
                    text,
                    textRaw,
                  },
                  type: 'input:text',
                },
                model: activeModel.value,
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

          await contextChannel?.emitStream({ context: structuredClone(normalizeContextSnapshot(context)), message, sessionId: chatOrchestrator.activeSendSessionId ?? chatSession.activeSessionId, type: 'before-compose' })
        }),
        chatOrchestrator.onAfterMessageComposed(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          await contextChannel?.emitStream({ context: structuredClone(normalizeContextSnapshot(context)), message, sessionId: chatOrchestrator.activeSendSessionId ?? chatSession.activeSessionId, type: 'after-compose' })
        }),
        chatOrchestrator.onBeforeSend(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          await contextChannel?.emitStream({ context: structuredClone(normalizeContextSnapshot(context)), message, sessionId: chatOrchestrator.activeSendSessionId ?? chatSession.activeSessionId, type: 'before-send' })
        }),
        chatOrchestrator.onAfterSend(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          await contextChannel?.emitStream({ context: structuredClone(normalizeContextSnapshot(context)), message, sessionId: chatOrchestrator.activeSendSessionId ?? chatSession.activeSessionId, type: 'after-send' })
        }),
        chatOrchestrator.onTokenLiteral(async (literal, context) => {
          if (isProcessingRemoteStream)
            return

          await contextChannel?.emitStream({ context: structuredClone(normalizeContextSnapshot(context)), literal, sessionId: chatOrchestrator.activeSendSessionId ?? chatSession.activeSessionId, type: 'token-literal' })
        }),
        chatOrchestrator.onTokenSpecial(async (special, context) => {
          if (isProcessingRemoteStream)
            return

          await contextChannel?.emitStream({ context: structuredClone(normalizeContextSnapshot(context)), sessionId: chatOrchestrator.activeSendSessionId ?? chatSession.activeSessionId, special, type: 'token-special' })
        }),
        chatOrchestrator.onStreamEnd(async (context) => {
          if (isProcessingRemoteStream)
            return

          await contextChannel?.emitStream({ context: structuredClone(normalizeContextSnapshot(context)), sessionId: chatOrchestrator.activeSendSessionId ?? chatSession.activeSessionId, type: 'stream-end' })
        }),
        chatOrchestrator.onAssistantResponseEnd(async (message, context) => {
          if (isProcessingRemoteStream)
            return

          await contextChannel?.emitStream({ context: structuredClone(normalizeContextSnapshot(context)), message, sessionId: chatOrchestrator.activeSendSessionId ?? chatSession.activeSessionId, type: 'assistant-end' })
        }),

        chatOrchestrator.onAssistantMessage(async (message, _messageText, context) => {
          serverChannelStore.send({
            data: {
              ...context.input?.data,
              'gen-ai:chat': {
                composedMessage: context.composedMessage,
                contexts: context.contexts,
                input: context.input,
                message: context.message as UserMessage,
              },
              message,
              'stage-tamagotchi': isStageTamagotchi(),
              'stage-web': isStageWeb(),
            },
            type: 'output:gen-ai:chat:message',
          })
        }),

        chatOrchestrator.onChatTurnComplete(async (chat, context) => {
          serverChannelStore.send({
            data: {
              ...context.input?.data,
              'gen-ai:chat': {
                composedMessage: context.composedMessage,
                contexts: context.contexts,
                input: context.input,
                message: context.message as UserMessage,
              },
              'message': chat.output,
              'stage-tamagotchi': isStageTamagotchi(),
              'stage-web': isStageWeb(),
              // TODO: tool calls should be captured properly
              'toolCalls': [],
              // TODO: Properly calculate usage data
              'usage': {
                completionTokens: 0,
                promptTokens: 0,
                source: 'estimate-based',
                totalTokens: 0,
              },
            },
            type: 'output:gen-ai:chat:complete',
          })
        }),
      )

      const stopIncomingStreamWatch = contextChannel.onStream(async (event) => {
        isProcessingRemoteStream = true

        try {
          // Remote UI state is correlated by session and generation. The
          // receiver never persists these mirrored stream events.
          switch (event.type) {
            case 'after-compose':
              await chatOrchestrator.emitAfterMessageComposedHooks(event.message, event.context)
              break
            case 'after-send':
              await chatOrchestrator.emitAfterSendHooks(event.message, event.context)
              break
            case 'assistant-end':
              if (!remoteStreamGuard.value)
                break
              {
                const guard = remoteStreamGuard.value
                if (event.sessionId !== guard.sessionId)
                  break
                if (guard.sessionId !== chatSession.activeSessionId
                  && chatSession.getSessionGenerationValue(guard.sessionId) === guard.generation) {
                  guard.completed = true
                  break
                }
                try {
                  if (guard.sessionId === chatSession.activeSessionId
                    && chatSession.getSessionGenerationValue(guard.sessionId) === guard.generation) {
                    await chatOrchestrator.emitAssistantResponseEndHooks(event.message, event.context)
                  }
                }
                finally {
                  if (remoteStreamGuard.value === guard) {
                    if (guard.started
                      && guard.sessionId === chatSession.activeSessionId
                      && chatSession.getSessionGenerationValue(guard.sessionId) === guard.generation) {
                      chatStream.resetStream()
                    }
                    remoteStreamGuard.value = undefined
                  }
                }
              }
              break
            case 'before-compose':
              await chatOrchestrator.emitBeforeMessageComposedHooks(event.message, event.context)
              break
            case 'before-send':
              await chatOrchestrator.emitBeforeSendHooks(event.message, event.context)
              remoteStreamGuard.value = {
                completed: false,
                generation: chatSession.getSessionGenerationValue(event.sessionId),
                pendingLiterals: [],
                refreshing: false,
                sessionId: event.sessionId,
                started: false,
                turnId: event.context.turnId,
              }
              presentRemoteStreamIfActive()
              break
            case 'stream-end':
              if (!remoteStreamGuard.value)
                break
              {
                const guard = remoteStreamGuard.value
                if (event.sessionId !== guard.sessionId)
                  break
                if (guard.sessionId !== chatSession.activeSessionId
                  && chatSession.getSessionGenerationValue(guard.sessionId) === guard.generation) {
                  break
                }
                try {
                  if (guard.sessionId === chatSession.activeSessionId
                    && chatSession.getSessionGenerationValue(guard.sessionId) === guard.generation) {
                    await chatOrchestrator.emitStreamEndHooks(event.context)
                  }
                }
                finally {
                  if (remoteStreamGuard.value === guard) {
                    if (guard.started
                      && guard.sessionId === chatSession.activeSessionId
                      && chatSession.getSessionGenerationValue(guard.sessionId) === guard.generation) {
                      chatStream.resetStream()
                    }
                    remoteStreamGuard.value = undefined
                  }
                }
              }
              break
            case 'token-literal':
              if (!remoteStreamGuard.value)
                return
              if (event.sessionId !== remoteStreamGuard.value.sessionId)
                return
              if (chatSession.getSessionGenerationValue(remoteStreamGuard.value.sessionId) !== remoteStreamGuard.value.generation)
                return
              remoteStreamGuard.value.pendingLiterals.push(event.literal)
              if (!presentRemoteStreamIfActive())
                return
              await chatOrchestrator.emitTokenLiteralHooks(event.literal, event.context)
              break
            case 'token-special':
              if (!remoteStreamGuard.value || event.sessionId !== remoteStreamGuard.value.sessionId)
                return
              if (remoteStreamGuard.value.sessionId !== chatSession.activeSessionId)
                return
              if (chatSession.getSessionGenerationValue(remoteStreamGuard.value.sessionId) !== remoteStreamGuard.value.generation)
                return
              await chatOrchestrator.emitTokenSpecialHooks(event.special, event.context)
              break
          }
        }
        finally {
          isProcessingRemoteStream = false
        }
      })
      disposeHookFns.value.push(stopIncomingStreamWatch)
      disposeHookFns.value.push(watch(
        () => chatSession.activeSessionId,
        () => presentRemoteStreamIfActive(),
        { flush: 'sync' },
      ))
      initialized = true
    }
    catch (error) {
      for (const fn of disposeHookFns.value)
        fn()
      disposeHookFns.value = []
      contextChannel?.dispose(error)
      contextChannel = undefined
      throw error
    }
    finally {
      mutex.release()
    }
  }

  async function dispose() {
    await mutex.acquire()

    try {
      if (!initialized)
        return

      for (const consumerEvent of consumerRegistrationEvents) {
        serverChannelStore.send({
          data: {
            event: consumerEvent,
            group: 'chat-ingestion',
            mode: 'consumer-group',
          },
          type: 'module:consumer:unregister',
        })
      }

      for (const fn of disposeHookFns.value) {
        fn()
      }

      contextChannel?.dispose(new Error('Context bridge disposed'))
      contextChannel = undefined

      initialized = false
      remoteStreamGuard.value = undefined

      for (const [requestId, waiter] of sparkNotifyBridgeWaiters) {
        if (waiter.timeout)
          clearTimeout(waiter.timeout)
        sparkNotifyBridgeWaiters.delete(requestId)
      }
    }
    finally {
      mutex.release()
    }

    disposeHookFns.value = []
  }

  return {
    dispatchSparkNotifyPerformance,
    dispatchSparkNotifyReaction,
    dispose,
    initialize,
    isReceivingRemoteStream,
    setSparkNotifyHostRole,
  }
})
