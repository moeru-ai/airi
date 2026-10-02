import type { DueRecipe, IntakeDecision, Stimulus } from '@proj-airi/core-agent'
import type { SparkNotifyResponseControl } from '@proj-airi/core-agent/agents/spark-notify'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import type { RecipeRunSettled } from '../../chat'
import type { ScheduledSparkNotify } from './queue'

import { errorMessageFrom } from '@moeru/std'
import { audienceIncludes, compareLeaseCandidates, decideByAppraisal, decideByPrior, deferDelayMs, dueTriggeredRecipes, OWNER_AUDIENCE, OWNER_PRIVATE_BINDING, salienceFromUrgency, superviseRun, useLlmmarkerParser } from '@proj-airi/core-agent'
import { createSparkNotifyAgent, createSparkNotifyReactionPlugin, getEventSourceKey } from '@proj-airi/core-agent/agents/spark-notify'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { onScopeDispose, ref } from 'vue'

import { sparkReactionTurnId, useCharacterNotebookStore, useCharacterStore } from '../'
import { useAiriRuntimePrompt } from '../../../composables/use-airi-runtime-prompt'
import { useLLM } from '../../ai/chat-llm/llm'
import { useChatStore } from '../../chat'
import { useChatContextStore } from '../../chat/context-store'
import { useChatSessionStore } from '../../chat/session-store'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { sendAdmittedSparkCommand } from '../../mods/api/spark-command'
import { useAiriCardStore } from '../../modules/airi-card'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useModelProfilesStore } from '../../modules/model-profiles'
import { useTriageStore } from '../../modules/triage'
import { useRecipesStore } from '../../recipes'
import { useSchedulerStore } from '../../scheduler'
import { useSettingsRunLimits } from '../../settings/run-limits'
import { useSpeechRuntimeStore } from '../../speech-runtime'
import { useCharacterMoodStore } from '../mood'
import { useCharacterNotifyQueueStore } from './queue'

export { sparkNotifyCommandSchema } from '@proj-airi/core-agent/agents/spark-notify'

/** Internal proposals can propose further work only this many levels deep. */
export const MAX_PROPOSAL_DEPTH = 2
/** Characters of a recipe result that travel in the note. The rest stays in the recipe's session, which the reference names. */
const RECIPE_RESULT_NOTE_LIMIT = 1500

/** Salience at which a notification interrupts current speech at a sentence boundary. */
export const INTERRUPT_SALIENCE = 0.85

