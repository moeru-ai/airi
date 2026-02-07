import type { Logg } from '@guiiai/logg'
import type { Message } from '@xsai/shared-chat'

import type { Action } from '../../libs/mineflayer/action'
import type { TaskExecutor } from '../action/task-executor'
import type { ActionInstruction } from '../action/types'
import type { EventBus, TracedEvent } from '../os'
import type { PerceptionSignal } from '../perception/types/signals'
import type { ReflexManager } from '../reflex/reflex-manager'
import type { BotEvent, MineflayerWithAgents } from '../types'
import type { PlannerGlobalDescriptor } from './js-planner'
import type { LLMAgent } from './llm-agent'
import type { LlmLogEntry, LlmLogEntryKind } from './llm-log'
import type { CancellationToken } from './task-state'

import { config } from '../../composables/config'
import { DebugService } from '../../debug'
import { buildConsciousContextView } from './context-view'
import { JavaScriptPlanner } from './js-planner'
import { createLlmLogRuntime } from './llm-log'
import {
  isLikelyAuthOrBadArgError,
  isRateLimitError,
  shouldRetryError,
  sleep,
  toErrorMessage,
} from './llmlogic'
import { generateBrainSystemPrompt } from './prompts/brain-prompt'
import { normalizeReplScript } from './repl-code-normalizer'
import { createCancellationToken } from './task-state'

interface BrainDeps {
  eventBus: EventBus
  llmAgent: LLMAgent
  logger: Logg
  taskExecutor: TaskExecutor
  reflexManager: ReflexManager
}

interface QueuedEvent {
  event: BotEvent
  resolve: () => void
  reject: (err: Error) => void
}

interface ReplOutcomeSummary {
  actionCount: number
  okCount: number
  errorCount: number
  returnValue?: string
  logs: string[]
  updatedAt: number
}

interface DebugReplResult {
  source: 'manual' | 'llm'
  code: string
  logs: string[]
  actions: Array<{
    tool: string
    params: Record<string, unknown>
    ok: boolean
    result?: string
    error?: string
  }>
  returnValue?: string
  error?: string
  durationMs: number
  timestamp: number
}

interface LlmInputSnapshot {
  systemPrompt: string
  userMessage: string
  messages: Message[]
  conversationHistory: Message[]
  updatedAt: number
  attempt: number
}

interface LlmTraceEntry {
  id: number
  turnId: number
  timestamp: number
  eventType: string
  sourceType: string
  sourceId: string
  attempt: number
  model: string
  messages: Message[]
  content: string
  reasoning?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  durationMs: number
}

interface RuntimeInputEnvelope {
  id: number
  turnId: number
  timestamp: number
  event: {
    type: string
    sourceType: string
    sourceId: string
    payload: unknown
  }
  contextView: string
  userMessage: string
  systemPrompt: {
    preview: string
    length: number
  }
  llm?: {
    attempt: number
    model: string
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
  }
}

type ActionQueueEntryState = 'pending' | 'executing' | 'succeeded' | 'failed' | 'cancelled'

interface ActionQueueEntryView {
  id: number
  tool: string
  params: Record<string, unknown>
  state: ActionQueueEntryState
  enqueuedAt: number
  sourceTurnId: number
  startedAt?: number
  finishedAt?: number
  result?: unknown
  error?: string
}

interface ActionQueueSnapshot {
  executing: ActionQueueEntryView | null
  pending: ActionQueueEntryView[]
  recent: ActionQueueEntryView[]
  capacity: {
    total: number
    executing: number
    pending: number
  }
  counts: {
    total: number
    executing: number
    pending: number
  }
  updatedAt: number
}

interface ControlActionQueueEntry {
  id: number
  action: ActionInstruction
  sourceTurnId: number
  state: ActionQueueEntryState
  enqueuedAt: number
  startedAt?: number
  finishedAt?: number
  result?: unknown
  error?: string
}

