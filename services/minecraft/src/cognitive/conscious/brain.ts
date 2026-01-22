import type { Logg } from '@guiiai/logg'

import type { TaskExecutor } from '../action/task-executor'
import type { ActionInstruction } from '../action/types'
import type { EventBus, TracedEvent } from '../os'
import type { PerceptionSignal } from '../perception/types/signals'
import type { ReflexManager } from '../reflex/reflex-manager'
import type { BotEvent, MineflayerWithAgents } from '../types'

import { config } from '../../composables/config'
import { DebugService } from '../../debug'
import { Blackboard } from './blackboard'
import { buildConsciousContextView } from './context-view'
import { LLMAgent } from './llm-agent'
import {
  buildMessages,
  getErrorCode,
  getErrorStatus,
  parseLLMResponseJson,
  shouldRetryError,
  toErrorMessage,
} from './llmlogic'
import { generateBrainSystemPrompt } from './prompts/brain-prompt'

interface BrainDeps {
  eventBus: EventBus
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

  private bot: MineflayerWithAgents | undefined

  private nextActionId = 1
  private inFlightActions = new Map<string, ActionInstruction>()

  private feedbackDebounceMs = Number.parseInt(process.env.BRAIN_FEEDBACK_DEBOUNCE_MS ?? '200')
  private feedbackDebounceTimer: NodeJS.Timeout | undefined

  // Event Queue
  private queue: QueuedEvent[] = []
  private isProcessing = false

  constructor(private readonly deps: BrainDeps) {
    this.blackboard = new Blackboard()
    this.debugService = DebugService.getInstance()
  }

  private async handlePerceptionSignal(bot: MineflayerWithAgents, signal: PerceptionSignal): Promise<void> {
    this.log('INFO', `Brain: Received perception: ${signal.description}`)

    if (signal.type === 'chat_message') {
      const parts = signal.description.split(': ')
      const sender = parts.length > 1 ? parts[0] : 'Unknown'
      const content = parts.length > 1 ? parts.slice(1).join(': ') : signal.description

      this.blackboard.addChatMessage({
        sender,
        content,
        timestamp: Date.now(),
      })
    }

    await this.enqueueEvent(bot, {
      type: 'perception',
      payload: signal,
      source: {
        type: 'minecraft',
        id: signal.sourceId ?? 'perception',
      },
      timestamp: Date.now(),
    })
  }

