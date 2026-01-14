import type { Logg } from '@guiiai/logg'
import type { Neuri } from 'neuri'

import type { TaskExecutor } from '../action/task-executor'
import type { ActionInstruction } from '../action/types'
import type { EventManager } from '../perception/event-manager'
import type { PerceptionSignal } from '../perception/types/signals'
import type { ReflexManager } from '../reflex/reflex-manager'
import type { BotEvent, MineflayerWithAgents } from '../types'

import { system, user } from 'neuri/openai'

import { config } from '../../composables/config'
import { DebugService } from '../../debug'
import { Blackboard } from './blackboard'
import { buildConsciousContextView } from './context-view'
import { generateBrainSystemPrompt } from './prompts/brain-prompt'

interface BrainDeps {
  eventManager: EventManager
  neuri: Neuri
  logger: Logg
  taskExecutor: TaskExecutor
  reflexManager: ReflexManager
}

interface LLMResponse {
  thought: string
  blackboard: {
    UltimateGoal?: string
    CurrentTask?: string
    executionStrategy?: string
  }
  actions: ActionInstruction[]
}

interface QueuedEvent {
  event: BotEvent
  resolve: () => void
  reject: (err: Error) => void
}

export class Brain {
  private blackboard: Blackboard
  private debugService: DebugService

  private nextActionId = 1
  private inFlightActions = new Map<string, ActionInstruction>()

  private feedbackDebounceMs = Number.parseInt(process.env.BRAIN_FEEDBACK_DEBOUNCE_MS ?? '200')
  private feedbackDebounceTimer: NodeJS.Timeout | undefined

  private feedbackBarrierTimeoutMs = Number.parseInt(process.env.BRAIN_FEEDBACK_BARRIER_TIMEOUT_MS ?? '1000')
  private waitingForFeedbackIds = new Set<string>()
  private feedbackBarrierTimer: NodeJS.Timeout | undefined

  // Event Queue
  private queue: QueuedEvent[] = []
  private isProcessing = false

  constructor(private readonly deps: BrainDeps) {
    this.blackboard = new Blackboard()
    this.debugService = DebugService.getInstance()
  }

