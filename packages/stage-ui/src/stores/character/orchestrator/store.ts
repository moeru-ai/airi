import type { IntakeDecision, Stimulus } from '@proj-airi/core-agent'
import type { SparkNotifyResponseControl } from '@proj-airi/core-agent/agents/spark-notify'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { ScheduledSparkNotify } from './queue'

import { errorMessageFrom } from '@moeru/std'
import { compareLeaseCandidates, decideByAppraisal, decideByPrior, deferDelayMs, OWNER_AUDIENCE, OWNER_PRIVATE_BINDING, salienceFromUrgency, useLlmmarkerParser } from '@proj-airi/core-agent'
import { createSparkNotifyAgent, createSparkNotifyReactionPlugin, getEventSourceKey } from '@proj-airi/core-agent/agents/spark-notify'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { onScopeDispose, ref } from 'vue'

import { sparkReactionTurnId, useCharacterNotebookStore, useCharacterStore } from '../'
import { useAiriRuntimePrompt } from '../../../composables/use-airi-runtime-prompt'
import { useLLM } from '../../ai/chat-llm/llm'
import { useChatContextStore } from '../../chat/context-store'
import { useChatSessionStore } from '../../chat/session-store'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { sendAdmittedSparkCommand } from '../../mods/api/spark-command'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useTriageStore } from '../../modules/triage'
import { useSchedulerStore } from '../../scheduler'
import { useSettingsRunLimits } from '../../settings/run-limits'
import { useSettingsTriage } from '../../settings/triage'
import { useSpeechRuntimeStore } from '../../speech-runtime'
import { useCharacterNotifyQueueStore } from './queue'

export { sparkNotifyCommandSchema } from '@proj-airi/core-agent/agents/spark-notify'

/** Internal proposals can propose further work only this many levels deep. */
export const MAX_PROPOSAL_DEPTH = 2