export const useCharacterOrchestratorStore = defineStore('character-orchestrator', () => {
  const { stream } = useLLM()
  const consciousnessStore = useConsciousnessStore()
  const { activeProvider, activeModel } = storeToRefs(consciousnessStore)
  const characterStore = useCharacterStore()
  const notebookStore = useCharacterNotebookStore()
  const runtimePrompt = useAiriRuntimePrompt()
  const modsServerChannelStore = useModsServerChannelStore()
  const chatSession = useChatSessionStore()
  const scheduler = useSchedulerStore()
  const speechRuntime = useSpeechRuntimeStore()
  const modelProfiles = useModelProfilesStore()
  const mood = useCharacterMoodStore()
  const airiCard = useAiriCardStore()
  const triage = useTriageStore()
  const runLimits = useSettingsRunLimits()
  const chatContext = useChatContextStore()
  const recipes = useRecipesStore()

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
  let activeNotify: { runId: string, eventId: string, controller: AbortController, interrupts: boolean, onActivity: () => void } | undefined
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
          onStreamEvent: async (event) => {
            // Stream activity keeps a notification run alive, like a chat run.
            activeNotify?.onActivity()
            await request.onStreamEvent?.(event)
          },
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

  /** The persona of a session. A session without one uses the selected card. */
  function personaOf(sessionId: string) {
    return chatSession.sessionMetas[sessionId]?.characterId || airiCard.activeCardId || 'default'
  }

  /** The persona's mood, while mood has an update path. */
  function moodOf(personaId: string) {
    return mood.active ? mood.current(personaId) : undefined
  }

  /**
   * Moves the persona's mood after an interaction. It runs beside the work and never delays it.
   * Background limits pause it like any other classifier request.
   */
  function appraiseMood(personaId: string, interaction: string) {
    if (!mood.active || scheduler.errorBurst.coolingUntil() || modelProfiles.spendingPausedUntil() !== undefined)
      return
    const card = airiCard.getCard(personaId)
    void mood.appraise(personaId, { persona: [card?.description, card?.personality].filter(Boolean).join('\n'), interaction }).catch((error) => {
      console.warn('[character-orchestrator] Mood appraisal failed:', errorMessageFrom(error))
    })
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
    // A proposal can continue the session that asked for it, so a result returns where its task began.
    const sessionId = stimulus.sessionId ?? chatSession.activeSessionId
    const salience = decision.salience ?? stimulus.salience
    scheduler.runs.admit({
      runId,
      salience,
      envelope: { sessionId, bindings: [], outputs: ['voice'], audience: OWNER_AUDIENCE, personaId: chatSession.sessionMetas[sessionId]?.characterId },
    })
    scheduler.intake.record(stimulus, { ...decision, runId })
    scheduler.runs.transition(runId, 'working')
    // An urgent event can change the mood while its reaction runs.
    if (salience >= INTERRUPT_SALIENCE)
      appraiseMood(personaOf(sessionId), `Event from ${stimulus.source}: ${event.data.headline}${event.data.note ? `\n${event.data.note}` : ''}`)
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
      // A reaction speaks for the owner and reads owner context. It joins only a session that only the owner reads.
      // Writing it elsewhere would narrow a shared scene session while its waiting runs still expect the wider audience.
      if (!audienceIncludes(OWNER_AUDIENCE, chatSession.getSessionAudience(options.sessionId) ?? OWNER_AUDIENCE))
        return
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
    // Notification runs follow the same stall and deadline limits as chat runs, so a stalled provider never keeps the voice.
    const { stallTimeoutMs, runDeadlineMs } = runLimits.limits
    let expiry: string | undefined
    const supervisor = superviseRun({ stallTimeoutMs, deadlineMs: runDeadlineMs }, (reason) => {
      if (controller.signal.aborted)
        return
      expiry = reason
      characterStore.cancelSparkNotifyReaction(event.data.id)
      controller.abort(new Error(reason))
    })
    activeNotify = {
      runId,
      eventId: event.data.id,
      controller,
      interrupts: (scheduler.runs.get(runId)?.salience ?? 0) >= INTERRUPT_SALIENCE,
      onActivity: () => supervisor.touch(),
    }
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
        // The reaction speaks as the persona of the session it joins, not the card selected in the UI.
        systemPrompt: airiCard.systemPromptOf(personaOf(chatSession.activeSessionId)),
        // A reaction speaks in the same mood as the conversation.
        runtimePrompt: [runtimePrompt.value, mood.active ? mood.describe(personaOf(chatSession.activeSessionId)) : ''].filter(Boolean).join('\n'),
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
    catch (error) {
      // Supervision ends the run as expired. The caller keeps that final state.
      if (expiry)
        scheduler.runs.transition(runId, 'expired', expiry)
      throw error
    }
    finally {
      supervisor.stop()
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

    // A reached spending limit pauses background work before any classifier request costs more. The work waits, never dropped.
    const spendingPausedUntil = modelProfiles.spendingPausedUntil()
    if (spendingPausedUntil !== undefined) {
      await defer({ runId: nanoid(), stimulus, event, control, enqueuedAt: Date.now(), attempts: 0, maxAttempts: attentionConfig.value.maxAttempts, reason: 'spark:notify' }, { outcome: 'deferred', reason: 'spending-limit', decidedBy: 'rule', retryAt: spendingPausedUntil })
      return undefined
    }

    // A classifier can ignore the notification or reorder it. Its answer never grants authority.
    const appraisal = triage.classifier && stimulus.origin === 'external' ? await triage.appraiseNotification(stimulus, moodOf(personaOf(chatSession.activeSessionId))) : undefined
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
  async function propose(proposal: { headline: string, note?: string, urgency?: 'immediate' | 'soon' | 'later', coalesceKey?: string, parentRunId?: string, depth?: number, sessionId?: string }) {
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
    const stimulus: Stimulus = { ...stimulusFromNotify(event, 'internal', 'proposal'), parentRunId: proposal.parentRunId, depth: proposal.depth ?? 0, ...(proposal.sessionId ? { sessionId: proposal.sessionId } : {}) }
    if ((stimulus.depth ?? 0) > MAX_PROPOSAL_DEPTH) {
      scheduler.intake.record(stimulus, { outcome: 'rejected', reason: 'depth-limit', decidedBy: 'rule' })
      return undefined
    }
    return handleStimulus(stimulus, event)
  }

  /**
   * Offers a finished task recipe's result to its conversation as an internal stimulus.
   * The note carries a short copy and a reference back to the recipe run, so the result is never only a summary.
   */
  async function relayRecipeResult(settled: RecipeRunSettled) {
    const reference = `Source: recipe run ${settled.runId}${settled.messageId ? `, message ${settled.messageId}` : ''} in session ${settled.sessionId}.`
    await propose({
      headline: settled.ok ? `Your recipe "${settled.recipe.name}" finished its task.` : `Your recipe "${settled.recipe.name}" could not finish its task.`,
      note: `${settled.text.trim().slice(0, RECIPE_RESULT_NOTE_LIMIT) || 'It returned nothing.'}\n${reference}`,
      urgency: 'soon',
      coalesceKey: `recipe-result:${settled.runId}`,
      parentRunId: settled.runId,
      depth: 1,
      sessionId: settled.parentSessionId,
    })
  }

  let triggersStartedAt: number | undefined
  const triggerFiredAt: Record<string, number> = {}

  /** Latest observation per registered source that the owner scene can read. Event triggers follow these. */
  function latestObservations() {
    const snapshot = chatContext.getContextsSnapshot({ ids: [chatSession.activeSessionId, 'character', OWNER_PRIVATE_BINDING], audience: OWNER_AUDIENCE })
    const latest: Record<string, { createdAt: number, text: string }> = {}
    for (const message of Object.values(snapshot).flat()) {
      const source = getEventSourceKey(message)
      if (!latest[source] || message.createdAt > latest[source].createdAt)
        latest[source] = { createdAt: message.createdAt, text: message.text }
    }
    return latest
  }

  /** The task a triggered recipe receives: why it started, with the observation that fired an event trigger. */
  function triggerTask(due: DueRecipe, silentMinutes: number, now: number) {
    const time = `Local time: ${new Date(now).toLocaleString()}.`
    if (due.trigger.kind === 'idle')
      return `${time} The owner has sent no message for ${silentMinutes} minutes.`
    if (due.trigger.kind === 'event' && due.observation)
      return `${time} New observation from ${due.observation.source}: ${due.observation.text}`
    return `${time} Your scheduled time came.`
  }

  /**
   * Starts the owner's auto-run recipes whose trigger is due. Each one runs in its own session as derived work without voice.
   * Its result returns to the active owner conversation, which decides what to say. Without a due recipe, nothing is asked or called.
   */
  async function runRecipeTriggers(now: number) {
    triggersStartedAt ??= now
    // A paused budget or a cooling error burst holds the triggers. They fire after the pause, and no gate is asked meanwhile.
    if (modelProfiles.spendingPausedUntil() !== undefined || scheduler.errorBurst.coolingUntil())
      return
    const parentSessionId = chatSession.activeSessionId
    const lastOwnerMessageAt = chatSession.getSessionMessagesIfLoaded(parentSessionId)?.findLast(message => message.role === 'user')?.createdAt
    const due = dueTriggeredRecipes(recipes.recipes, { now, startedAt: triggersStartedAt, lastOwnerMessageAt, firedAt: triggerFiredAt, observations: latestObservations() })
    if (!due.length)
      return
    // A trigger fires once whether its gate allows the run or not, so a gate never asks again in the same period.
    for (const entry of due)
      triggerFiredAt[entry.recipe.id] = now
    const silentMinutes = Math.round((now - (lastOwnerMessageAt ?? triggersStartedAt)) / 60_000)
    const scene = [
      `Local time: ${new Date(now).toLocaleString()}. The owner's last message was ${silentMinutes} minutes ago.`,
      ...due.flatMap(entry => entry.observation ? [`New observation from ${entry.observation.source}: ${entry.observation.text}`] : []),
    ].join('\n')
    const allowed = new Set((await triage.passRecipeGates(due.map(entry => entry.recipe), scene)).map(recipe => recipe.id))
    for (const entry of due.filter(entry => allowed.has(entry.recipe.id)))
      await useChatStore().startRecipe(entry.recipe, { parentSessionId, task: triggerTask(entry, silentMinutes, now) })
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
    await runRecipeTriggers(now)

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
    // During an error burst or a reached spending limit, due work stays in the queue.
    if (decision.outcome !== 'ignored' && (scheduler.errorBurst.coolingUntil() || modelProfiles.spendingPausedUntil() !== undefined || !requestVoice(next)))
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

    // Each finished conversation turn can move the mood of its persona. A recipe's own session is work, not conversation.
    eventUnsubscribes.push(useChatStore().onChatTurnComplete(async (turn, context) => {
      if (!leadership?.isLeader() || !context.sessionId || chatSession.sessionMetas[context.sessionId]?.recipeId)
        return
      const content = context.message.content
      const owner = typeof content === 'string' ? content : Array.isArray(content) ? content.flatMap(part => part.type === 'text' ? [part.text] : []).join(' ') : ''
      appraiseMood(personaOf(context.sessionId), `Owner: ${owner}\nCharacter: ${turn.outputText}`)
    }))

    // A task recipe's result returns to the conversation that started it. The conversation decides what to tell the owner.
    eventUnsubscribes.push(useChatStore().onRecipeRunSettled((settled) => {
      if (!leadership?.isLeader())
        return
      void relayRecipeResult(settled).catch((error) => {
        console.warn('[character-orchestrator] Failed to return a recipe result:', errorMessageFrom(error))
      })
    }))

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
    runRecipeTriggers,
    relayRecipeResult,
    handleSparkNotifyWithReaction,
    handleSparkEmit,
  }
})