  public init(bot: MineflayerWithAgents): void {
    this.log('INFO', 'Brain: Initializing...')
    this.blackboard.update({ selfUsername: bot.username })

    // Perception Signal Handler - Only process chat messages for now
    this.deps.eventManager.on<PerceptionSignal>('perception', async (event) => {
      const signal = event.payload
      // Only handle chat messages in the deliberative layer
      if (signal.type !== 'chat_message')
        return

      this.log('INFO', `Brain: Received chat: ${signal.description}`)

      // Add to blackboard chat history
      // signal.description usually is "User: message"
      // We'll parse it simply or use the whole string as content if format varies
      // Assuming signal.description is the formatted message or we extract it.
      // Based on previous logs, it looks like "Sender: message"
      // Let's just use the description for now, or split it if possible.
      // Actually `signal.content` might hold the raw message if available, but checking types it seems signal has description and properties.
      // Let's assume description is "Sender: content" for now or just store it.
      // A better way is to try to parse it if needed, but for now we trust `signal.description`.

      const parts = signal.description.split(': ')
      const sender = parts.length > 1 ? parts[0] : 'Unknown'
      const content = parts.length > 1 ? parts.slice(1).join(': ') : signal.description

      this.blackboard.addChatMessage({
        sender,
        content,
        timestamp: Date.now(),
      })

      try {
        this.log('DEBUG', `Brain: About to enqueue chat event`)
        await this.enqueueEvent(bot, event)
        this.log('DEBUG', `Brain: Chat event enqueued successfully`)
      }
      catch (err) {
        this.log('ERROR', `Brain: Failed to enqueue chat event`, { error: err })
      }
    })

    // Listen to Task Execution Events (Action Feedback)
    this.deps.taskExecutor.on('action:started', ({ action }) => {
      const id = action.id
      if (id)
        this.inFlightActions.set(id, action)
      this.updatePendingActionsOnBlackboard()
    })

    this.deps.taskExecutor.on('action:completed', async ({ action, result }) => {
      this.log('INFO', `Brain: Action completed: ${action.type}`)

      const id = action.id
      if (id)
        this.inFlightActions.delete(id)
      if (id)
        this.waitingForFeedbackIds.delete(id)
      this.updatePendingActionsOnBlackboard()
      this.blackboard.addActionHistoryLine(this.formatActionHistoryLine(action, 'success', result))

      if (this.waitingForFeedbackIds.size === 0 && this.feedbackBarrierTimer) {
        clearTimeout(this.feedbackBarrierTimer)
        this.feedbackBarrierTimer = undefined
        void this.processQueue(bot)
      }

      if (!action.require_feedback)
        return

      await this.enqueueEvent(bot, {
        type: 'feedback',
        payload: {
          status: 'success',
          action,
          result,
        },
        source: { type: 'system', id: 'executor' },
        timestamp: Date.now(),
      })
    })

    this.deps.taskExecutor.on('action:failed', async ({ action, error }) => {
      this.log('WARN', `Brain: Action failed: ${action.type}`, { error })

      const id = action.id
      if (id)
        this.inFlightActions.delete(id)
      if (id)
        this.waitingForFeedbackIds.delete(id)
      this.updatePendingActionsOnBlackboard()
      this.blackboard.addActionHistoryLine(this.formatActionHistoryLine(action, 'failure', undefined, error))

      if (this.waitingForFeedbackIds.size === 0 && this.feedbackBarrierTimer) {
        clearTimeout(this.feedbackBarrierTimer)
        this.feedbackBarrierTimer = undefined
        void this.processQueue(bot)
      }

      await this.enqueueEvent(bot, {
        type: 'feedback',
        payload: {
          status: 'failure',
          action,
          error: error.message || error,
        },
        source: { type: 'system', id: 'executor' },
        timestamp: Date.now(),
      })
    })

    this.log('INFO', 'Brain: Online.')
    this.updateDebugState()
  }

  // --- Event Queue Logic ---

  private async enqueueEvent(bot: MineflayerWithAgents, event: BotEvent): Promise<void> {
    this.log('DEBUG', `Brain: Enqueueing event type=${event.type}`)
    return new Promise((resolve, reject) => {
      this.queue.push({ event, resolve, reject })
      this.log('DEBUG', `Brain: Queue length now: ${this.queue.length}`)
      this.updateDebugState()

      if (event.type === 'feedback' && this.feedbackDebounceMs > 0) {
        if (this.feedbackDebounceTimer)
          clearTimeout(this.feedbackDebounceTimer)
        this.feedbackDebounceTimer = setTimeout(() => {
          this.feedbackDebounceTimer = undefined
          void this.processQueue(bot)
        }, this.feedbackDebounceMs)
        return
      }

      void this.processQueue(bot)
    })
  }

  private async processQueue(bot: MineflayerWithAgents): Promise<void> {
    if (this.isProcessing) {
      this.log('DEBUG', 'Brain: Already processing, skipping')
      return
    }
    if (this.queue.length === 0) {
      this.log('DEBUG', 'Brain: Queue empty')
      return
    }

    this.log('DEBUG', `Brain: Processing queue item, queue length: ${this.queue.length}`)
    this.isProcessing = true
    const item = this.queue.shift()!
    this.log('DEBUG', `Brain: Processing event type=${item.event.type}`)
    this.updateDebugState(item.event)

    if (item.event.type === 'feedback' && this.waitingForFeedbackIds.size > 0) {
      // Defer feedback-triggered replans until the current "turn" feedback barrier is released.
      // We keep collecting feedback events into the queue, but we avoid calling the LLM on partial results.
      this.queue.unshift(item)
      this.isProcessing = false
      this.updateDebugState()
      return
    }

    // Coalesce consecutive feedback events into a single LLM turn.
    // This prevents the LLM from being spammed with partial results while still supporting streaming replans.
    const coalescedEvent = item.event.type === 'feedback'
      ? this.coalesceFeedbackEvents(item.event)
      : item.event

    try {
      await this.processEvent(bot, coalescedEvent)
      item.resolve()
    }
    catch (err) {
      this.log('ERROR', 'Brain: Error processing event', { error: err })
      item.reject(err as Error)
    }
    finally {
      this.isProcessing = false
      this.updateDebugState()
      // Context switch: Check queue again
      if (this.queue.length > 0) {
        setImmediate(() => this.processQueue(bot))
      }
    }
  }

