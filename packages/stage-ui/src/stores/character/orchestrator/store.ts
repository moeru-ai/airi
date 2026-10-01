import type { IntakeDecision, Stimulus } from '@proj-airi/core-agent'
import type { SparkNotifyResponseControl } from '@proj-airi/core-agent/agents/spark-notify'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { ScheduledSparkNotify } from './queue'

import { errorMessageFrom } from '@moeru/std'
import { decideByPrior, deferDelayMs, OWNER_AUDIENCE, salienceFromUrgency } from '@proj-airi/core-agent'
import { createSparkNotifyAgent, createSparkNotifyReactionPlugin, getEventSourceKey } from '@proj-airi/core-agent/agents/spark-notify'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { onScopeDispose, ref } from 'vue'

import { useCharacterNotebookStore, useCharacterStore } from '../'
import { useAiriRuntimePrompt } from '../../../composables/use-airi-runtime-prompt'
import { useLLM } from '../../ai/chat-llm/llm'
import { useChatSessionStore } from '../../chat/session-store'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useSchedulerStore } from '../../scheduler'
import { useCharacterNotifyQueueStore } from './queue'

export { sparkNotifyCommandSchema } from '@proj-airi/core-agent/agents/spark-notify'

export const useCharacterOrchestratorStore = defineStore('character-orchestrator', () => {
  const { stream } = useLLM()
  const consciousnessStore = useConsciousnessStore()
  const { activeProvider, activeModel } = storeToRefs(consciousnessStore)
  const characterStore = useCharacterStore()
  const notebookStore = useCharacterNotebookStore()
  const { systemPrompt } = storeToRefs(characterStore)
  const runtimePrompt = useAiriRuntimePrompt()
  const modsServerChannelStore = useModsServerChannelStore()
  const chatSession = useChatSessionStore()
  const scheduler = useSchedulerStore()

  const processing = ref(false)
  // The queue survives leader handoff. A follower enqueue reaches the leader ticker.
  const notifyQueue = useCharacterNotifyQueueStore()
  const { pendingNotifies, scheduledNotifies } = storeToRefs(notifyQueue)

  const attentionConfig = ref({
    tickIntervalMs: 2_000,
    taskNotifyWindowMs: 60_000,
    requeueDelayMs: 30_000,
    maxAttempts: 3,
  })

  let tickTimer: ReturnType<typeof setInterval> | undefined
  let initialized = false
  let leadership: SyncedPiniaRuntime | undefined
  let stopLeadershipListener: (() => void) | undefined
  let activeNotify: { runId: string, eventId: string, controller: AbortController } | undefined
  const eventUnsubscribes: Array<() => void> = []
  const sparkNotifyAgent = createSparkNotifyAgent({
    runner: {
      run: request => stream(
        request.selectedChat.model,
        request.selectedChat.provider,
        request.conversation,
        {
          abortSignal: request.abortSignal,
          tools: request.tools,
          providerId: request.selectedChat.providerId,
          supportsTools: request.policy.supportsTools,
          waitForTools: request.policy.waitForTools,
          toolChoice: request.policy.toolChoice,
          onStreamEvent: request.onStreamEvent,
        },
      ),
    },
    plugins: [
      createSparkNotifyReactionPlugin({
        onDelta: (eventId, text) => characterStore.onSparkNotifyReactionStreamEvent(eventId, text),
        onEnd: (eventId, text) => characterStore.onSparkNotifyReactionStreamEnd(eventId, text),
      }),
    ],
  })

  function stimulusFromNotify(event: WebSocketEventOf<'spark:notify'>, origin: Stimulus['origin'] = 'external'): Stimulus {
    const receivedAt = Date.now()
    const source = getEventSourceKey(event)
    return {
      id: event.data.id,
      kind: event.data.kind,
      origin,
      source,
      event: origin === 'internal' ? 'task:due' : 'spark:notify',
      eventId: event.data.eventId,
      bindings: [],
      salience: salienceFromUrgency(event.data.urgency),
      receivedAt,
      deadlineAt: event.data.ttlMs !== undefined ? receivedAt + event.data.ttlMs : undefined,
      // Keys stay inside their source, so two modules never replace each other's work.
      coalesceKey: event.data.coalesceKey ? `${source}:${event.data.coalesceKey}` : undefined,
    }
  }

  /** Notification reactions speak, so they wait while another run holds the voice. */
  function isBusy() {
    return processing.value || scheduler.leases.holder('voice') !== undefined
  }

  function removePending(eventId: string) {
    pendingNotifies.value = pendingNotifies.value.filter(item => item.data.id !== eventId)
  }

  async function defer(entry: Omit<ScheduledSparkNotify, 'nextRunAt'>, decision: IntakeDecision) {
    scheduler.intake.record(entry.stimulus, decision)
    await notifyQueue.enqueue({ ...entry, nextRunAt: decision.retryAt ?? Date.now() })
  }

  /**
   * Runs one admitted notification as a run that holds the voice. Its reaction speaks for the owner.
   * The run reaches a final state even when the model fails, so the voice never stays held.
   */
  async function runNotify(stimulus: Stimulus, event: WebSocketEventOf<'spark:notify'>, decision: IntakeDecision, control?: SparkNotifyResponseControl) {
    const runId = nanoid()
    const sessionId = chatSession.activeSessionId
    scheduler.runs.admit({
      runId,
      envelope: { sessionId, bindings: [], outputs: ['voice'], audience: OWNER_AUDIENCE, personaId: chatSession.sessionMetas[sessionId]?.characterId },
    })
    scheduler.intake.record(stimulus, { ...decision, runId })
    scheduler.leases.acquire('voice', runId, { salience: decision.salience ?? stimulus.salience })
    scheduler.runs.transition(runId, 'working')
    try {
      const result = await processSparkNotify(runId, event, control)
      // A missing model is an unavailable capability, never a silent choice.
      if (result)
        scheduler.runs.transition(runId, 'done')
      else
        scheduler.runs.transition(runId, 'blocked', 'No active provider or model')
      return result
    }
    catch (error) {
      // An owner stop already recorded `dropped`, so this keeps that final state.
      scheduler.runs.transition(runId, 'blocked', errorMessageFrom(error) ?? 'Notification run failed')
      throw error
    }
    finally {
      scheduler.leases.releaseAll(runId)
    }
  }

  async function enqueueSparkNotify(
    event: WebSocketEventOf<'spark:notify'>,
    options?: {
      reason?: string
      nextRunAt?: number
      maxAttempts?: number
      control?: SparkNotifyResponseControl
      origin?: Stimulus['origin']
    },
  ) {
    const stimulus = stimulusFromNotify(event, options?.origin)
    await defer({
      stimulus,
      event,
      control: options?.control,
      enqueuedAt: Date.now(),
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? attentionConfig.value.maxAttempts,
      reason: options?.reason,
    }, { outcome: 'deferred', reason: options?.reason ?? 'queued', decidedBy: 'rule', retryAt: options?.nextRunAt ?? Date.now() + deferDelayMs(stimulus.salience) })
  }

  async function processSparkNotify(runId: string, event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl) {
    const providerId = activeProvider.value
    const model = activeModel.value
    if (!providerId || !model) {
      console.warn('Spark notify ignored: missing active provider or model')
      return undefined
    }

    const controller = new AbortController()
    activeNotify = { runId, eventId: event.data.id, controller }
    processing.value = true

    try {
      const provider = await consciousnessStore.getChatProviderInstance(providerId)
      controller.signal.throwIfAborted()
      const result = await sparkNotifyAgent.handle({
        abortSignal: controller.signal,
        event,
        selectedChat: {
          providerId,
          model,
          provider,
        },
        systemPrompt: systemPrompt.value,
        runtimePrompt: runtimePrompt.value,
        control,
      })
      controller.signal.throwIfAborted()
      if (!result.commands.length)
        return result

      for (const command of result.commands) {
        modsServerChannelStore.send({
          type: 'spark:command',
          data: command,
        })
      }

      return result
    }
    finally {
      if (activeNotify?.controller === controller) {
        activeNotify = undefined
        processing.value = false
      }
    }
  }

  /**
   * Offers one notification to intake. Immediate work runs at once when the voice is free.
   * Other work waits by its salience, and a newer notification with the same coalescing key replaces waiting ones.
   */
  async function handleIncomingSparkNotify(event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl) {
    const stimulus = stimulusFromNotify(event)
    if (stimulus.coalesceKey) {
      for (const replaced of await notifyQueue.takeCoalesced(stimulus.coalesceKey))
        scheduler.intake.record(replaced.stimulus, { outcome: 'merged', reason: 'coalesced', decidedBy: 'rule', mergedInto: stimulus.id })
    }

    const decision = decideByPrior(stimulus, { now: Date.now(), busy: isBusy() })
    if (decision.outcome === 'admitted')
      return await runNotify(stimulus, event, decision, control)
    if (decision.outcome === 'ignored') {
      scheduler.intake.record(stimulus, decision)
      return undefined
    }

    await defer({
      stimulus,
      event,
      control,
      enqueuedAt: Date.now(),
      attempts: 0,
      maxAttempts: attentionConfig.value.maxAttempts,
      reason: 'spark:notify',
    }, decision)
    return undefined
  }

  async function handleSparkNotifyWithReaction(
    event: WebSocketEventOf<'spark:notify'>,
    options?: SparkNotifyResponseControl & { fallbackText?: string },
  ) {
    await handleIncomingSparkNotify(event, options)

    const reaction = [...characterStore.reactions]
      .reverse()
      .find(item => item.sourceEventId === event.data.id)
      ?.message
      ?.trim()

    return reaction || options?.fallbackText || ''
  }

  async function enqueueDueTasks(now: number) {
    const dueTasks = notebookStore.getDueTasks(now, attentionConfig.value.taskNotifyWindowMs)
    if (!dueTasks.length)
      return

    for (const task of dueTasks) {
      const event: WebSocketEventOf<'spark:notify'> = {
        type: 'spark:notify',
        source: 'character:task-scheduler',
        data: {
          id: `task-${task.id}`,
          eventId: task.id,
          kind: 'reminder',
          urgency: task.priority === 'critical' ? 'immediate' : 'soon',
          headline: `Task reminder: ${task.title}`,
          note: task.details,
          destinations: ['character'],
          payload: {
            taskId: task.id,
            dueAt: task.dueAt,
            priority: task.priority,
          },
        },
      }

      // Mark before the await, so an overlapping tick cannot schedule the same task again.
      notebookStore.markTaskNotified(task.id, now + attentionConfig.value.requeueDelayMs)
      // A due task is an internal stimulus. It returns to attention on the next tick.
      await enqueueSparkNotify(event, { reason: 'task:due', origin: 'internal', nextRunAt: now })
    }
  }

  async function tick() {
    if (!leadership?.isLeader() || isBusy())
      return

    const now = Date.now()
    await enqueueDueTasks(now)

    const nextIndex = scheduledNotifies.value.findIndex(item => item.nextRunAt <= now)
    if (nextIndex < 0)
      return

    const [next] = scheduledNotifies.value.splice(nextIndex, 1)
    removePending(next.event.data.id)

    const decision = decideByPrior(next.stimulus, { now, busy: isBusy(), retryAt: next.nextRunAt })
    if (decision.outcome === 'ignored') {
      scheduler.intake.record(next.stimulus, decision)
      return
    }

    try {
      await runNotify(next.stimulus, next.event, decision, next.control)
    }
    catch (error) {
      if (!leadership?.isLeader())
        return
      if (next.attempts + 1 < next.maxAttempts) {
        const attempts = next.attempts + 1
        const retryAt = Date.now() + deferDelayMs(next.stimulus.salience) + attempts * attentionConfig.value.requeueDelayMs
        await defer({ ...next, attempts }, { outcome: 'deferred', reason: 'retry', decidedBy: 'rule', retryAt })
      }
      else {
        console.warn('Dropped spark:notify after max attempts:', error)
      }
    }
  }

  function startTicker() {
    if (!leadership?.isLeader() || tickTimer)
      return

    tickTimer = setInterval(() => {
      void tick()
    }, attentionConfig.value.tickIntervalMs)
  }

  function stopTicker() {
    if (!tickTimer)
      return

    clearInterval(tickTimer)
    tickTimer = undefined
  }

  async function handleSparkEmit() {
    // Currently no-op
    return undefined
  }

  function startConsumers() {
    if (eventUnsubscribes.length)
      return
    eventUnsubscribes.push(
      modsServerChannelStore.onEvent('spark:notify', async (event) => {
        if (!leadership?.isLeader())
          return
        try {
          await handleIncomingSparkNotify(event)
        }
        catch (error) {
          console.warn('Failed to handle spark:notify event:', error)
        }
      }),
    )

    eventUnsubscribes.push(
      modsServerChannelStore.onEvent('spark:emit', async () => {
        if (!leadership?.isLeader())
          return
        try {
          await handleSparkEmit()
        }
        catch (error) {
          console.warn('Failed to handle spark:emit event:', error)
        }
      }),
    )

    startTicker()
  }

  function stopConsumers() {
    stopTicker()
    if (activeNotify) {
      scheduler.runs.transition(activeNotify.runId, 'dropped')
      activeNotify.controller.abort(new Error('Notify owner stopped'))
      characterStore.cancelSparkNotifyReaction(activeNotify.eventId)
      activeNotify = undefined
      processing.value = false
    }

    for (const unsubscribe of eventUnsubscribes) {
      unsubscribe()
    }

    eventUnsubscribes.length = 0
  }

  /** Starts background consumers only while this renderer owns synchronized leadership. */
  function initialize(syncedPinia: SyncedPiniaRuntime) {
    if (initialized)
      return
    initialized = true
    leadership = syncedPinia
    stopLeadershipListener = syncedPinia.onLeadershipChange((isLeader) => {
      if (isLeader)
        startConsumers()
      else
        stopConsumers()
    })
  }

  function dispose() {
    stopLeadershipListener?.()
    stopLeadershipListener = undefined
    stopConsumers()
    leadership = undefined
    initialized = false
  }

  onScopeDispose(dispose)

  return {
    processing,
    pendingNotifies,
    scheduledNotifies,
    attentionConfig,

    initialize,
    startTicker,
    stopTicker,
    dispose,

    handleSparkNotify: handleIncomingSparkNotify,
    handleSparkNotifyWithReaction,
    handleSparkEmit,
  }
})