function truncateForPrompt(value: string, maxLength = 220): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`
}

function stringifyForLog(value: unknown): string {
  if (typeof value === 'string')
    return value
  try {
    return JSON.stringify(value)
  }
  catch {
    return String(value)
  }
}

const NO_ACTION_FOLLOWUP_SOURCE_ID = 'brain:no_action_followup'

/**
 * Priority tiers for event scheduling (lower = higher priority).
 * Player chat always takes precedence over stale system feedback.
 */
const EVENT_PRIORITY_PLAYER_CHAT = 0
const EVENT_PRIORITY_PERCEPTION = 1
const EVENT_PRIORITY_FEEDBACK = 2
const EVENT_PRIORITY_NO_ACTION_FOLLOWUP = 3
const MAX_QUEUED_CONTROL_ACTIONS = 5
const MAX_PENDING_CONTROL_ACTIONS = 4
const ACTION_QUEUE_RECENT_HISTORY_LIMIT = 20

function getEventPriority(event: BotEvent): number {
  if (event.type === 'perception') {
    const signal = event.payload as PerceptionSignal
    if (signal.type === 'chat_message')
      return EVENT_PRIORITY_PLAYER_CHAT
    return EVENT_PRIORITY_PERCEPTION
  }
  if (event.source.type === 'system' && event.source.id === NO_ACTION_FOLLOWUP_SOURCE_ID)
    return EVENT_PRIORITY_NO_ACTION_FOLLOWUP
  if (event.type === 'feedback')
    return EVENT_PRIORITY_FEEDBACK
  return EVENT_PRIORITY_PERCEPTION
}

export class Brain {
  private debugService: DebugService
  private readonly repl = new JavaScriptPlanner()
  private paused = false

  // State
  private queue: QueuedEvent[] = []
  private isProcessing = false
  private isReplEvaluating = false
  private currentCancellationToken: CancellationToken | undefined
  private giveUpUntil = 0
  private giveUpReason: string | undefined
  private lastContextView: string | undefined
  private lastReplOutcome: ReplOutcomeSummary | undefined
  private conversationHistory: Message[] = []
  private lastLlmInputSnapshot: LlmInputSnapshot | null = null
  private runtimeMineflayer: MineflayerWithAgents | null = null
  private readonly llmLogEntries: LlmLogEntry[] = []
  private llmLogIdCounter = 0
  private readonly llmTraceEntries: LlmTraceEntry[] = []
  private llmTraceIdCounter = 0
  private turnCounter = 0
  private currentInputEnvelope: RuntimeInputEnvelope | null = null
  private readonly llmLogRuntime = createLlmLogRuntime(() => this.llmLogEntries)
  private nextControlActionId = 0
  private pendingControlActions: ControlActionQueueEntry[] = []
  private activeControlAction: ControlActionQueueEntry | null = null
  private recentControlActions: ControlActionQueueEntry[] = []
  private actionQueueUpdatedAt = Date.now()
  private isActionWorkerRunning = false
  private completedControlActionsSinceLastFeedback = 0

  constructor(private readonly deps: BrainDeps) {
    this.debugService = DebugService.getInstance()
  }

  public init(bot: MineflayerWithAgents): void {
    this.deps.logger.log('INFO', 'Brain: Initializing stateful core...')
    this.runtimeMineflayer = bot

    // Perception Handler
    this.deps.eventBus.subscribe<PerceptionSignal>('conscious:signal:*', (event: TracedEvent<PerceptionSignal>) => {
      this.enqueueEvent(bot, {
        type: 'perception',
        payload: event.payload,
        source: { type: 'minecraft', id: event.payload.sourceId ?? 'perception' },
        timestamp: Date.now(),
      }).catch(err => this.deps.logger.withError(err).error('Brain: Failed to process perception event'))
    })

    // Action telemetry logger
    this.deps.taskExecutor.on('action:completed', async ({ action, result }) => {
      this.deps.logger.log('INFO', `Brain: Action completed: ${action.tool}`)
      this.appendLlmLog({
        turnId: this.turnCounter,
        kind: 'feedback',
        eventType: 'feedback',
        sourceType: 'system',
        sourceId: 'executor',
        tags: ['feedback', 'success', action.tool],
        text: `Action completed: ${action.tool}`,
        metadata: {
          params: action.params,
          result: stringifyForLog(result),
        },
      })

      if (action.tool === 'chat' && action.params?.feedback !== true) {
        return
      }

      if (action.tool === 'giveUp') {
        const secondsRaw = Number(action.params?.cooldown_seconds ?? 45)
        const cooldownSeconds = Number.isFinite(secondsRaw) ? Math.min(600, Math.max(10, Math.floor(secondsRaw))) : 45
        this.giveUpUntil = Date.now() + cooldownSeconds * 1000
        this.giveUpReason = typeof action.params?.reason === 'string' ? action.params.reason : undefined
      }

      if (action.tool === 'chat' && action.params?.feedback === true) {
        this.enqueueEvent(bot, {
          type: 'feedback',
          payload: { status: 'success', action, result },
          source: { type: 'system', id: 'executor' },
          timestamp: Date.now(),
        }).catch(err => this.deps.logger.withError(err).error('Brain: Failed to process chat feedback'))
      }
    })

    this.deps.taskExecutor.on('action:failed', async ({ action, error }) => {
      this.deps.logger.withError(error).warn(`Brain: Action failed: ${action.tool}`)
      this.appendLlmLog({
        turnId: this.turnCounter,
        kind: 'feedback',
        eventType: 'feedback',
        sourceType: 'system',
        sourceId: 'executor',
        tags: ['feedback', 'error', action.tool],
        text: `Action failed: ${action.tool}: ${error?.message || String(error)}`,
        metadata: {
          params: action.params,
        },
      })
    })

    this.deps.logger.log('INFO', 'Brain: Online.')
  }

  public destroy(): void {
    this.currentCancellationToken?.cancel()
    this.clearPendingControlActions('cancelled')
    this.activeControlAction = null
    this.touchActionQueue()
    this.runtimeMineflayer = null
  }

  public getReplState(options: { includeBuiltins?: boolean } = {}): { variables: PlannerGlobalDescriptor[], updatedAt: number, paused: boolean } {
    const snapshot = this.deps.reflexManager.getContextSnapshot()
    const replEvent: BotEvent = {
      type: 'system_alert',
      payload: { source: 'debug-repl-state' },
      source: { type: 'system', id: 'debug-repl' },
      timestamp: Date.now(),
    }
    const variables = this.repl.describeGlobals(
      this.deps.taskExecutor.getAvailableActions(),
      this.createRuntimeGlobals(replEvent, snapshot as unknown as Record<string, unknown>),
      { includeBuiltins: options.includeBuiltins },
    )

    return {
      variables,
      updatedAt: Date.now(),
      paused: this.paused,
    }
  }

  public getDebugSnapshot(): {
    isProcessing: boolean
    queueLength: number
    actionQueue: ActionQueueSnapshot
    turnCounter: number
    giveUpUntil: number
    paused: boolean
    contextView: string | undefined
    conversationHistory: Message[]
    llmLogEntries: LlmLogEntry[]
  } {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
      actionQueue: this.getActionQueueSnapshot(),
      turnCounter: this.turnCounter,
      giveUpUntil: this.giveUpUntil,
      paused: this.paused,
      contextView: this.lastContextView,
      conversationHistory: this.cloneMessages(this.conversationHistory),
      llmLogEntries: [...this.llmLogEntries],
    }
  }

  public setPaused(paused: boolean): boolean {
    this.paused = paused
    return this.paused
  }

  public togglePaused(): boolean {
    return this.setPaused(!this.paused)
  }

  public isPaused(): boolean {
    return this.paused
  }

  public getLastLlmInput(): LlmInputSnapshot | null {
    if (!this.lastLlmInputSnapshot)
      return null
    return JSON.parse(JSON.stringify(this.lastLlmInputSnapshot)) as LlmInputSnapshot
  }

  public getLlmLogs(limit?: number): LlmLogEntry[] {
    const entries = [...this.llmLogEntries]
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0)
      return entries
    return entries.slice(-Math.floor(limit))
  }

  public getLlmTrace(limit?: number, turnId?: number): LlmTraceEntry[] {
    let entries = [...this.llmTraceEntries]
    if (typeof turnId === 'number' && Number.isFinite(turnId)) {
      const normalizedTurnId = Math.floor(turnId)
      entries = entries.filter(entry => entry.turnId === normalizedTurnId)
    }

    if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
      entries = entries.slice(-Math.floor(limit))
    }

    return JSON.parse(JSON.stringify(entries)) as LlmTraceEntry[]
  }

  public forgetConversation(): { ok: true, cleared: string[] } {
    this.conversationHistory = []
    this.lastLlmInputSnapshot = null
    return {
      ok: true,
      cleared: ['conversationHistory', 'lastLlmInputSnapshot'],
    }
  }

  public async injectDebugEvent(event: BotEvent): Promise<void> {
    if (!this.runtimeMineflayer) {
      throw new Error('Brain runtime is not initialized yet')
    }

    // Debug-injected perception events bypass the normal Reflex signal path.
    // Refresh context from live bot state first so conscious prompts don't use
    // stale/default environment placeholders.
    if (event.type === 'perception') {
      try {
        this.deps.reflexManager.refreshFromBotState()
      }
      catch (err) {
        this.deps.logger.withError(err as Error).warn('Brain: Failed to refresh reflex context for debug event')
      }
    }

    await this.enqueueEvent(this.runtimeMineflayer, event)
  }

  public async executeDebugRepl(code: string): Promise<DebugReplResult> {
    const startedAt = Date.now()
    if (this.isProcessing || this.isReplEvaluating) {
      return {
        source: 'manual',
        code,
        logs: [],
        actions: [],
        error: 'Brain is currently processing an event. Try again in a moment.',
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
      }
    }

    const snapshot = this.deps.reflexManager.getContextSnapshot()
    const actionDefs = new Map(this.deps.taskExecutor.getAvailableActions().map(action => [action.name, action]))
    const normalizedReplCode = this.normalizeReplCode(code)
    const codeToEvaluate = this.repl.canEvaluateAsExpression(normalizedReplCode)
      ? `return (\n${normalizedReplCode}\n)`
      : normalizedReplCode

    this.isReplEvaluating = true
    try {
      const runResult = await this.repl.evaluate(
        codeToEvaluate,
        this.deps.taskExecutor.getAvailableActions(),
        this.createRuntimeGlobals({
          type: 'system_alert',
          payload: { source: 'debug-repl' },
          source: { type: 'system', id: 'debug-repl' },
          timestamp: Date.now(),
        }, snapshot as unknown as Record<string, unknown>),
        async (action: ActionInstruction) => {
          const actionDef = actionDefs.get(action.tool)
          if (actionDef?.followControl === 'detach')
            this.deps.reflexManager.clearFollowTarget()
          return this.deps.taskExecutor.executeActionWithResult(action)
        },
      )

      return {
        source: 'manual',
        code,
        logs: runResult.logs,
        actions: this.toDebugReplActions(runResult.actions),
        returnValue: runResult.returnValue,
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
      }
    }
    catch (err) {
      return {
        source: 'manual',
        code,
        logs: [],
        actions: [],
        error: toErrorMessage(err),
        durationMs: Date.now() - startedAt,
        timestamp: Date.now(),
      }
    }
    finally {
      this.isReplEvaluating = false
    }
  }

  private normalizeReplCode(code: string): string {
    return normalizeReplScript(code)
  }

  private toDebugReplActions(actions: Array<{
    action: ActionInstruction
    ok: boolean
    result?: unknown
    error?: string
  }>): DebugReplResult['actions'] {
    return actions.map(item => ({
      tool: item.action.tool,
      params: item.action.params,
      ok: item.ok,
      result: item.result === undefined ? undefined : (typeof item.result === 'string' ? item.result : JSON.stringify(item.result)),
      error: item.error,
    }))
  }

  private cloneMessages(messages: Message[]): Message[] {
    return JSON.parse(JSON.stringify(messages)) as Message[]
  }

  private createRuntimeGlobals(
    event: BotEvent,
    snapshot: Record<string, unknown>,
    mineflayerOverride?: MineflayerWithAgents | null,
  ) {
    const mineflayer = mineflayerOverride ?? this.runtimeMineflayer
    return {
      event,
      snapshot,
      mineflayer,
      bot: mineflayer?.bot,
      llmInput: this.lastLlmInputSnapshot,
      currentInput: this.currentInputEnvelope,
      llmLog: this.llmLogRuntime,
      actionQueue: this.getActionQueueSnapshot(),
      forgetConversation: () => this.forgetConversation(),
    }
  }

  private appendLlmLog(entry: {
    turnId: number
    kind: LlmLogEntryKind
    eventType: string
    sourceType: string
    sourceId: string
    tags?: string[]
    text: string
    metadata?: Record<string, unknown>
  }): void {
    const normalized: LlmLogEntry = {
      id: ++this.llmLogIdCounter,
      turnId: entry.turnId,
      kind: entry.kind,
      timestamp: Date.now(),
      eventType: entry.eventType,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      tags: entry.tags ?? [],
      text: entry.text,
      metadata: entry.metadata,
    }

    this.llmLogEntries.push(normalized)
    if (this.llmLogEntries.length > 1000) {
      this.llmLogEntries.shift()
    }
  }

  private touchActionQueue(): void {
    this.actionQueueUpdatedAt = Date.now()
  }

  private cloneActionParams(params: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(params)) as Record<string, unknown>
  }

  private toActionQueueEntryView(entry: ControlActionQueueEntry): ActionQueueEntryView {
    return {
      id: entry.id,
      tool: entry.action.tool,
      params: this.cloneActionParams(entry.action.params),
      state: entry.state,
      enqueuedAt: entry.enqueuedAt,
      sourceTurnId: entry.sourceTurnId,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt,
      result: entry.result,
      error: entry.error,
    }
  }

  private pushRecentControlAction(entry: ControlActionQueueEntry): void {
    this.recentControlActions.push({
      ...entry,
      action: {
        tool: entry.action.tool,
        params: this.cloneActionParams(entry.action.params),
      },
    })
    if (this.recentControlActions.length > ACTION_QUEUE_RECENT_HISTORY_LIMIT) {
      this.recentControlActions.shift()
    }
  }

  private getActionQueueSnapshot(): ActionQueueSnapshot {
    const executing = this.activeControlAction ? this.toActionQueueEntryView(this.activeControlAction) : null
    const pending = this.pendingControlActions.map(entry => this.toActionQueueEntryView(entry))
    const recent = this.recentControlActions.map(entry => this.toActionQueueEntryView(entry))
    const executingCount = executing ? 1 : 0
    const pendingCount = pending.length

    return {
      executing,
      pending,
      recent,
      capacity: {
        total: MAX_QUEUED_CONTROL_ACTIONS,
        executing: 1,
        pending: MAX_PENDING_CONTROL_ACTIONS,
      },
      counts: {
        total: executingCount + pendingCount,
        executing: executingCount,
        pending: pendingCount,
      },
      updatedAt: this.actionQueueUpdatedAt,
    }
  }

  private isQueueConsumingControlAction(action: ActionInstruction, actionDef: Action | undefined): boolean {
    if (action.tool === 'chat' || action.tool === 'skip' || action.tool === 'stop')
      return false

    if (!actionDef)
      return false

    if (actionDef?.readonly)
      return false

    return actionDef.execution === 'async'
  }

  private clearPendingControlActions(state: Extract<ActionQueueEntryState, 'cancelled' | 'failed'>): number {
    if (this.pendingControlActions.length === 0)
      return 0

    const clearedAt = Date.now()
    const cleared = this.pendingControlActions.splice(0, this.pendingControlActions.length)
    for (const entry of cleared) {
      entry.state = state
      entry.finishedAt = clearedAt
      entry.error = state === 'failed' ? entry.error : entry.error ?? 'Cleared from action queue'
      this.pushRecentControlAction(entry)
    }
    this.touchActionQueue()
    return cleared.length
  }

  private async enqueueControlAction(
    bot: MineflayerWithAgents,
    action: ActionInstruction,
    sourceTurnId: number,
  ): Promise<unknown> {
    const queueSize = this.pendingControlActions.length + (this.activeControlAction ? 1 : 0)
    if (queueSize >= MAX_QUEUED_CONTROL_ACTIONS) {
      throw new Error(`Action queue full (${queueSize}/${MAX_QUEUED_CONTROL_ACTIONS}). Use stop() or wait for completion.`)
    }

    const entry: ControlActionQueueEntry = {
      id: ++this.nextControlActionId,
      action: {
        tool: action.tool,
        params: this.cloneActionParams(action.params),
      },
      sourceTurnId,
      state: 'pending',
      enqueuedAt: Date.now(),
    }
    this.pendingControlActions.push(entry)
    this.touchActionQueue()

    this.appendLlmLog({
      turnId: sourceTurnId,
      kind: 'scheduler',
      eventType: 'system_alert',
      sourceType: 'system',
      sourceId: 'brain:action_queue',
      tags: ['scheduler', 'action_queue', 'enqueued'],
      text: `Queued control action #${entry.id}: ${entry.action.tool}`,
      metadata: {
        actionId: entry.id,
        pendingCount: this.pendingControlActions.length,
      },
    })

    this.startControlActionWorker(bot)
    return {
      queued: true,
      actionId: entry.id,
      state: entry.state,
      pendingAhead: Math.max(0, this.pendingControlActions.length - 1),
      queue: this.getActionQueueSnapshot().counts,
    }
  }

  private startControlActionWorker(bot: MineflayerWithAgents): void {
    if (this.isActionWorkerRunning)
      return

    this.isActionWorkerRunning = true
    setImmediate(() => {
      void this.runControlActionWorker(bot)
    })
  }

  private async runControlActionWorker(bot: MineflayerWithAgents): Promise<void> {
    try {
      while (this.pendingControlActions.length > 0) {
        const entry = this.pendingControlActions.shift()!
        entry.state = 'executing'
        entry.startedAt = Date.now()
        this.activeControlAction = entry
        this.touchActionQueue()

        this.appendLlmLog({
          turnId: entry.sourceTurnId,
          kind: 'scheduler',
          eventType: 'system_alert',
          sourceType: 'system',
          sourceId: 'brain:action_queue',
          tags: ['scheduler', 'action_queue', 'executing'],
          text: `Executing control action #${entry.id}: ${entry.action.tool}`,
          metadata: {
            actionId: entry.id,
          },
        })

        const actionDef = this.deps.taskExecutor.getAvailableActions().find(item => item.name === entry.action.tool)
        if (actionDef?.followControl === 'detach')
          this.deps.reflexManager.clearFollowTarget()

        const cancellationToken = createCancellationToken()
        this.currentCancellationToken = cancellationToken

        try {
          const result = await this.deps.taskExecutor.executeActionWithResult(entry.action, cancellationToken)
          entry.state = 'succeeded'
          entry.result = result
          entry.finishedAt = Date.now()
          this.pushRecentControlAction(entry)
          this.completedControlActionsSinceLastFeedback++

          this.appendLlmLog({
            turnId: entry.sourceTurnId,
            kind: 'scheduler',
            eventType: 'feedback',
            sourceType: 'system',
            sourceId: 'brain:action_queue',
            tags: ['scheduler', 'action_queue', 'success', entry.action.tool],
            text: `Control action #${entry.id} succeeded: ${entry.action.tool}`,
          })

          this.activeControlAction = null
          this.touchActionQueue()

          if (this.pendingControlActions.length === 0) {
            const completedCount = this.completedControlActionsSinceLastFeedback
            this.completedControlActionsSinceLastFeedback = 0
            await this.enqueueEvent(bot, {
              type: 'feedback',
              payload: {
                status: 'success',
                action: entry.action,
                result: entry.result,
                summary: {
                  queueDrained: true,
                  completedCount,
                },
              },
              source: { type: 'system', id: 'executor' },
              timestamp: Date.now(),
            })
          }
        }
        catch (err) {
          const errorMessage = toErrorMessage(err)
          entry.state = 'failed'
          entry.error = errorMessage
          entry.finishedAt = Date.now()
          this.pushRecentControlAction(entry)

          const clearedCount = this.clearPendingControlActions('cancelled')
          this.completedControlActionsSinceLastFeedback = 0
          this.activeControlAction = null
          this.touchActionQueue()

          this.appendLlmLog({
            turnId: entry.sourceTurnId,
            kind: 'scheduler',
            eventType: 'feedback',
            sourceType: 'system',
            sourceId: 'brain:action_queue',
            tags: ['scheduler', 'action_queue', 'failure', entry.action.tool],
            text: `Control action #${entry.id} failed: ${entry.action.tool}`,
            metadata: {
              actionId: entry.id,
              clearedPendingCount: clearedCount,
              error: errorMessage,
            },
          })

          await this.enqueueEvent(bot, {
            type: 'feedback',
            payload: {
              status: 'failure',
              action: entry.action,
              error: errorMessage,
              summary: {
                failedActionId: entry.id,
                clearedPendingCount: clearedCount,
              },
            },
            source: { type: 'system', id: 'executor' },
            timestamp: Date.now(),
          })
          break
        }
        finally {
          if (this.currentCancellationToken === cancellationToken) {
            this.currentCancellationToken = undefined
          }
        }
      }
    }
    finally {
      this.isActionWorkerRunning = false
      if (this.pendingControlActions.length > 0 && this.runtimeMineflayer) {
        this.startControlActionWorker(this.runtimeMineflayer)
      }
    }
  }

  private async executeStopAction(bot: MineflayerWithAgents, sourceTurnId: number): Promise<unknown> {
    const clearedCount = this.clearPendingControlActions('cancelled')
    this.currentCancellationToken?.cancel()

    this.appendLlmLog({
      turnId: sourceTurnId,
      kind: 'scheduler',
      eventType: 'system_alert',
      sourceType: 'system',
      sourceId: 'brain:action_queue',
      tags: ['scheduler', 'action_queue', 'stop'],
      text: `Stop requested. Cleared pending control actions: ${clearedCount}`,
    })

    const result = await this.deps.taskExecutor.executeActionWithResult({ tool: 'stop', params: {} })
    void this.enqueueEvent(bot, {
      type: 'feedback',
      payload: {
        status: 'success',
        action: { tool: 'stop', params: {} },
        result,
        summary: {
          clearedPendingCount: clearedCount,
        },
      },
      source: { type: 'system', id: 'executor' },
      timestamp: Date.now(),
    }).catch(err => this.deps.logger.withError(err).error('Brain: Failed to enqueue stop feedback'))

    return {
      ok: true,
      stopped: true,
      clearedPendingCount: clearedCount,
    }
  }

  private queueNoActionFollowup(
    bot: MineflayerWithAgents,
    triggeringEvent: BotEvent,
    turnId: number,
    returnValue: string | undefined,
    logs: string[],
  ): void {
    if (triggeringEvent.source.type === 'system' && triggeringEvent.source.id === NO_ACTION_FOLLOWUP_SOURCE_ID) {
      this.deps.logger.log('INFO', 'Brain: Suppressed no-action follow-up (already in follow-up chain)')
      this.appendLlmLog({
        turnId,
        kind: 'scheduler',
        eventType: triggeringEvent.type,
        sourceType: triggeringEvent.source.type,
        sourceId: triggeringEvent.source.id,
        tags: ['scheduler', 'no_action', 'suppressed'],
        text: 'No-action follow-up suppressed: already follow-up source',
      })
      return
    }

    const followupEvent: BotEvent = {
      type: 'system_alert',
      payload: {
        reason: 'no_actions',
        returnValue: returnValue ?? 'undefined',
        logs: logs.slice(-3),
      },
      source: { type: 'system', id: NO_ACTION_FOLLOWUP_SOURCE_ID },
      timestamp: Date.now(),
    }

    this.appendLlmLog({
      turnId,
      kind: 'scheduler',
      eventType: triggeringEvent.type,
      sourceType: triggeringEvent.source.type,
      sourceId: triggeringEvent.source.id,
      tags: ['scheduler', 'no_action'],
      text: 'Scheduled one-hop no-action follow-up',
      metadata: {
        returnValue: returnValue ?? 'undefined',
      },
    })
    this.debugService.log('DEBUG', 'Scheduling one-hop no-action follow-up turn')
    void this.enqueueEvent(bot, followupEvent).catch(err =>
      this.deps.logger.withError(err).error('Brain: Failed to enqueue no-action follow-up'),
    )
  }

  // --- Event Queue Logic ---

  private async enqueueEvent(bot: MineflayerWithAgents, event: BotEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ event, resolve, reject })
      void this.processQueue(bot)
    })
  }

  /**
   * Coalesce the event queue: promote high-priority events (player chat)
   * ahead of stale low-priority events (feedback, no-action follow-ups),
   * and drop redundant stale follow-ups when a higher-priority event exists.
   */
  private coalesceQueue(): void {
    if (this.queue.length <= 1)
      return

    const hasHighPriority = this.queue.some(
      item => getEventPriority(item.event) <= EVENT_PRIORITY_PERCEPTION,
    )
    if (!hasHighPriority)
      return

    // Drop redundant no-action follow-ups when a player chat is waiting
    const hasPlayerChat = this.queue.some(
      item => getEventPriority(item.event) === EVENT_PRIORITY_PLAYER_CHAT,
    )
    if (hasPlayerChat) {
      const before = this.queue.length
      const dropped: QueuedEvent[] = []
      this.queue = this.queue.filter((item) => {
        if (getEventPriority(item.event) === EVENT_PRIORITY_NO_ACTION_FOLLOWUP) {
          dropped.push(item)
          return false
        }
        return true
      })
      // Resolve dropped promises so they don't hang
      for (const item of dropped)
        item.resolve()

      if (before !== this.queue.length) {
        this.appendLlmLog({
          turnId: this.turnCounter,
          kind: 'scheduler',
          eventType: 'system_alert',
          sourceType: 'system',
          sourceId: 'brain:coalesce',
          tags: ['scheduler', 'coalesce', 'drop_followups'],
          text: `Coalesced queue: dropped ${before - this.queue.length} stale no-action follow-ups (player chat waiting)`,
        })
      }
    }

    // Stable-sort by priority so player chat events are processed first
    this.queue.sort((a, b) => getEventPriority(a.event) - getEventPriority(b.event))
  }

  private async processQueue(bot: MineflayerWithAgents): Promise<void> {
    if (this.isProcessing || this.queue.length === 0)
      return

    try {
      this.isProcessing = true
      this.debugService.emitBrainState({
        status: 'processing',
        queueLength: this.queue.length,
        lastContextView: this.lastContextView,
      })

      this.coalesceQueue()
      const item = this.queue.shift()!

      try {
        await this.processEvent(bot, item.event)
        item.resolve()
      }
      catch (err) {
        this.deps.logger.withError(err).error('Brain: Error processing event')
        item.reject(err as Error)
      }
    }
    finally {
      this.isProcessing = false
      this.debugService.emitBrainState({
        status: 'idle',
        queueLength: this.queue.length,
        lastContextView: this.lastContextView,
      })

      if (this.queue.length > 0) {
        setImmediate(() => this.processQueue(bot))
      }
    }
  }

  // --- Cognitive Cycle ---

  private async processEvent(bot: MineflayerWithAgents, event: BotEvent): Promise<void> {
    if (this.paused) {
      this.appendLlmLog({
        turnId: this.turnCounter,
        kind: 'scheduler',
        eventType: event.type,
        sourceType: event.source.type,
        sourceId: event.source.id,
        tags: ['scheduler', 'paused', 'suppressed'],
        text: `Suppressed event while paused: ${event.type} from ${event.source.type}:${event.source.id}`,
      })
      this.deps.logger.log('INFO', `Brain: Ignoring event while paused (${event.type} from ${event.source.type}:${event.source.id})`)
      return
    }

    this.resumeFromGiveUpIfNeeded(event)
    if (this.shouldSuppressDuringGiveUp(event))
      return

    // 0. Build Context View
    const snapshot = this.deps.reflexManager.getContextSnapshot()
    const view = buildConsciousContextView(snapshot)
    const contextView = `[PERCEPTION] Self: ${view.selfSummary}\nEnvironment: ${view.environmentSummary}`

    // 1. Construct User Message (Diffing happens here)
    const userMessage = this.buildUserMessage(event, contextView)

    // Update state after consuming difference
    this.lastContextView = contextView

    // 2. Prepare System Prompt (static)
    const systemPrompt = generateBrainSystemPrompt(this.deps.taskExecutor.getAvailableActions())
    const turnId = ++this.turnCounter
    this.currentInputEnvelope = {
      id: turnId,
      turnId,
      timestamp: Date.now(),
      event: {
        type: event.type,
        sourceType: event.source.type,
        sourceId: event.source.id,
        payload: event.payload,
      },
      contextView,
      userMessage,
      systemPrompt: {
        preview: truncateForPrompt(systemPrompt, 240),
        length: systemPrompt.length,
      },
    }
    this.appendLlmLog({
      turnId,
      kind: 'turn_input',
      eventType: event.type,
      sourceType: event.source.type,
      sourceId: event.source.id,
      tags: ['input', event.type],
      text: truncateForPrompt(userMessage, 600),
      metadata: {
        queueLength: this.queue.length,
      },
    })

    // 3. Call LLM with retry logic
    const maxAttempts = 3
    let result: string | null = null
    let capturedReasoning: string | undefined
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Build complete message history: system + conversation history + new user message
        const messages: Message[] = [
          { role: 'system', content: systemPrompt },
          ...this.conversationHistory,
          { role: 'user', content: userMessage },
        ]
        this.lastLlmInputSnapshot = {
          systemPrompt,
          userMessage,
          messages: this.cloneMessages(messages),
          conversationHistory: this.cloneMessages(this.conversationHistory),
          updatedAt: Date.now(),
          attempt,
        }
        this.currentInputEnvelope.llm = {
          attempt,
          model: config.openai.model,
        }
        this.appendLlmLog({
          turnId,
          kind: 'llm_attempt',
          eventType: event.type,
          sourceType: event.source.type,
          sourceId: event.source.id,
          tags: ['llm', 'attempt'],
          text: `LLM attempt ${attempt}/${maxAttempts}`,
          metadata: {
            attempt,
            maxAttempts,
            messageCount: messages.length,
          },
        })

        const traceStart = Date.now()

        const llmResult = await this.deps.llmAgent.callLLM({
          messages,
        })

        const content = llmResult.text
        const reasoning = llmResult.reasoning

        if (!content)
          throw new Error('No content from LLM')

        // Capture reasoning for later use
        capturedReasoning = reasoning
        result = content

        this.debugService.traceLLM({
          route: 'brain',
          messages,
          content,
          reasoning,
          usage: llmResult.usage,
          model: config.openai.model,
          duration: Date.now() - traceStart,
        })
        this.llmTraceEntries.push({
          id: ++this.llmTraceIdCounter,
          turnId,
          timestamp: Date.now(),
          eventType: event.type,
          sourceType: event.source.type,
          sourceId: event.source.id,
          attempt,
          model: config.openai.model,
          messages: this.cloneMessages(messages),
          content,
          reasoning,
          usage: llmResult.usage,
          durationMs: Date.now() - traceStart,
        })
        if (this.llmTraceEntries.length > 500) {
          this.llmTraceEntries.shift()
        }
        this.currentInputEnvelope.llm = {
          attempt,
          model: config.openai.model,
          usage: llmResult.usage,
        }
        this.appendLlmLog({
          turnId,
          kind: 'llm_attempt',
          eventType: event.type,
          sourceType: event.source.type,
          sourceId: event.source.id,
          tags: ['llm', 'response'],
          text: truncateForPrompt(content, 400),
          metadata: {
            attempt,
            usage: llmResult.usage,
            reasoningSize: reasoning?.length ?? 0,
          },
        })

        this.debugService.emitBrainState({
          status: 'processing',
          queueLength: this.queue.length,
          lastContextView: this.lastContextView,
        })

        break // Success, exit retry loop
      }
      catch (err) {
        lastError = err
        const remaining = maxAttempts - attempt
        const isRateLimit = isRateLimitError(err)
        const isAuthOrBadArg = isLikelyAuthOrBadArgError(err)
        const { shouldRetry } = shouldRetryError(err, remaining)
        this.deps.logger.withError(err).error(`Brain: Decision attempt failed (attempt ${attempt}/${maxAttempts}, retry: ${shouldRetry}, rateLimit: ${isRateLimit})`)

        if (!shouldRetry) {
          if (isAuthOrBadArg)
            throw err

          this.deps.logger.withError(err).warn('Brain: Decision attempts exhausted, skipping turn')
          break
        }

        const backoffMs = isRateLimit
          ? Math.min(5000, 1000 * attempt) + Math.floor(Math.random() * 200)
          : 150
        await sleep(backoffMs)
      }
    }

    // 4. Parse & Execute
    if (!result) {
      this.deps.logger.withError(lastError).warn('Brain: No response after all retries')
      this.appendLlmLog({
        turnId,
        kind: 'repl_error',
        eventType: event.type,
        sourceType: event.source.type,
        sourceId: event.source.id,
        tags: ['repl', 'error', 'empty_response'],
        text: 'No LLM response after retries',
      })
      return
    }

    try {
      // Only append to conversation history after successful parsing (avoid dirty data on retry)
      this.conversationHistory.push({ role: 'user', content: userMessage })
      // Store reasoning in the assistant message's reasoning field (if available)
      // Reasoning is transient thinking and doesn't need the [REASONING] prefix hack anymore
      this.conversationHistory.push({
        role: 'assistant',
        content: result,
        ...(capturedReasoning && { reasoning: capturedReasoning }),
      } as Message)

      const actionDefs = new Map(this.deps.taskExecutor.getAvailableActions().map(action => [action.name, action]))

      const normalizedLlmCode = this.normalizeReplCode(result)
      const codeToEvaluate = this.repl.canEvaluateAsExpression(normalizedLlmCode)
        ? `return (\n${normalizedLlmCode}\n)`
        : normalizedLlmCode

      const runResult = await this.repl.evaluate(
        codeToEvaluate,
        this.deps.taskExecutor.getAvailableActions(),
        this.createRuntimeGlobals(event, snapshot as unknown as Record<string, unknown>, bot),
        async (action: ActionInstruction) => {
          const actionDef = actionDefs.get(action.tool)
          if (action.tool === 'stop') {
            return this.executeStopAction(bot, turnId)
          }

          const isControlAction = this.isQueueConsumingControlAction(action, actionDef)
          if (isControlAction)
            return this.enqueueControlAction(bot, action, turnId)

          if (actionDef?.followControl === 'detach')
            this.deps.reflexManager.clearFollowTarget()

          return this.deps.taskExecutor.executeActionWithResult(action)
        },
      )

      this.lastReplOutcome = {
        actionCount: runResult.actions.length,
        okCount: runResult.actions.filter(item => item.ok).length,
        errorCount: runResult.actions.filter(item => !item.ok).length,
        returnValue: runResult.returnValue,
        logs: runResult.logs.slice(-3),
        updatedAt: Date.now(),
      }
      this.appendLlmLog({
        turnId,
        kind: 'repl_result',
        eventType: event.type,
        sourceType: event.source.type,
        sourceId: event.source.id,
        tags: [
          'repl',
          runResult.actions.length === 0 ? 'no_actions' : 'actions',
          runResult.actions.some(item => !item.ok) ? 'error' : 'ok',
        ],
        text: `actions=${runResult.actions.length} return=${runResult.returnValue ?? 'undefined'}`,
        metadata: {
          returnValue: runResult.returnValue,
          actionCount: runResult.actions.length,
          okCount: runResult.actions.filter(item => item.ok).length,
          errorCount: runResult.actions.filter(item => !item.ok).length,
          actions: runResult.actions.map(item => ({
            tool: item.action.tool,
            ok: item.ok,
            error: item.error,
          })),
          logs: runResult.logs.slice(-5),
        },
      })

      if (runResult.actions.length === 0 || runResult.actions.every(item => item.action.tool === 'skip')) {
        this.debugService.emit('debug:repl_result', {
          source: 'llm',
          code: result,
          logs: runResult.logs,
          actions: this.toDebugReplActions(runResult.actions),
          returnValue: runResult.returnValue,
          durationMs: 0,
          timestamp: Date.now(),
        })
        if (runResult.actions.length === 0) {
          this.queueNoActionFollowup(bot, event, turnId, runResult.returnValue, runResult.logs)
        }
        this.deps.logger.log('INFO', 'Brain: Skipping turn (observing)')
        return
      }

      this.debugService.emit('debug:repl_result', {
        source: 'llm',
        code: result,
        logs: runResult.logs,
        actions: this.toDebugReplActions(runResult.actions),
        returnValue: runResult.returnValue,
        durationMs: 0,
        timestamp: Date.now(),
      })

      this.deps.logger.log('INFO', `Brain: Executed ${runResult.actions.length} action(s)`, {
        actions: runResult.actions.map(item => ({
          tool: item.action.tool,
          ok: item.ok,
          result: item.result,
          error: item.error,
        })),
        logs: runResult.logs,
        returnValue: runResult.returnValue,
      })
    }
    catch (err) {
      this.deps.logger.withError(err).error('Brain: Failed to execute decision')
      this.appendLlmLog({
        turnId,
        kind: 'repl_error',
        eventType: event.type,
        sourceType: event.source.type,
        sourceId: event.source.id,
        tags: ['repl', 'error'],
        text: truncateForPrompt(toErrorMessage(err), 360),
        metadata: {
          code: result,
        },
      })
      this.debugService.emit('debug:repl_result', {
        source: 'llm',
        code: result,
        logs: [],
        actions: [],
        error: toErrorMessage(err),
        durationMs: 0,
        timestamp: Date.now(),
      })
      void this.enqueueEvent(bot, {
        type: 'feedback',
        payload: { status: 'failure', error: toErrorMessage(err) },
        source: { type: 'system', id: 'brain' },
        timestamp: Date.now(),
      })
    }
  }

  private buildUserMessage(event: BotEvent, contextView: string): string {
    const parts: string[] = []

    // 1. Event Content
    if (event.type === 'perception') {
      const signal = event.payload as PerceptionSignal
      if (signal.type === 'chat_message') {
        parts.push(`[EVENT] ${signal.description}`)
      }
      else {
        parts.push(`[EVENT] Perception Signal: ${signal.description}`)
      }
    }
    else if (event.type === 'feedback') {
      const p = event.payload as any
      const tool = p.action?.tool || 'unknown'
      if (p.status === 'success') {
        parts.push(`[FEEDBACK] ${tool}: Success. ${typeof p.result === 'string' ? p.result : JSON.stringify(p.result)}`)
      }
      else {
        parts.push(`[FEEDBACK] ${tool}: Failed. ${p.error}`)
      }
    }
    else {
      parts.push(`[EVENT] ${event.type}: ${JSON.stringify(event.payload)}`)
    }

    // 2. Perception Snapshot Diff
    // Compare with last
    if (contextView !== this.lastContextView) {
      parts.push(contextView)
      // Note: We don't update this.lastContextView here; caller does it after building message
    }

    if (this.giveUpUntil > Date.now()) {
      const remainingSec = Math.max(0, Math.ceil((this.giveUpUntil - Date.now()) / 1000))
      parts.push(`[STATE] giveUp active (${remainingSec}s left). reason=${this.giveUpReason ?? 'unknown'}`)
    }

    if (this.lastReplOutcome) {
      const ageMs = Date.now() - this.lastReplOutcome.updatedAt
      const returnValue = truncateForPrompt(this.lastReplOutcome.returnValue ?? 'undefined')
      const logs = this.lastReplOutcome.logs.length > 0
        ? this.lastReplOutcome.logs.map((line, index) => `#${index + 1} ${truncateForPrompt(line, 120)}`).join(' | ')
        : '(none)'
      parts.push(`[SCRIPT] Last eval ${ageMs}ms ago: return=${returnValue}; actions=${this.lastReplOutcome.actionCount} (ok=${this.lastReplOutcome.okCount}, err=${this.lastReplOutcome.errorCount}); logs=${logs}`)
    }

    const queueSnapshot = this.getActionQueueSnapshot()
    const runningLabel = queueSnapshot.executing
      ? `${queueSnapshot.executing.tool}#${queueSnapshot.executing.id}`
      : 'none'
    parts.push(`[ACTION_QUEUE] executing=${runningLabel}; pending=${queueSnapshot.counts.pending}; total=${queueSnapshot.counts.total}/${queueSnapshot.capacity.total}`)

    parts.push('[RUNTIME] Globals are refreshed every turn: snapshot, self, environment, social, threat, attention, autonomy, event, now, query, bot, mineflayer, currentInput, llmLog, actionQueue, mem, lastRun, prevRun, lastAction. Player gaze is available in environment.nearbyPlayersGaze when needed.')

    return parts.join('\n\n')
  }

  private shouldSuppressDuringGiveUp(event: BotEvent): boolean {
    if (Date.now() >= this.giveUpUntil)
      return false

    if (event.type !== 'perception')
      return true

    const signal = event.payload as PerceptionSignal
    return signal.type !== 'chat_message'
  }

  private resumeFromGiveUpIfNeeded(event: BotEvent): void {
    if (Date.now() >= this.giveUpUntil)
      return

    if (event.type !== 'perception')
      return

    const signal = event.payload as PerceptionSignal
    if (signal.type !== 'chat_message')
      return

    this.giveUpUntil = 0
    this.giveUpReason = undefined
  }
}