  public init(bot: MineflayerWithAgents): void {
    this.log('INFO', 'Brain: Initializing...')
    this.bot = bot
    this.blackboard.update({ selfUsername: bot.username })

    const handleSignal = async (signal: PerceptionSignal) => {
      try {
        await this.handlePerceptionSignal(bot, signal)
      }
      catch (err) {
        this.log('ERROR', 'Brain: Failed to enqueue perception signal', { error: err })
      }
    }

    // Conscious Signal Handler - signals must pass through Reflex first
    // EventBus supports pattern wildcards like 'conscious:signal:*'
    this.deps.eventBus.subscribe<PerceptionSignal>('conscious:signal:*', (event: TracedEvent<PerceptionSignal>) => {
      void handleSignal(event.payload)
    })

    // Listen to Task Execution Events (Action Feedback)
    this.deps.taskExecutor.on('action:started', ({ action }) => {
      const { id } = action
      if (id)
        this.inFlightActions.set(id, action)
      this.updatePendingActionsOnBlackboard()
    })

    this.deps.taskExecutor.on('action:completed', async ({ action, result }) => {
      this.log('INFO', `Brain: Action completed: ${action.action}`)

      const { id } = action
      if (id)
        this.inFlightActions.delete(id)
      this.updatePendingActionsOnBlackboard()
      this.blackboard.addActionHistoryLine(this.formatActionHistoryLine(action, 'success', result))

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
      this.log('WARN', `Brain: Action failed: ${action.action}`, { error })

      const { id } = action
      if (id)
        this.inFlightActions.delete(id)
      this.updatePendingActionsOnBlackboard()
      this.blackboard.addActionHistoryLine(this.formatActionHistoryLine(action, 'failure', undefined, error))

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

  public destroy(): void {
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
              action: action.action,
              params: action.params,
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
    this.blackboard.setPendingActions(pending)
  }

  private formatPendingActionLine(action: ActionInstruction): string {
    return `${action.id ?? '?'} ${action.action} ${JSON.stringify(action.params ?? {})}`
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

    // 2. Orient (Contextualize Event) + 3. Decide (LLM Call)
    const { systemPrompt, userMsg } = this.buildDecisionPrompts(event)
    const decision = await this.decide(systemPrompt, userMsg)

    if (!decision) {
      this.log('WARN', 'Brain: No decision made.')
      return
    }

    // 4. Act (Execute Decision)
    this.applyDecision(decision)
  }

  private buildDecisionPrompts(event: BotEvent): { systemPrompt: string, userMsg: string } {
    // Environmental context are included in the system prompt blackboard
    const userMsg = this.contextFromEvent(event)
    const systemPrompt = generateBrainSystemPrompt(
      this.blackboard,
      this.deps.taskExecutor.getAvailableActions(),
    )

    return { systemPrompt, userMsg }
  }

  private applyDecision(decision: LLMResponse): void {
    this.log('INFO', `Brain: Thought: ${decision.thought}`)

    this.updateBlackboardFromDecision(decision)
    this.debugService.updateBlackboard(this.blackboard)

    if (decision.actions && decision.actions.length > 0) {
      const actionsWithIds = this.ensureActionIds(decision.actions)
      if (actionsWithIds.length > 0) {
        this.recordChatActions(actionsWithIds)
        this.deps.taskExecutor.executeActions(actionsWithIds)
      }
    }
  }

  private updateBlackboardFromDecision(decision: LLMResponse): void {
    const bb = decision.blackboard
    this.blackboard.update({
      ultimateGoal: bb?.UltimateGoal || this.blackboard.ultimate_goal,
      currentTask: bb?.CurrentTask || this.blackboard.current_task,
      strategy: bb?.executionStrategy || this.blackboard.strategy,
    })
  }

  private recordChatActions(actions: ActionInstruction[]): void {
    for (const action of actions) {
      if (action.action !== 'chat')
        continue

      const message = (action.params as any)?.message
      if (typeof message !== 'string' || message.trim().length === 0)
        continue

      this.blackboard.addChatMessage({
        sender: config.bot.username || '[Me]',
        content: message,
        timestamp: Date.now(), // FIXME: should be the time the action was issued
      })
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
    const maxAttempts = 3

    const llmAgent = new LLMAgent({
      baseURL: config.openai.baseUrl,
      apiKey: config.openai.apiKey,
      model: config.openai.model,
    })

    const decideOnce = async (): Promise<LLMResponse | null> => {
      const messages = buildMessages(sysPrompt, userMsg)

      const result = await llmAgent.callLLM({
        messages,
        responseFormat: { type: 'json_object' },
      })

      if (!result.text) {
        throw new Error('LLM failed to return content')
      }

      return parseLLMResponseJson<LLMResponse>(result.text)
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await decideOnce()
      }
      catch (err) {
        const remaining = maxAttempts - attempt
        const { shouldRetry } = shouldRetryError(err, remaining)

        this.log('ERROR', 'Brain: Decision attempt failed', {
          error: err,
          attempt,
          remaining,
          shouldRetry,
          status: getErrorStatus(err),
          code: getErrorCode(err),
        })

        if (shouldRetry)
          continue

        const errMsg = toErrorMessage(err)

        try {
          this.bot?.bot?.chat?.(`[Brain] decide failed: ${errMsg}`)
        }
        catch (chatErr) {
          this.log('ERROR', 'Brain: Failed to send error message to chat', { error: chatErr })
        }

        return null
      }
    }

    return null
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
