import type { Logg } from '@guiiai/logg'

import type { TaskExecutor } from '../action/task-executor'
import type { ActionInstruction } from '../action/types'
import type { EventBus, TracedEvent } from '../os'
import type { PerceptionSignal } from '../perception/types/signals'
import type { ReflexManager } from '../reflex/reflex-manager'
import type { BotEvent, MineflayerWithAgents } from '../types'
import type { BlackboardState } from './blackboard'

import { config } from '../../composables/config'
import { DebugService } from '../../debug'
import { Blackboard } from './blackboard'
import { buildConsciousContextView } from './context-view'
import { LLMAgent } from './llm-agent'
import {
  actionsToFunctionCalls,
  buildMessages,
  clearAsyncActionQueue,
  drainAsyncActionQueue,
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
}

interface DecisionResult {
  success: boolean
  decision?: LLMResponse
  queuedActions?: ActionInstruction[]
  error?: {
    message: string
    attempts: number
    status?: number
    code?: string
  }
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
    this.consciousLog('perception:received', {
      type: signal.type,
      description: signal.description,
      sourceId: signal.sourceId,
    })

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
    this.consciousLog('brain:init', { username: bot.username })
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
      this.consciousLog('action:started', { action })
    })

    this.deps.taskExecutor.on('action:completed', async ({ action, result }) => {
      this.consciousLog('action:completed', { action, result })
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
      this.consciousLog('action:failed', { action, error: toErrorMessage(error) })

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

    this.consciousLog('brain:online', { blackboard: this.snapshotBlackboard() })
    this.updateDebugState()
  }

  public destroy(): void {
  }

  // --- Event Queue Logic ---

  private async enqueueEvent(bot: MineflayerWithAgents, event: BotEvent): Promise<void> {
    this.consciousLog('queue:enqueue', { type: event.type, source: event.source })
    return new Promise((resolve, reject) => {
      this.queue.push({ event, resolve, reject })
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
    if (this.isProcessing)
      return
    if (this.queue.length === 0)
      return

    this.consciousLog('queue:process:start', { length: this.queue.length })
    this.isProcessing = true
    const item = this.queue.shift()!
    this.consciousLog('queue:event', { type: item.event.type })
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
      this.consciousLog('queue:process:error', { error: toErrorMessage(err) })
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
    const result = await this.decide(systemPrompt, userMsg)

    if (!result.success || !result.decision) {
      const { error } = result
      const cause = error
        ? `cause: ${error.message}${error.status ? ` (status: ${error.status})` : ''}${error.code ? ` (code: ${error.code})` : ''}`
        : 'unknown cause'
      this.consciousLog('decision:error', { attempts: error?.attempts, cause })
      return
    }

    // 4. Act (Execute Decision)
    this.applyDecision(result.decision, result.queuedActions ?? [])
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

  private applyDecision(decision: LLMResponse, queuedActions: ActionInstruction[]): void {
    this.consciousLog('decision:applied', {
      thought: decision.thought,
      actions: queuedActions.map(a => ({ id: a.id, action: a.action, params: a.params })),
      blackboard: decision.blackboard,
    })

    this.updateBlackboardFromDecision(decision)
    this.debugService.updateBlackboard(this.blackboard)

    // Execute queued async actions from function calls
    if (queuedActions.length > 0) {
      const actionsWithIds = this.ensureActionIds(queuedActions)
      this.recordChatActions(actionsWithIds)
      this.deps.taskExecutor.executeActions(actionsWithIds)
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

  private async decide(sysPrompt: string, userMsg: string): Promise<DecisionResult> {
    const maxAttempts = 3

    const llmAgent = new LLMAgent({
      baseURL: config.openai.baseUrl,
      apiKey: config.openai.apiKey,
      model: config.openai.model,
    })

    const decideOnce = async (): Promise<{ response: LLMResponse, queuedActions: ActionInstruction[] } | null> => {
      const messages = buildMessages(sysPrompt, userMsg)
      const tools = this.bot ? actionsToFunctionCalls(this.deps.taskExecutor.getAvailableActions(), this.bot) : undefined

      this.consciousLog('llm:request', {
        route: 'brain:decide',
        messageCount: messages.length,
        tools: tools?.length ?? 0,
        systemPromptSize: sysPrompt.length,
        userMsg,
        blackboard: this.snapshotBlackboard(),
      })

      // Clear async action queue before LLM generation
      clearAsyncActionQueue()

      try {
        const result = await llmAgent.callLLM({
          messages,
          responseFormat: { type: 'json_object' },
          tools,
        })

        // Drain queued async actions (populated during tool execution)
        const queuedActions = drainAsyncActionQueue()

        this.debugService.traceLLM({
          route: 'brain:decide',
          messages,
          content: result.text,
          usage: result.usage,
          model: config.openai.model,
          duration: undefined,
        })

        if (!result.text) {
          throw new Error('LLM failed to return content')
        }

        const parsed = parseLLMResponseJson<LLMResponse>(result.text)

        return { response: parsed, queuedActions }
      }
      finally {
        // Ensure no stale queued actions leak across retry attempts.
        clearAsyncActionQueue()
      }
    }

    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await decideOnce()
        if (result) {
          this.consciousLog('decision:received', {
            attempt,
            thought: result.response.thought,
            actions: result.queuedActions.map(a => ({ id: a.id, action: a.action })),
            blackboard: result.response.blackboard,
          })
          return { success: true, decision: result.response, queuedActions: result.queuedActions }
        }
      }
      catch (err) {
        lastError = err
        const remaining = maxAttempts - attempt
        const { shouldRetry } = shouldRetryError(err, remaining)

        this.consciousLog('decision:attempt_failed', {
          attempt,
          remaining,
          shouldRetry,
          status: getErrorStatus(err),
          code: getErrorCode(err),
          error: toErrorMessage(err),
        })

        if (shouldRetry) {
          await new Promise(resolve => setTimeout(resolve, 100)) // backoff, is this needed?
          continue
        }

        const errMsg = toErrorMessage(err)

        return {
          success: false,
          error: {
            message: errMsg,
            attempts: attempt,
            status: getErrorStatus(err),
            code: getErrorCode(err),
          },
        }
      }
    }

    // All attempts exhausted without explicit non-retryable error
    const errMsg = lastError ? toErrorMessage(lastError) : 'All retry attempts exhausted'
    return {
      success: false,
      error: {
        message: errMsg,
        attempts: maxAttempts,
        status: lastError ? getErrorStatus(lastError) : undefined,
        code: lastError ? getErrorCode(lastError) : undefined,
      },
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

  private consciousLog(message: string, fields?: Record<string, unknown>) {
    this.debugService.log('INFO', `[Conscious] ${message}`, fields)
  }

  private snapshotBlackboard(): BlackboardState {
    return this.blackboard.getSnapshot()
  }

  private updateDebugState(processingEvent?: BotEvent) {
    this.debugService.updateQueue(
      this.queue.map(q => q.event),
      processingEvent,
    )
  }
}
