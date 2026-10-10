import type { DueRecipe, Recipe } from '@proj-airi/core-agent'
import type { SparkNotifyResponseControl } from '@proj-airi/core-agent/agents/spark-notify'
import type { WebSocketBaseEvent, WebSocketEventOf, WebSocketEvents } from '@proj-airi/server-sdk'
import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { checkAutomations, isAutoRunRecipe, usableRecipes } from '@proj-airi/core-agent'
import { createSparkNotifyAgent, createSparkNotifyReactionPlugin } from '@proj-airi/core-agent/agents/spark-notify'
import { defineStore, storeToRefs } from 'pinia'
import { onScopeDispose, ref } from 'vue'

import { useCharacterNotebookStore, useCharacterStore } from '../'
import { useAiriRuntimePrompt } from '../../../composables/use-airi-runtime-prompt'
import { getEventSourceKey } from '../../../utils/event-source'
import { useLLM } from '../../ai/chat-llm/llm'
import { useChatStore } from '../../chat'
import { useChatContextStore } from '../../chat/context-store'
import { useChatSessionStore } from '../../chat/session-store'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useModuleDirectoryStore } from '../../mods/api/module-directory'
import { useAiriCardStore } from '../../modules/airi-card'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useOwnerActivityStore } from '../../owner-activity'
import { useRecipesStore } from '../../recipes'

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
  const chatContext = useChatContextStore()
  const airiCard = useAiriCardStore()
  const recipes = useRecipesStore()
  const ownerActivity = useOwnerActivityStore()
  const moduleDirectory = useModuleDirectoryStore()

  const processing = ref(false)
  const pendingNotifies = ref<Array<WebSocketEventOf<'spark:notify'>>>([])

  const scheduledNotifies = ref<Array<{
    event: WebSocketEventOf<'spark:notify'>
    control?: SparkNotifyResponseControl
    enqueuedAt: number
    nextRunAt: number
    attempts: number
    maxAttempts: number
    reason?: string
  }>>([])

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
  const eventUnsubscribes: Array<() => void> = []
  const sparkNotifyAgent = createSparkNotifyAgent({
    runner: {
      run: request => stream(
        request.selectedChat.model,
        request.selectedChat.provider,
        request.conversation,
        {
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

  function computeNextRunAt(event: WebSocketEventOf<'spark:notify'>, attempts: number) {
    const now = Date.now()
    const baseDelay = (() => {
      switch (event.data.urgency) {
        case 'immediate':
          return 0
        case 'soon':
          return 10_000
        case 'later':
          return 60_000
        default:
          return 30_000
      }
    })()

    return now + baseDelay + (attempts * attentionConfig.value.requeueDelayMs)
  }

  function removePending(eventId: string) {
    pendingNotifies.value = pendingNotifies.value.filter(item => item.data.id !== eventId)
  }

  function enqueueSparkNotify(
    event: WebSocketEventOf<'spark:notify'>,
    options?: {
      reason?: string
      nextRunAt?: number
      maxAttempts?: number
      control?: SparkNotifyResponseControl
    },
  ) {
    if (!pendingNotifies.value.some(item => item.data.id === event.data.id)) {
      pendingNotifies.value.push(event)
    }

    scheduledNotifies.value.push({
      event,
      control: options?.control,
      enqueuedAt: Date.now(),
      nextRunAt: options?.nextRunAt ?? computeNextRunAt(event, 0),
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? attentionConfig.value.maxAttempts,
      reason: options?.reason,
    })
  }

  async function processSparkNotify(event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl) {
    const providerId = activeProvider.value
    const model = activeModel.value
    if (!providerId || !model) {
      console.warn('Spark notify ignored: missing active provider or model')
      return undefined
    }

    const provider = await consciousnessStore.getChatProviderInstance(providerId)
    processing.value = true

    try {
      const result = await sparkNotifyAgent.handle({
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
      processing.value = false
    }
  }

  async function handleIncomingSparkNotify(event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl) {
    if (event.data.urgency === 'immediate' && !processing.value) {
      return await processSparkNotify(event, control)
    }

    enqueueSparkNotify(event, { reason: 'spark:notify', control })
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

  function enqueueDueTasks(now: number) {
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

      enqueueSparkNotify(event, { reason: 'task:due' })
      notebookStore.markTaskNotified(task.id, now + attentionConfig.value.requeueDelayMs)
    }
  }

  let automationsStartedAt: number | undefined
  /** When each trigger of each recipe last fired, by trigger index. Each event counts once. */
  const automationFiredAt: Record<string, Record<number, number>> = {}
  /** When each recipe last ran on its automation. The cooldown counts from it. */
  const automationRanAt: Record<string, number> = {}
  const automationSeenAt = new Map<string, number>()

  /**
   * The owner conversation that auto-run recipes report to: the one of the selected card that the owner used last.
   * Each window selects its own conversation, so the leader's selection can be one that nobody looks at. A scene never receives owner work.
   */
  function ownerSessionId() {
    const cardId = chatSession.sessionMetas[chatSession.activeSessionId]?.characterId ?? airiCard.activeCardId
    return Object.values(chatSession.sessionMetas)
      .filter(meta => meta.characterId === cardId && !meta.bindings?.length && !meta.recipeId && !meta.hidden)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0]
      ?.sessionId
  }

  /** When the owner last wrote in a conversation. A stored notice is not the owner speaking. Without loaded messages, the last update stands in. */
  function ownerWroteAt(sessionId: string) {
    const messages = chatSession.getSessionMessagesIfLoaded(sessionId)
    if (!messages)
      return chatSession.sessionMetas[sessionId]?.updatedAt
    return messages.findLast(message => message.role === 'user' && !message.notice)?.createdAt
  }

  /**
   * Latest observation per source that the owner conversation can read. Event triggers follow these.
   * A registered module is keyed by its name, which stays the same across restarts. Other writers keep their source key.
   */
  function latestObservations(sessionId: string) {
    const snapshot = chatContext.getContextsSnapshot(useChatStore().contextReaderFor(sessionId))
    const latest: Record<string, { createdAt: number, text: string }> = {}
    for (const message of Object.values(snapshot).flat()) {
      const source = moduleDirectory.nameOf(message.metadata?.source?.id) ?? getEventSourceKey(message)
      if (!latest[source] || message.createdAt > latest[source].createdAt)
        latest[source] = { createdAt: message.createdAt, text: message.text }
    }
    return latest
  }

  /** Why an automation started, in words for its task: the trigger that fired, with what it saw. */
  function describeTrigger(due: DueRecipe, inputs: ReturnType<typeof ownerActivity.inputs>) {
    const { trigger } = due
    switch (trigger.source) {
      case 'clock':
        return trigger.event === 'at' ? `Your set time ${trigger.time} came.` : `Your interval of ${trigger.minutes} minutes came.`
      case 'chat':
        return trigger.event === 'message' ? 'The owner just sent a message.' : `The owner has sent no message for ${trigger.minutes} minutes.`
      case 'mouse':
      case 'keyboard': {
        if (trigger.event === 'idle')
          return `The owner has not used the ${trigger.source} for ${trigger.minutes} minutes.`
        const idleMs = trigger.afterIdleMinutes ? inputs[trigger.source]?.lastReturn?.idleMs : undefined
        return idleMs ? `The owner used the ${trigger.source} again after ${Math.round(idleMs / 60_000)} minutes without it.` : `The owner used the ${trigger.source}.`
      }
      case 'module':
        return due.observation ? `New observation from ${due.observation.source}: ${due.observation.text}` : `New observation from ${trigger.module}.`
    }
  }

  /**
   * Armed tasks of usable model-timed recipes, each as a recipe with the automation that the model set.
   * Each one goes by its session id, so two armed runs of one recipe never share a trigger event.
   */
  function armedTasks(usable: readonly Recipe[]) {
    return Object.values(chatSession.sessionMetas).flatMap((meta) => {
      const recipe = usable.find(entry => entry.id === meta.recipeId && entry.modelTimed)
      return recipe && meta.task?.status === 'armed' && meta.task.armed
        ? [{ sessionId: meta.sessionId, recipe, armedAt: meta.task.startedAt, ...meta.task.armed }]
        : []
    })
  }

  /**
   * Starts the automated recipes that are due: the owner's automations and the armed tasks that the model set.
   * Each one runs in its own session without voice. Its result returns to the owner conversation, which decides what to say.
   * An armed task fires once. When its condition says no, it is deleted. Without a due recipe, nothing is called.
   */
  async function runAutomations(now: number) {
    automationsStartedAt ??= now
    const usable = usableRecipes(recipes.recipes)
    // A recipe counts time from when it became usable, so a new or newly enabled one waits a full period.
    const usableIds = new Set(usable.filter(isAutoRunRecipe).map(recipe => recipe.id))
    for (const id of automationSeenAt.keys()) {
      if (!usableIds.has(id))
        automationSeenAt.delete(id)
    }
    for (const id of usableIds) {
      if (!automationSeenAt.has(id))
        automationSeenAt.set(id, now)
    }
    if (!usableIds.size)
      return
    const parentSessionId = ownerSessionId()
    if (!parentSessionId)
      return
    const lastOwnerMessageAt = ownerWroteAt(parentSessionId)
    await ownerActivity.sample(now)
    const inputs = ownerActivity.inputs()
    // A recipe whose earlier run still waits or runs does not start again.
    const running = new Set(Object.values(chatSession.sessionMetas).flatMap(meta => meta.recipeId && (meta.task?.status === 'queued' || meta.task?.status === 'running') ? [meta.recipeId] : []))
    const armed = new Map(armedTasks(usable).map(task => [task.sessionId, task]))
    const { fired, due } = checkAutomations([...recipes.recipes, ...[...armed.values()].map(task => ({ ...task.recipe, id: task.sessionId, automation: task.automation }))], {
      now,
      startedAt: automationsStartedAt,
      firedAt: automationFiredAt,
      ranAt: automationRanAt,
      seenAt: { ...Object.fromEntries(automationSeenAt), ...Object.fromEntries([...armed.values()].map(task => [task.sessionId, task.armedAt])) },
      lastOwnerMessageAt,
      inputs,
      observations: latestObservations(parentSessionId),
      running,
    })
    for (const [id, triggers] of Object.entries(fired)) {
      if (!armed.has(id))
        automationFiredAt[id] = { ...automationFiredAt[id], ...Object.fromEntries(triggers.map(index => [index, now])) }
    }
    const chat = useChatStore()
    const startedArmed = new Set<string>()
    const time = `Local time: ${new Date(now).toLocaleString()}.`
    for (const entry of due) {
      const task = `${time} ${describeTrigger(entry, inputs)}`
      const armedTask = armed.get(entry.recipe.id)
      if (armedTask) {
        await chat.startArmedTask(armedTask.recipe, armedTask.sessionId, `${task}\nYou set this run when the owner asked. Your note: ${armedTask.note}`)
        startedArmed.add(armedTask.sessionId)
        continue
      }
      automationRanAt[entry.recipe.id] = now
      await chat.startRecipe(entry.recipe, { parentSessionId, task })
    }
    // An armed task fires once, so one that fired and did not start is spent.
    for (const id of Object.keys(fired).filter(id => armed.has(id) && !startedArmed.has(id)))
      await chat.discardArmedTask(id)
  }

  async function tick() {
    if (!leadership?.isLeader() || processing.value)
      return

    const now = Date.now()
    enqueueDueTasks(now)
    await runAutomations(now)

    const nextIndex = scheduledNotifies.value.findIndex(item => item.nextRunAt <= now)
    if (nextIndex < 0)
      return

    const [next] = scheduledNotifies.value.splice(nextIndex, 1)
    removePending(next.event.data.id)

    try {
      await processSparkNotify(next.event, next.control)
    }
    catch (error) {
      if (next.attempts + 1 < next.maxAttempts) {
        scheduledNotifies.value = [...scheduledNotifies.value, {
          ...next,
          attempts: next.attempts + 1,
          nextRunAt: computeNextRunAt(next.event, next.attempts + 1),
        }]
        pendingNotifies.value = [...pendingNotifies.value, next.event]
      }
      else {
        console.warn('Dropped spark:notify after max attempts:', error)
      }
    }
  }

  function startTicker() {
    if (tickTimer)
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

  async function handleSparkEmit(_: WebSocketBaseEvent<'spark:emit', WebSocketEvents['spark:emit']>) {
    // Currently no-op
    return undefined
  }

  // Only the leader renderer handles notifications and triggers, so several windows never do the same work twice.
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
      modsServerChannelStore.onEvent('spark:emit', async (event) => {
        if (!leadership?.isLeader())
          return
        try {
          await handleSparkEmit(event)
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
    runAutomations,
    handleSparkNotifyWithReaction,
    handleSparkEmit,
  }
})