  // --- Cognitive Cycle ---

  private contextFromEvent(event: BotEvent): string {
    switch (event.type) {
      case 'perception': {
        const signal = event.payload as PerceptionSignal
        const sourceInfo = signal.sourceId ? ` (source: ${signal.sourceId})` : ''
        return `Perception [${signal.type}]${sourceInfo}: ${signal.description}`
      }
      case 'feedback': {
        const payload = event.payload as any
        if (payload?.status === 'batch' && Array.isArray(payload.feedbacks)) {
          return `Internal Feedback (batched): ${JSON.stringify(payload.feedbacks)}`
        }

        const { status, action, result, error } = payload
        const actionCtx = action
          ? {
              id: action.id,
              type: action.type,
              ...(action.type === 'sequential' || action.type === 'parallel'
                ? { tool: action.step.tool, params: action.step.params }
                : { message: action.message }),
            }
          : undefined
        return `Internal Feedback: ${status}. Last Action: ${JSON.stringify(actionCtx)}. Result: ${JSON.stringify(result || error)}`
      }
      default:
        return ''
    }
  }

  private coalesceFeedbackEvents(first: BotEvent): BotEvent {
    const feedbacks: any[] = [first.payload]

    while (this.queue.length > 0 && this.queue[0]?.event.type === 'feedback') {
      const next = this.queue.shift()!
      feedbacks.push(next.event.payload)
      next.resolve()
    }

    if (feedbacks.length === 1)
      return first

    return {
      type: 'feedback',
      payload: {
        status: 'batch',
        feedbacks,
      },
      source: first.source,
      timestamp: first.timestamp,
    }
  }

  private ensureActionIds(actions: ActionInstruction[]): ActionInstruction[] {
    return actions.map((action) => {
      if (action.id)
        return action
      return {
        ...action,
        id: `a${this.nextActionId++}`,
      }
    })
  }

  private updatePendingActionsOnBlackboard(): void {
    const pending = [...this.inFlightActions.values()].map(a => this.formatPendingActionLine(a))
    if (this.waitingForFeedbackIds.size > 0)
      pending.unshift(`[barrier] waiting for ${this.waitingForFeedbackIds.size} required feedback(s)`)
    this.blackboard.setPendingActions(pending)
  }

  private formatPendingActionLine(action: ActionInstruction): string {
    if (action.type === 'chat')
      return `${action.id ?? '?'} chat: ${action.message}`
    return `${action.id ?? '?'} ${action.type}: ${action.step.tool} ${JSON.stringify(action.step.params ?? {})}`
  }

  private formatActionHistoryLine(
    action: ActionInstruction,
    status: 'success' | 'failure',
    result?: unknown,
    error?: unknown,
  ): string {
    const base = this.formatPendingActionLine(action)
    const suffix = status === 'success'
      ? `=> ok ${result ? JSON.stringify(result) : ''}`
      : `=> failed ${error instanceof Error ? error.message : JSON.stringify(error)}`
    return `${base} ${suffix}`
  }