/** Salience at which a notification interrupts current speech at a sentence boundary. */
export const INTERRUPT_SALIENCE = 0.85

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
  const speechRuntime = useSpeechRuntimeStore()
  const triage = useTriageStore()
  const triageSettings = useSettingsTriage()
  const runLimits = useSettingsRunLimits()
  const chatContext = useChatContextStore()

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
  let activeNotify: { runId: string, eventId: string, controller: AbortController, interrupts: boolean } | undefined
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
          // The run id lets the command tool admit commands for this notification run.
          requestCorrelation: activeNotify ? { conversationId: `spark:${activeNotify.eventId}`, turnId: activeNotify.eventId, runId: activeNotify.runId } : undefined,
        },
      ),
    },
    plugins: [
      createSparkNotifyReactionPlugin({
        // Only urgent work cuts in, and only at a sentence boundary.
        onDelta: (eventId, text) => characterStore.onSparkNotifyReactionStreamEvent(eventId, text, { interrupt: activeNotify?.interrupts === true }),
        onEnd: (eventId, text) => characterStore.onSparkNotifyReactionStreamEnd(eventId, text),
      }),
    ],
  })

  function stimulusFromNotify(event: WebSocketEventOf<'spark:notify'>, origin: Stimulus['origin'] = 'external', eventName = origin === 'internal' ? 'task:due' : 'spark:notify'): Stimulus {
    const receivedAt = Date.now()
    const source = getEventSourceKey(event)
    return {
      id: event.data.id,
      kind: event.data.kind,
      origin,
      source,
      event: eventName,
      eventId: event.data.eventId,
      bindings: [],
      salience: salienceFromUrgency(event.data.urgency),
      receivedAt,
      deadlineAt: event.data.ttlMs !== undefined ? receivedAt + event.data.ttlMs : undefined,
      text: [event.data.headline, event.data.note].filter(Boolean).join('\n'),
      // Keys stay inside their source, so two modules never replace each other's work.
      coalesceKey: event.data.coalesceKey ? `${source}:${event.data.coalesceKey}` : undefined,
    }
  }

  /**
   * Asks for the voice in the lease line. Only candidates for the voice compare: salience tier, then deadline, then waiting time.
   * A refused candidate stays in line under its run id until it asks again or withdraws.
   */
  function requestVoice(entry: { runId: string, stimulus: Stimulus, enqueuedAt: number }) {
    // Notification runs count against the shared run capacity, like chat sends.
    if (processing.value || scheduler.runs.countWorking() >= runLimits.limits.maxConcurrentRuns)
      return false
    // Urgent work takes the voice from lower-salience speech. Scene sources stay below this level.
    const preempt = entry.stimulus.salience >= INTERRUPT_SALIENCE
    return scheduler.leases.acquire('voice', entry.runId, { salience: entry.stimulus.salience, deadlineAt: entry.stimulus.deadlineAt, waitingSince: entry.enqueuedAt, preempt }).granted
  }

  function removePending(eventId: string) {
    pendingNotifies.value = pendingNotifies.value.filter(item => item.data.id !== eventId)
  }

  async function defer(entry: Omit<ScheduledSparkNotify, 'nextRunAt'>, decision: IntakeDecision) {
    scheduler.intake.record(entry.stimulus, decision)
    await notifyQueue.enqueue({ ...entry, nextRunAt: decision.retryAt ?? Date.now() })
  }

  /**
   * Runs one admitted notification that already holds the voice under `runId`. Its reaction speaks for the owner, or stays silent.
   * The run reaches a final state even when the model fails, so the voice never stays held.
   */
  async function runNotify(runId: string, stimulus: Stimulus, event: WebSocketEventOf<'spark:notify'>, decision: IntakeDecision, control?: SparkNotifyResponseControl) {
    const sessionId = chatSession.activeSessionId
    const salience = decision.salience ?? stimulus.salience
    scheduler.runs.admit({
      runId,
      salience,
      envelope: { sessionId, bindings: [], outputs: ['voice'], audience: OWNER_AUDIENCE, personaId: chatSession.sessionMetas[sessionId]?.characterId },
    })
    scheduler.intake.record(stimulus, { ...decision, runId })
    scheduler.runs.transition(runId, 'working')
    const turnId = sparkReactionTurnId(event.data.id)
    speechRuntime.startVoiceTurn(turnId, sessionId)
    try {
      const result = await processSparkNotify(runId, event, control)
      if (result?.reaction)
        await writeReaction({ runId, sessionId, turnId, source: stimulus.source, reaction: result.reaction })
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
      // A reaction that still plays keeps the voice until its speech ends.
      speechRuntime.holdPlayback(turnId, runId)
      scheduler.leases.releaseAll(runId)
    }
  }

  /**
   * Writes a spoken reaction into the run's session as the character's own turn. No user turn is added.
   * Later turns in the session read it, or only its heard part after an interruption.
   */
  async function writeReaction(options: { runId: string, sessionId: string, turnId: string, source: string, reaction: string }) {
    let text = ''
    // History keeps the words only. Expression markers drive the stage and never reach later prompts.
    const parser = useLlmmarkerParser({ onLiteral: (literal) => {
      text += literal
    } })
    await parser.consume(options.reaction)
    await parser.end()
    text = text.trim()
    if (!text)
      return

    try {
      if (!await chatSession.loadSession(options.sessionId))
        throw new Error('Failed to load the reaction session')
      // The reaction read owner context, so the history label narrows like any assistant write.
      await chatSession.narrowSessionAudience(options.sessionId, OWNER_AUDIENCE)
      const messageId = nanoid()
      chatSession.appendSessionMessage(options.sessionId, {
        role: 'assistant',
        id: messageId,
        createdAt: Date.now(),
        content: text,
        slices: [{ type: 'text', text }],
        tool_results: [],
        proactive: { runId: options.runId, source: options.source },
      })
      speechRuntime.attachVoiceTurnMessage(options.turnId, messageId)
    }
    catch (error) {
      console.warn('[character-orchestrator] Failed to record the reaction in its session:', errorMessageFrom(error))
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
      runId: nanoid(),
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
    activeNotify = { runId, eventId: event.data.id, controller, interrupts: (scheduler.runs.get(runId)?.salience ?? 0) >= INTERRUPT_SALIENCE }
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

      // Every command passes admission for this run. A rejected command never reaches a module.
      for (const command of result.commands) {
        const delivery = sendAdmittedSparkCommand(runId, command)
        if (delivery?.rejected)
          console.warn('Spark notify command rejected:', delivery.rejected)
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
    return handleStimulus(stimulusFromNotify(event), event, control)
  }

  /**
   * Offers one stimulus with its notification form to intake.
   * Internal proposals skip the classifier, because their source already appraised them or a commitment made them due.
   */
  async function handleStimulus(stimulus: Stimulus, event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl) {
    // Hard constraints come first. No salience or classifier answer passes them.
    if (stimulus.coalesceKey) {
      for (const replaced of await notifyQueue.takeCoalesced(stimulus.coalesceKey)) {
        scheduler.leases.withdraw('voice', replaced.runId)
        scheduler.intake.record(replaced.stimulus, { outcome: 'merged', reason: 'coalesced', decidedBy: 'rule', mergedInto: stimulus.id })
      }
    }
    if (stimulus.deadlineAt !== undefined && stimulus.deadlineAt <= Date.now()) {
      scheduler.intake.record(stimulus, { outcome: 'ignored', reason: 'expired', decidedBy: 'rule' })
      return undefined
    }

    // A classifier can ignore the notification or reorder it. Its answer never grants authority.
    const appraisal = triage.classifier && stimulus.origin === 'external' ? await triage.appraiseNotification(stimulus) : undefined
    const appraised = appraisal ? decideByAppraisal(stimulus, appraisal) : undefined
    if (appraised?.outcome === 'ignored') {
      scheduler.intake.record(stimulus, appraised)
      return undefined
    }
    const ranked: Stimulus = { ...stimulus, salience: appraised?.salience ?? stimulus.salience }
    const now = Date.now()
    const entry = { runId: nanoid(), stimulus: ranked, event, control, enqueuedAt: now, attempts: 0, maxAttempts: attentionConfig.value.maxAttempts, reason: 'spark:notify' }
    // A proposal's source already chose its moment, so it waits only for the voice.
    const timing = { ...decideByPrior(ranked, { now, busy: false, retryAt: ranked.event === 'proposal' ? now : undefined }), appraisal }
    if (timing.outcome === 'ignored') {
      scheduler.intake.record(ranked, timing)
      return undefined
    }
    const coolingUntil = scheduler.errorBurst.coolingUntil()
    if (timing.outcome === 'admitted' && coolingUntil) {
      await defer(entry, { ...timing, outcome: 'deferred', reason: 'error-cooldown', retryAt: coolingUntil })
      return undefined
    }
    if (timing.outcome === 'admitted') {
      if (requestVoice(entry))
        return await runNotify(entry.runId, ranked, event, timing, control)
      await defer(entry, { ...timing, outcome: 'deferred', reason: 'resource-busy', retryAt: now })
      return undefined
    }
    await defer(entry, timing)
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

  /**
   * Offers an internal proposal to intake. It gets no authority from its internal origin.
   * A chain deeper than {@link MAX_PROPOSAL_DEPTH} is rejected, and proposals with one coalescing key replace each other.
   * An admitted proposal becomes a notification run, which can still choose silence. It adds no user turn to any session.
   */
  async function propose(proposal: { headline: string, note?: string, urgency?: 'immediate' | 'soon' | 'later', coalesceKey?: string, parentRunId?: string, depth?: number }) {
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'scheduler',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'ping',
        urgency: proposal.urgency ?? 'later',
        headline: proposal.headline,
        note: proposal.note,
        coalesceKey: proposal.coalesceKey,
        destinations: ['character'],
      },
    }
    const stimulus: Stimulus = { ...stimulusFromNotify(event, 'internal', 'proposal'), parentRunId: proposal.parentRunId, depth: proposal.depth ?? 0 }
    if ((stimulus.depth ?? 0) > MAX_PROPOSAL_DEPTH) {
      scheduler.intake.record(stimulus, { outcome: 'rejected', reason: 'depth-limit', decidedBy: 'rule' })
      return undefined
    }
    return handleStimulus(stimulus, event)
  }

  let lastAppraisalAt = 0
  let lastAppraisedState: string | undefined

  /**
   * Appraises the owner scene while no run is active, and proposes work when a confident classifier finds something worth raising.
   * The timer only starts an appraisal. It never schedules speech, and unchanged observations are not appraised again.
   */
  async function appraiseIdle(now = Date.now()) {
    const intervalMs = triageSettings.appraisalIntervalMinutes * 60_000
    if (!(intervalMs > 0) || !triage.classifier || now - lastAppraisalAt < intervalMs || scheduler.errorBurst.coolingUntil())
      return
    if (processing.value || scheduler.leases.holder('voice') || scheduler.runs.snapshot().some(run => run.state === 'queued' || run.state === 'working'))
      return
    lastAppraisalAt = now

    const observations = Object.values(chatContext.getContextsSnapshot({ ids: [chatSession.activeSessionId, 'character', OWNER_PRIVATE_BINDING], audience: OWNER_AUDIENCE }))
      .flat()
      .map(message => `${getEventSourceKey(message)}: ${message.text}`)
    const state = observations.join('\n')
    if (!state || state === lastAppraisedState)
      return
    lastAppraisedState = state

    const stimulus: Stimulus = { id: nanoid(), kind: 'idle-appraisal', origin: 'internal', source: 'scheduler', event: 'appraisal', bindings: [], salience: salienceFromUrgency('later'), receivedAt: now, text: state }
    const decision = decideByAppraisal(stimulus, await triage.appraiseIdle(stimulus))
    if (decision.outcome !== 'admitted' || decision.decidedBy !== 'classifier') {
      scheduler.intake.record(stimulus, { ...decision, outcome: 'ignored', reason: decision.outcome === 'ignored' ? decision.reason : 'nothing-to-raise' })
      return
    }
    scheduler.intake.record(stimulus, { ...decision, reason: 'proposed' })
    await propose({
      headline: 'Something in the current observations may be worth raising with the owner.',
      note: 'Nobody asked. Speak only if it fits now. Silence is a valid choice.',
      urgency: (decision.salience ?? stimulus.salience) >= 0.6 ? 'soon' : 'later',
      coalesceKey: 'idle-appraisal',
      parentRunId: undefined,
    })
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
    if (!leadership?.isLeader() || processing.value)
      return

    const now = Date.now()
    await enqueueDueTasks(now)
    await appraiseIdle(now)

    // Due entries compete for the voice by the lease line order, not by arrival.
    const due = scheduledNotifies.value
      .filter(item => item.nextRunAt <= now)
      .sort((a, b) => compareLeaseCandidates(
        { salience: a.stimulus.salience, deadlineAt: a.stimulus.deadlineAt, waitingSince: a.enqueuedAt },
        { salience: b.stimulus.salience, deadlineAt: b.stimulus.deadlineAt, waitingSince: b.enqueuedAt },
      ))
    const next = due[0]
    if (!next)
      return

    const decision = decideByPrior(next.stimulus, { now, busy: false, retryAt: next.nextRunAt })
    // During an error burst, due work stays in the queue until the cooldown ends.
    if (decision.outcome !== 'ignored' && (scheduler.errorBurst.coolingUntil() || !requestVoice(next)))
      return

    scheduledNotifies.value = scheduledNotifies.value.filter(item => item !== next)
    removePending(next.event.data.id)
    if (decision.outcome === 'ignored') {
      scheduler.leases.withdraw('voice', next.runId)
      scheduler.intake.record(next.stimulus, decision)
      return
    }

    try {
      await runNotify(next.runId, next.stimulus, next.event, decision, next.control)
    }
    catch (error) {
      if (!leadership?.isLeader())
        return
      if (next.attempts + 1 < next.maxAttempts) {
        const attempts = next.attempts + 1
        const retryAt = Date.now() + deferDelayMs(next.stimulus.salience) + attempts * attentionConfig.value.requeueDelayMs
        await defer({ ...next, runId: nanoid(), attempts }, { outcome: 'deferred', reason: 'retry', decidedBy: 'rule', retryAt })
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

    // A released voice or a finished run goes to the next candidate at once, instead of waiting for the next tick.
    eventUnsubscribes.push(scheduler.leases.subscribe(() => {
      queueMicrotask(() => void tick())
    }))
    eventUnsubscribes.push(scheduler.runs.subscribe((run) => {
      if (run.state !== 'queued' && run.state !== 'working')
        queueMicrotask(() => void tick())
    }))

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
    propose,
    appraiseIdle,
    handleSparkNotifyWithReaction,
    handleSparkEmit,
  }
})
