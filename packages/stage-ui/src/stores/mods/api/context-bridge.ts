import type { LlmStreamingControlCallManifest } from '@proj-airi/pipelines-audio'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { UserMessage } from '@xsai/shared-chat'

import type { ChatStreamEventContext, ContextMessage } from '../../../types/chat'
import type { SparkNotifyPerformanceResult, SparkNotifyReactionOptions } from './spark-notify-reaction'

import { errorMessageFrom } from '@moeru/std'
import { isStageTamagotchi, isStageWeb } from '@proj-airi/stage-shared'
import { useBroadcastChannel } from '@vueuse/core'
import { Mutex } from 'es-toolkit'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, shallowReactive, toRaw, watch } from 'vue'

import { getSpeechBusContext, voiceGenerationEnded } from '../../../services/speech/bus'
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
  const { activeProvider, activeModel, activeTemperature, activeTopP } = storeToRefs(consciousnessStore)
  const streamingControl = useLlmStreamingControlStore()

  type SparkNotifyBridgeMessage
    = | {
      type: 'request'
      requestId: string
      fromInstanceId: string
      payload: SparkNotifyReactionOptions
      performance?: {
        callManifests: LlmStreamingControlCallManifest[]
        timeoutMs?: number
      }
    }
    | {
      type: 'response'
      requestId: string
      toInstanceId: string
      reaction: string
      performance?: SparkNotifyPerformanceResult
    }
  const SPARK_NOTIFY_BRIDGE_CHANNEL_NAME = 'airi-spark-notify-bridge'
  const sparkNotifyBridgeInstanceId = `spark-notify-${nanoid()}`
  const sparkNotifyHostRole = ref<'main' | 'client'>('client')
  const sparkNotifyBridgeWaiters = new Map<string, {
    resolve: (result: { reaction: string, performance?: SparkNotifyPerformanceResult }) => Promise<void> | void
    timeout?: ReturnType<typeof setTimeout>
  }>()
  const { post: postSparkNotifyBridgeMessage, data: incomingSparkNotifyBridgeMessage } = useBroadcastChannel<SparkNotifyBridgeMessage, SparkNotifyBridgeMessage>({ name: SPARK_NOTIFY_BRIDGE_CHANNEL_NAME })

  const disposeHookFns = ref<Array<() => void>>([])
  // Remote stream data belongs to this renderer only. Keeping its visibility
  // outside the synchronized chat store prevents a follower from publishing
  // its local runtime state over the elected authority's snapshot.
  interface RemoteStream {
    sessionId: string
    generation: number
    turnId: string
    started: boolean
    completed: boolean
    refreshing: boolean
    pendingLiterals: string[]
  }
  const remoteStreams = shallowReactive(new Map<string, RemoteStream>())
  const isReceivingRemoteStream = computed(() => remoteStreams.has(chatSession.activeSessionId))
  const remoteStreamSessionId = computed(() => remoteStreams.get(chatSession.activeSessionId)?.sessionId)
  // Live remote activity. A background `assistant-end` keeps its completed stream for the refresh
  // that runs when the session returns to view. A caller that needs a running response reads this.
  // The visible session wins when several remote responses run.
  const liveRemoteStreamSessionId = computed(() => {
    const visible = remoteStreams.get(chatSession.activeSessionId)
    if (visible && !visible.completed)
      return visible.sessionId
    for (const stream of remoteStreams.values()) {
      if (!stream.completed)
        return stream.sessionId
    }
    return undefined
  })
  let contextChannel: ReturnType<typeof createContextChannel> | undefined
  const localProducedStreams = new Map<string, { sessionId: string, turnId: string }>()
  let initialized = false

  function removeRemoteStream(guard: RemoteStream) {
    if (remoteStreams.get(guard.sessionId) !== guard)
      return
    remoteStreams.delete(guard.sessionId)
    if (guard.started && guard.sessionId === chatSession.activeSessionId)
      chatStream.resetStream()
  }

  async function cancelRemoteStream(sessionId: string) {
    const guard = remoteStreams.get(sessionId)
    const produced = localProducedStreams.get(sessionId)
    const turnId = guard?.turnId ?? produced?.turnId
    if (!turnId)
      return
    localProducedStreams.delete(sessionId)
    await contextChannel?.emitStreamCancel({ sessionId, turnId })
    if (guard)
      removeRemoteStream(guard)
  }

  function presentRemoteStreamIfActive() {
    const guard = remoteStreams.get(chatSession.activeSessionId)
    if (!guard || chatSession.getSessionGenerationValue(guard.sessionId) !== guard.generation)
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

  async function refreshCompletedRemoteStream(guard: RemoteStream) {
    guard.refreshing = true
    try {
      const loaded = await chatSession.refreshSession(guard.sessionId)
      if (loaded)
        removeRemoteStream(guard)
    }
    catch (error) {
      console.warn('[context-bridge] Failed to refresh completed remote stream:', errorMessageFrom(error))
    }
    finally {
      guard.refreshing = false
    }
  }

  function recordContextIngestRejected(options: {
    channel: 'server' | 'broadcast' | 'input'
    contextMessage: ContextMessage
    details?: unknown
    error: unknown
    sourceLabel?: string
  }) {
    contextObservability.recordLifecycle({
      phase: 'store-ingest-rejected',
      channel: options.channel,
      sourceKey: getEventSourceKey(options.contextMessage),
      strategy: options.contextMessage.strategy,
      lane: options.contextMessage.lane,
      contextId: options.contextMessage.contextId,
      eventId: options.contextMessage.id,
      textPreview: options.contextMessage.text,
      sourceLabel: options.sourceLabel,
      details: {
        errorMessage: errorMessageFrom(options.error) ?? 'Unknown context ingest error',
        event: options.details,
      },
    })
  }

  function ingestContextMessageSafely(options: {
    channel: 'server' | 'broadcast' | 'input'
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

  async function handleSparkNotifyReactionLocal(options: SparkNotifyReactionOptions, identity?: { id?: string, eventId?: string }) {
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: options.source ?? 'plugin-module-host',
      data: {
        id: identity?.id ?? nanoid(),
        eventId: identity?.eventId ?? nanoid(),
        lane: options.lane,
        kind: options.kind ?? 'ping',
        urgency: options.urgency ?? 'immediate',
        headline: options.headline,
        note: options.note,
        payload: options.payload,
        ttlMs: options.ttlMs,
        requiresAck: options.requiresAck,
        destinations: options.destinations?.length ? options.destinations : ['character'],
        metadata: options.metadata,
      },
    }

    try {
      return await characterOrchestratorStore.handleSparkNotifyWithReaction(event, {
        fallbackText: options.fallbackResponseText,
        forceResponse: options.forceResponse,
        forceTextResponse: options.forceTextResponse,
        forceSparkCommandResponse: options.forceSparkCommandResponse,
        messageOverride: options.messageOverride,
      })
    }
    catch (error) {
      console.warn('[context-bridge] spark:notify handling failed; using fallback', error)
      return options.fallbackResponseText
    }
  }

  function setSparkNotifyHostRole(role: 'main' | 'client') {
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
        type: 'request',
        requestId,
        fromInstanceId: sparkNotifyBridgeInstanceId,
        payload: options,
      })
    })
  }

  async function handleSparkNotifyPerformanceLocal(options: SparkNotifyReactionOptions): Promise<SparkNotifyPerformanceResult> {
    const calls = options.calls ?? []

    if (calls.length === 0) {
      const reaction = await handleSparkNotifyReactionLocal(options)
      return {
        type: 'completed',
        reaction,
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
          type: 'called',
          name: call.manifest.name,
          payload,
          reaction,
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
        type: result.type === 'cancelled' ? 'cancelled' : 'completed',
        reaction: reaction || options.fallbackResponseText,
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
        type: 'completed',
        reaction,
      }
    }

    const requestId = nanoid()
    return await new Promise<SparkNotifyPerformanceResult>((resolve) => {
      const timeout = setTimeout(() => {
        sparkNotifyBridgeWaiters.delete(requestId)
        resolve(createFallbackPerformanceResult(options, 'timeout'))
      }, Math.max(1, options.timeoutMs ?? 5000))

      sparkNotifyBridgeWaiters.set(requestId, {
        resolve: async ({ reaction, performance }) => {
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
        type: 'request',
        requestId,
        fromInstanceId: sparkNotifyBridgeInstanceId,
        payload,
        performance: {
          callManifests: calls.map(call => call.manifest),
          timeoutMs: options.timeoutMs,
        },
      })
    })
  }

  function createFallbackPerformanceResult(
    options: SparkNotifyReactionOptions,
    type: Extract<SparkNotifyPerformanceResult['type'], 'completed' | 'timeout'>,
    reaction?: string,
  ): SparkNotifyPerformanceResult {
    return {
      type,
      reaction: reaction || options.fallbackResponseText,
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
            type: 'module:consumer:register',
            data: {
              event: consumerEvent,
              mode: 'consumer-group',
              group: 'chat-ingestion',
            },
          })
        }
      }

      await serverChannelStore.ensureConnected()

      registerConsumers()
      disposeHookFns.value.push(serverChannelStore.onReconnected(() => registerConsumers()))

      const remoteContexts = new WeakSet<object>()

      const stopContextUpdates = contextChannel.onContext((event) => {
        contextObservability.recordLifecycle({
          phase: 'broadcast-received',
          channel: 'broadcast',
          sourceKey: getEventSourceKey(event),
          strategy: event.strategy,
          lane: event.lane,
          contextId: event.contextId,
          eventId: event.id,
          textPreview: event.text,
          sourceLabel: getMetadataSourceLabel(event.metadata?.source),
          details: event,
        })
        const ingestAttempt = ingestContextMessageSafely({
          channel: 'broadcast',
          contextMessage: event,
          sourceLabel: getMetadataSourceLabel(event.metadata?.source),
          details: event,
        })
        if (ingestAttempt.ok && ingestAttempt.result) {
          contextObservability.recordLifecycle({
            phase: 'store-ingested',
            channel: 'broadcast',
            sourceKey: ingestAttempt.result.sourceKey,
            strategy: event.strategy,
            lane: event.lane,
            contextId: event.contextId,
            eventId: event.id,
            mutation: ingestAttempt.result.mutation,
            textPreview: event.text,
            sourceLabel: getMetadataSourceLabel(event.metadata?.source),
            details: {
              entryCount: ingestAttempt.result.entryCount,
              event,
            },
          })
        }
      })
      disposeHookFns.value.push(stopContextUpdates)

      disposeHookFns.value.push(getSpeechBusContext().on(voiceGenerationEnded, ({ body }) => {
        if (!body)
          return
        if (localProducedStreams.get(body.sessionId)?.turnId === body.turnId) {
          localProducedStreams.delete(body.sessionId)
          if (body.status !== 'finished')
            void contextChannel?.emitStreamFailed(body)
        }
      }))
      disposeHookFns.value.push(contextChannel.onStreamFailed((turn) => {
        const guard = remoteStreams.get(turn.sessionId)
        if (guard?.turnId === turn.turnId)
          removeRemoteStream(guard)
      }))

      disposeHookFns.value.push(contextChannel.onStreamCancel(async (command) => {
        const guard = remoteStreams.get(command.sessionId)
        if (guard?.turnId === command.turnId)
          removeRemoteStream(guard)
        if (localProducedStreams.get(command.sessionId)?.turnId !== command.turnId)
          return
        localProducedStreams.delete(command.sessionId)
        await chatOrchestrator.cancelTurn(command)
      }))

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
                    manifest,
                    handler: async () => undefined,
                  })),
                  timeoutMs: event.performance.timeoutMs,
                })
              : undefined
            const reaction = performance?.reaction ?? await handleSparkNotifyReactionLocal(event.payload)
            postSparkNotifyBridgeMessage({
              type: 'response',
              requestId: event.requestId,
              toInstanceId: event.fromInstanceId,
              reaction,
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
            reaction: event.reaction,
            performance: event.performance,
          })
        }
      })
      disposeHookFns.value.push(stopSparkNotifyBridgeWatch)

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
          sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
          details: event,
        })
        const contextMessage: ContextMessage = {
          ...event.data,
          metadata: event.metadata,
          createdAt: Date.now(),
        }
        const ingestAttempt = ingestContextMessageSafely({
          channel: 'server',
          contextMessage,
          sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
          details: event,
        })
        if (!ingestAttempt.ok)
          return

        if (ingestAttempt.result) {
          contextObservability.recordLifecycle({
            phase: 'store-ingested',
            channel: 'server',
            sourceKey: ingestAttempt.result.sourceKey,
            strategy: contextMessage.strategy,
            lane: contextMessage.lane,
            contextId: contextMessage.contextId,
            eventId: contextMessage.id,
            mutation: ingestAttempt.result.mutation,
            textPreview: contextMessage.text,
            sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
            details: {
              entryCount: ingestAttempt.result.entryCount,
              event,
            },
          })
        }
        void contextChannel?.emitContext(toRaw(contextMessage))
        contextObservability.recordLifecycle({
          phase: 'broadcast-posted',
          channel: 'broadcast',
          sourceKey: getEventSourceKey(contextMessage),
          strategy: contextMessage.strategy,
          lane: contextMessage.lane,
          contextId: contextMessage.contextId,
          eventId: contextMessage.id,
          textPreview: contextMessage.text,
          sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
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
        const acceptedContextUpdates: typeof normalizedContextUpdates = normalizedContextUpdates ? [] : undefined

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
              sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
              details: {
                inputType: event.type,
                update,
              },
            })
            const contextMessage: ContextMessage = {
              ...update,
              metadata: event.metadata,
              createdAt,
            }
            const ingestAttempt = ingestContextMessageSafely({
              channel: 'input',
              contextMessage,
              sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
              details: {
                inputType: event.type,
                update: contextMessage,
              },
            })
            if (!ingestAttempt.ok)
              continue

            acceptedContextUpdates?.push(update)

            if (ingestAttempt.result) {
              contextObservability.recordLifecycle({
                phase: 'store-ingested',
                channel: 'input',
                sourceKey: ingestAttempt.result.sourceKey,
                strategy: contextMessage.strategy,
                lane: contextMessage.lane,
                contextId: contextMessage.contextId,
                eventId: contextMessage.id,
                mutation: ingestAttempt.result.mutation,
                textPreview: contextMessage.text,
                sourceLabel: getMetadataSourceLabel(event.metadata?.source) ?? event.source,
                details: {
                  entryCount: ingestAttempt.result.entryCount,
                  inputType: event.type,
                  update: contextMessage,
                },
              })
            }
          }
        }

        if (activeProvider.value && activeModel.value) {
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
              await chatOrchestrator.send({
                sessionId: targetSessionId ?? chatSession.activeSessionId,
                text: messageText,
                temperature: activeTemperature.value,
                topP: activeTopP.value,
                input: {
                  type: 'input:text',
                  data: {
                    ...event.data,
                    text,
                    textRaw,
                    overrides,
                    contextUpdates: acceptedContextUpdates,
                  },
                },
              })
            }
            catch (err) {
              console.error('Error ingesting text input via context bridge:', err)
            }
          })
        }
      }))

      disposeHookFns.value.push(
        chatOrchestrator.onBeforeMessageComposed(async (message, context) => {
          if (remoteContexts.has(context))
            return

          await contextChannel?.emitStream({ type: 'before-compose', message, sessionId: context.sessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onAfterMessageComposed(async (message, context) => {
          if (remoteContexts.has(context))
            return

          await contextChannel?.emitStream({ type: 'after-compose', message, sessionId: context.sessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onBeforeSend(async (message, context) => {
          if (remoteContexts.has(context))
            return

          const sessionId = context.sessionId
          localProducedStreams.set(sessionId, { sessionId, turnId: context.turnId })
          await contextChannel?.emitStream({ type: 'before-send', message, sessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onAfterSend(async (message, context) => {
          if (remoteContexts.has(context))
            return

          const sessionId = context.sessionId
          await contextChannel?.emitStream({ type: 'after-send', message, sessionId, context: structuredClone(normalizeContextSnapshot(context)) })
          if (localProducedStreams.get(sessionId)?.turnId === context.turnId)
            localProducedStreams.delete(sessionId)
        }),
        chatOrchestrator.onTokenLiteral(async (literal, context) => {
          if (remoteContexts.has(context))
            return

          await contextChannel?.emitStream({ type: 'token-literal', literal, sessionId: context.sessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onTokenSpecial(async (special, context) => {
          if (remoteContexts.has(context))
            return

          await contextChannel?.emitStream({ type: 'token-special', special, sessionId: context.sessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onStreamEnd(async (context) => {
          if (remoteContexts.has(context))
            return

          await contextChannel?.emitStream({ type: 'stream-end', sessionId: context.sessionId, context: structuredClone(normalizeContextSnapshot(context)) })
        }),
        chatOrchestrator.onAssistantResponseEnd(async (message, context) => {
          if (remoteContexts.has(context))
            return

          await contextChannel?.emitStream({ type: 'assistant-end', message, sessionId: context.sessionId, context: structuredClone(normalizeContextSnapshot(context)) })
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
                contexts: context.contexts,
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
                contexts: context.contexts,
                input: context.input,
              },
            },
          })
        }),
      )

      const stopIncomingStreamWatch = contextChannel.onStream(async (event) => {
        if (event.context.sessionId !== event.sessionId)
          return
        remoteContexts.add(event.context)
        try {
          const guard = remoteStreams.get(event.sessionId)
          if (guard && chatSession.getSessionGenerationValue(guard.sessionId) !== guard.generation)
            removeRemoteStream(guard)
          const current = guard?.turnId === event.context.turnId
            && chatSession.getSessionGenerationValue(guard.sessionId) === guard.generation
          switch (event.type) {
            case 'before-compose':
              await chatOrchestrator.emitBeforeMessageComposedHooks(event.message, event.context)
              break
            case 'after-compose':
              await chatOrchestrator.emitAfterMessageComposedHooks(event.message, event.context)
              break
            case 'before-send':
              remoteStreams.set(event.sessionId, {
                sessionId: event.sessionId,
                generation: chatSession.getSessionGenerationValue(event.sessionId),
                turnId: event.context.turnId,
                started: false,
                completed: false,
                refreshing: false,
                pendingLiterals: [],
              })
              presentRemoteStreamIfActive()
              await chatOrchestrator.emitBeforeSendHooks(event.message, event.context)
              break
            case 'after-send':
              await chatOrchestrator.emitAfterSendHooks(event.message, event.context)
              break
            case 'token-literal':
              if (!current || guard.completed)
                return
              guard.pendingLiterals.push(event.literal)
              presentRemoteStreamIfActive()
              await chatOrchestrator.emitTokenLiteralHooks(event.literal, event.context)
              break
            case 'token-special':
              if (current && !guard.completed)
                await chatOrchestrator.emitTokenSpecialHooks(event.special, event.context)
              break
            case 'stream-end':
              if (current)
                await chatOrchestrator.emitStreamEndHooks(event.context)
              break
            case 'assistant-end':
              if (!current)
                return
              {
                // `remoteStreams` is shallow, so a nested write does not notify its readers.
                // Replace the entry so that `liveRemoteStreamSessionId` sees the completion.
                const completed = { ...guard, completed: true }
                remoteStreams.set(guard.sessionId, completed)
                await chatOrchestrator.emitAssistantResponseEndHooks(event.message, event.context)
                if (completed.sessionId === chatSession.activeSessionId)
                  await refreshCompletedRemoteStream(completed)
              }
              break
          }
        }
        catch (error) {
          const guard = remoteStreams.get(event.sessionId)
          if (guard?.turnId === event.context.turnId)
            removeRemoteStream(guard)
          console.error('Remote chat stream failed', error)
        }
        finally {
          remoteContexts.delete(event.context)
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

      contextChannel?.dispose(new Error('Context bridge disposed'))
      contextChannel = undefined

      initialized = false
      remoteStreams.clear()
      localProducedStreams.clear()

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
    initialize,
    dispose,
    dispatchSparkNotifyReaction,
    dispatchSparkNotifyPerformance,
    isReceivingRemoteStream,
    liveRemoteStreamSessionId,
    remoteStreamSessionId,
    cancelRemoteStream,
    setSparkNotifyHostRole,
  }
})