  private async processEvent(bot: MineflayerWithAgents, event: BotEvent): Promise<void> {
    // OODA Loop: Observe -> Orient -> Decide -> Act

    // 1. Observe (Update Blackboard with Environment Sense)
    this.updatePerception(bot)

    // 2. Orient (Contextualize Event)
    // Environmental context are included in the system prompt blackboard
    const additionalCtx = this.contextFromEvent(event)

    // 3. Decide (LLM Call)
    const systemPrompt = generateBrainSystemPrompt(this.blackboard, this.deps.taskExecutor.getAvailableActions())
    const decision = await this.decide(systemPrompt, additionalCtx)

    if (!decision) {
      this.log('WARN', 'Brain: No decision made.')
      return
    }

    // 4. Act (Execute Decision)
    this.log('INFO', `Brain: Thought: ${decision.thought}`)

    // Update Blackboard
    this.blackboard.update({
      ultimateGoal: decision.blackboard.UltimateGoal || this.blackboard.ultimate_goal,
      currentTask: decision.blackboard.CurrentTask || this.blackboard.current_task,
      strategy: decision.blackboard.executionStrategy || this.blackboard.strategy,
    })

    // Sync Blackboard to Debug
    this.debugService.updateBlackboard(this.blackboard)

    // Issue Actions
    if (decision.actions && decision.actions.length > 0) {
      const actionsWithIds = this.ensureActionIds(decision.actions)

      // Start feedback barrier for this turn if any actions require feedback.
      const required = actionsWithIds.filter(a => a.require_feedback && a.id).map(a => a.id as string)
      if (required.length > 0) {
        required.forEach(id => this.waitingForFeedbackIds.add(id))

        if (this.feedbackBarrierTimer)
          clearTimeout(this.feedbackBarrierTimer)
        this.feedbackBarrierTimer = setTimeout(() => {
          this.feedbackBarrierTimer = undefined
          this.waitingForFeedbackIds.clear()
          this.updatePendingActionsOnBlackboard()
          void this.processQueue(bot)
        }, this.feedbackBarrierTimeoutMs)

        this.updatePendingActionsOnBlackboard()
      }

      // Record own chat actions to memory
      for (const action of actionsWithIds) {
        if (action.type === 'chat') {
          this.blackboard.addChatMessage({
            sender: config.bot.username || '[Me]',
            content: action.message,
            timestamp: Date.now(), // FIXME: should be the time the action was issued
          })
        }
      }

      this.deps.taskExecutor.executeActions(actionsWithIds)
    }
  }

  private updatePerception(_bot: MineflayerWithAgents): void {
    const ctx = this.deps.reflexManager.getContextSnapshot()
    const view = buildConsciousContextView(ctx)
    this.blackboard.updateContextView(view)

    // Sync Blackboard to Debug
    this.debugService.updateBlackboard(this.blackboard)
  }

  private async decide(sysPrompt: string, userMsg: string): Promise<LLMResponse | null> {
    try {
      const request_start = Date.now()
      const response = await this.deps.neuri.handleStateless(
        [
          system(sysPrompt),
          user(userMsg),
        ],
        async (ctx) => {
          const completion = await ctx.reroute('action', ctx.messages, {
            model: config.openai.model,
            response_format: { type: 'json_object' },
          } as any) as any

          // Trace LLM
          this.debugService.traceLLM({
            route: 'action',
            messages: ctx.messages,
            content: completion?.choices?.[0]?.message?.content,
            usage: completion?.usage,
            model: config.openai.model,
            duration: Date.now() - request_start,
          })

          if (!completion || !completion.choices?.[0]?.message?.content) {
            throw new Error('LLM failed to return content')
          }
          return completion.choices[0].message.content
        },
      )

      if (!response)
        return null
      // TODO: use toolcall instead of outputing json directly
      const parsed = JSON.parse(response) as LLMResponse
      return parsed
    }
    catch (err) {
      this.log('ERROR', 'Brain: Decision failed', { error: err })
      return null
    }
  }

  // --- Debug Helpers ---

  private log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, fields?: any) {
    // Dual logging: Console/File via Logger AND DebugServer
    if (level === 'ERROR')
      this.deps.logger.withError(fields?.error).error(message)
    else if (level === 'WARN')
      this.deps.logger.warn(message, fields)
    else this.deps.logger.log(message, fields)

    this.debugService.log(level, message, fields)
  }

  private updateDebugState(processingEvent?: BotEvent) {
    this.debugService.updateQueue(
      this.queue.map(q => q.event),
      processingEvent,
    )
  }
}
