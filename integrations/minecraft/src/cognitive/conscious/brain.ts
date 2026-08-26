import type { Logg } from '@guiiai/logg'
import type { Message } from '@xsai/shared-chat'

import type { AiriBridge } from '../../airi/airi-bridge'
import type { MinecraftContextService } from '../../airi/minecraft-context-service'
import type { ConversationUpdateEvent } from '../../debug/types'
import type { Action } from '../../libs/mineflayer/action'
import type { TaskExecutor } from '../action/task-executor'
import type { ActionInstruction } from '../action/types'
import type { EventBus, TracedEvent } from '../event-bus'
import type { PerceptionSignal } from '../perception/types/signals'
import type { ReflexManager } from '../reflex/reflex-manager'
import type { BotEvent, MineflayerWithAgents } from '../types'
import type { PlannerGlobalDescriptor } from './js-planner'
import type { LLMAgent, LLMResult } from './llm-agent'
import type { LlmLogEntry, LlmLogEntryKind } from './llm-log'
import type { CancellationToken } from './task-state'

import { config } from '../../composables/config'
import { DebugService } from '../../debug'
import { ActionError } from '../../utils/errors'
import { buildConsciousContextView } from './context-view'
import { createHistoryRuntime } from './history-query'
import { JavaScriptPlanner } from './js-planner'
import { createLlmLogRuntime } from './llm-log'
import {
  isLikelyAuthOrBadArgError,
  isRateLimitError,
  shouldRetryError,
  sleep,
  toErrorMessage,
} from './llmlogic'
import { PATTERN_CATALOG } from './patterns/catalog'
import { createPatternRuntime } from './patterns/runtime'
import { generateBrainSystemPrompt } from './prompts/brain-prompt'
import { normalizeReplScript } from './repl-code-normalizer'
import { createCancellationToken } from './task-state'

type ActionQueueEntryState = 'cancelled' | 'executing' | 'failed' | 'pending' | 'succeeded'

interface ActionQueueEntryView {
  enqueuedAt: number
  error?: string
  finishedAt?: number
  id: number
  params: Record<string, unknown>
  result?: unknown
  sourceTurnId: number
  startedAt?: number
  state: ActionQueueEntryState
  tool: string
}

interface ActionQueueSnapshot {
  capacity: {
    executing: number
    pending: number
    total: number
  }
  counts: {
    executing: number
    pending: number
    total: number
  }
  executing: ActionQueueEntryView | null
  pending: ActionQueueEntryView[]
  recent: ActionQueueEntryView[]
  updatedAt: number
}

interface BrainDeps {
  airiBridge: AiriBridge
  eventBus: EventBus
  llmAgent: LLMAgent
  logger: Logg
  minecraftContextService: MinecraftContextService
  reflexManager: ReflexManager
  taskExecutor: TaskExecutor
}

interface ControlActionQueueEntry {
  action: ActionInstruction
  enqueuedAt: number
  error?: string
  finishedAt?: number
  id: number
  result?: unknown
  sourceTurnId: number
  startedAt?: number
  state: ActionQueueEntryState
}

interface DebugReplResult {
  actions: Array<{
    error?: string
    ok: boolean
    params: Record<string, unknown>
    result?: string
    tool: string
  }>
  code: string
  durationMs: number
  error?: string
  logs: string[]
  returnValue?: string
  source: 'llm' | 'manual'
  timestamp: number
}

interface ErrorBurstGuardState {
  errorTurnCount: number
  recentErrorSummary: string[]
  recentTurnIds: number[]
  threshold: number
  triggeredAtTurnId: number
  windowTurns: number
}

interface LlmInputSnapshot {
  attempt: number
  conversationHistory: Message[]
  messages: Message[]
  systemPrompt: string
  updatedAt: number
  userMessage: string
}

interface LlmTraceEntry {
  attempt: number
  content: string
  durationMs: number
  estimatedTokens: number
  eventType: string
  id: number
  // NOTICE: Full messages array is no longer stored to prevent O(turns²) memory growth.
  // Use messageCount + estimatedTokens for diagnostics, or llmLog for detailed history.
  messageCount: number
  model: string
  reasoning?: string
  sourceId: string
  sourceType: string
  timestamp: number
  turnId: number
  usage?: {
    completion_tokens?: number
    prompt_tokens?: number
    total_tokens?: number
  }
}

interface NoActionBudgetState {
  default: number
  max: number
  remaining: number
}

interface QueuedEvent {
  event: BotEvent
  reject: (err: Error) => void
  resolve: () => void
}

interface ReplOutcomeSummary {
  actionCount: number
  errorCount: number
  logs: string[]
  okCount: number
  returnValue?: string
  updatedAt: number
}

interface RuntimeInputEnvelope {
  contextView: string
  event: {
    payload: unknown
    sourceId: string
    sourceType: string
    type: string
  }
  id: number
  llm?: {
    attempt: number
    model: string
    usage?: {
      completion_tokens?: number
      prompt_tokens?: number
      total_tokens?: number
    }
  }
  systemPrompt: {
    length: number
    preview: string
  }
  timestamp: number
  turnId: number
  userMessage: string
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

function truncateForPrompt(value: string, maxLength = 220): string {
  // NOTICE: callers can pass undefined despite the `string` type — a successful action with no return
  // value hits `JSON.stringify(undefined) === undefined` upstream, which previously crashed the whole
  // brain turn here with "Cannot read properties of undefined (reading 'length')". Coerce defensively.
  const text = typeof value === 'string' ? value : String(value ?? '')
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`
}

const NO_ACTION_FOLLOWUP_SOURCE_ID = 'brain:no_action_followup'
const NO_ACTION_BUDGET_ALERT_SOURCE_ID = 'brain:no_action_budget'

/**
 * Priority tiers for event scheduling (lower = higher priority).
 * Player chat and AIRI commands always take precedence over stale system feedback.
 */
const EVENT_PRIORITY_URGENT_PERCEPTION = 0
const EVENT_PRIORITY_PERCEPTION = 1
const EVENT_PRIORITY_FEEDBACK = 2
const EVENT_PRIORITY_NO_ACTION_FOLLOWUP = 3
const MAX_QUEUED_CONTROL_ACTIONS = 5
const MAX_PENDING_CONTROL_ACTIONS = 4
const ACTION_QUEUE_RECENT_HISTORY_LIMIT = 20
const MAX_CONVERSATION_HISTORY_MESSAGES = 200
const NO_ACTION_FOLLOWUP_BUDGET_DEFAULT = 3
const NO_ACTION_FOLLOWUP_BUDGET_MAX = 8
const NO_ACTION_STAGNATION_REPEAT_LIMIT = 2
const DEFAULT_LLM_ATTEMPT_TIMEOUT_MS = 60_000
const ERROR_BURST_GUARD_SOURCE_ID = 'brain:error_burst_guard'
const ERROR_BURST_THRESHOLD = 3
const ERROR_BURST_WINDOW_TURNS = 5
const MAX_EVENT_QUEUE_LENGTH = 256
const MAX_CONSECUTIVE_HIGH_PRIORITY_TURNS = 8
const PAUSE_ABORT_ERROR_NAME = 'AbortError'

export class Brain {
  private actionQueueUpdatedAt = Date.now()
  private activeControlAction: ControlActionQueueEntry | null = null
  private completedControlActionsSinceLastFeedback = 0

  private consecutiveHighPriorityTurns = 0
  private conversationHistory: Message[] = []
  private currentCancellationToken: CancellationToken | undefined
  private currentInputEnvelope: null | RuntimeInputEnvelope = null
  private currentLlmAbortController: AbortController | null = null
  private debugService: DebugService
  private errorBurstGuardState: ErrorBurstGuardState | null = null
  private errorBurstGuardSuppressUntilTurnId = 0
  private givenUp = false
  private giveUpReason: string | undefined
  private readonly llmLogEntries: LlmLogEntry[] = []
  private turnCounter = 0
  private readonly historyRuntime = createHistoryRuntime({
    getConversationHistory: () => this.conversationHistory,
    getCurrentTurnId: () => this.turnCounter,
    getLlmLogEntries: () => this.llmLogEntries,
  })

  private isActionWorkerRunning = false
  private isProcessing = false
  private isReplEvaluating = false
  private lastContextView: string | undefined
  private lastLlmInputSnapshot: LlmInputSnapshot | null = null
  private lastReplOutcome: ReplOutcomeSummary | undefined
  private llmLogIdCounter = 0
  private readonly llmLogRuntime = createLlmLogRuntime(() => this.llmLogEntries)
  private readonly llmTraceEntries: LlmTraceEntry[] = []

  private llmTraceIdCounter = 0
  private nextControlActionId = 0
  private noActionFollowupBudgetRemaining = NO_ACTION_FOLLOWUP_BUDGET_DEFAULT
  private noActionFollowupLastSignature: null | string = null
  private noActionFollowupStagnationCount = 0
  private onActionCompleted: ((...args: any[]) => void) | null = null
  private onActionFailed: ((...args: any[]) => void) | null = null
  private readonly patternRuntime = createPatternRuntime(PATTERN_CATALOG)
  private paused = false
  private pendingControlActions: ControlActionQueueEntry[] = []
  // State
  private queue: QueuedEvent[] = []
  private recentControlActions: ControlActionQueueEntry[] = []
  private readonly repl = new JavaScriptPlanner()
  private runtimeMineflayer: MineflayerWithAgents | null = null
  private readonly stopCancelledControlActionIds = new Set<number>()
  private unsubscribeEventBus: (() => void) | null = null

  constructor(private readonly deps: BrainDeps) {
    this.debugService = DebugService.getInstance()
  }

  /**
   * Re-emit the current conversation state for the debug dashboard.
   * Used by the debug dashboard's `request_conversation` handler on reconnect.
   */
  public broadcastConversationState(): void {
    this.emitConversationUpdate(this.isProcessing)
  }

  public destroy(): void {
    this.deps.minecraftContextService.unbindBot()
    if (this.unsubscribeEventBus) {
      this.unsubscribeEventBus()
      this.unsubscribeEventBus = null
    }
    if (this.onActionCompleted) {
      this.deps.taskExecutor.off('action:completed', this.onActionCompleted)
      this.onActionCompleted = null
    }
    if (this.onActionFailed) {
      this.deps.taskExecutor.off('action:failed', this.onActionFailed)
      this.onActionFailed = null
    }
    this.cancelInFlightLlm('Brain destroyed')
    this.currentCancellationToken?.cancel()
    this.clearPendingControlActions('cancelled')
    this.activeControlAction = null
    this.stopCancelledControlActionIds.clear()
    this.touchActionQueue()
    this.runtimeMineflayer = null
  }

  public async executeDebugRepl(code: string): Promise<DebugReplResult> {
    const startedAt = Date.now()
    if (this.isProcessing || this.isReplEvaluating) {
      return {
        actions: [],
        code,
        durationMs: Date.now() - startedAt,
        error: 'Brain is currently processing an event. Try again in a moment.',
        logs: [],
        source: 'manual',
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
          payload: { source: 'debug-repl' },
          source: { id: 'debug-repl', type: 'system' },
          timestamp: Date.now(),
          type: 'system_alert',
        }, snapshot as unknown as Record<string, unknown>),
        async (action: ActionInstruction) => {
          const actionDef = actionDefs.get(action.tool)
          if (actionDef?.followControl === 'detach')
            this.deps.reflexManager.clearFollowTarget()
          return this.deps.taskExecutor.executeActionWithResult(action)
        },
      )

      return {
        actions: this.toDebugReplActions(runResult.actions),
        code,
        durationMs: Date.now() - startedAt,
        logs: runResult.logs,
        returnValue: runResult.returnValue,
        source: 'manual',
        timestamp: Date.now(),
      }
    }
    catch (err) {
      return {
        actions: [],
        code,
        durationMs: Date.now() - startedAt,
        error: toErrorMessage(err),
        logs: [],
        source: 'manual',
        timestamp: Date.now(),
      }
    }
    finally {
      this.isReplEvaluating = false
    }
  }

  public forgetConversation(): { cleared: string[], ok: true } {
    this.conversationHistory = []
    this.lastLlmInputSnapshot = null
    this.emitConversationUpdate(false, true)
    return {
      cleared: ['conversationHistory', 'lastLlmInputSnapshot'],
      ok: true,
    }
  }

  public getDebugSnapshot(): {
    actionQueue: ActionQueueSnapshot
    contextView: string | undefined
    conversationHistory: Message[]
    givenUp: boolean
    isProcessing: boolean
    llmLogEntries: LlmLogEntry[]
    paused: boolean
    queueLength: number
    turnCounter: number
  } {
    return {
      actionQueue: this.getActionQueueSnapshot(),
      contextView: this.lastContextView,
      conversationHistory: this.cloneMessages(this.conversationHistory),
      givenUp: this.givenUp,
      isProcessing: this.isProcessing,
      llmLogEntries: [...this.llmLogEntries],
      paused: this.paused,
      queueLength: this.queue.length,
      turnCounter: this.turnCounter,
    }
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

  public getReplState(options: { includeBuiltins?: boolean } = {}): { paused: boolean, updatedAt: number, variables: PlannerGlobalDescriptor[] } {
    const snapshot = this.deps.reflexManager.getContextSnapshot()
    const replEvent: BotEvent = {
      payload: { source: 'debug-repl-state' },
      source: { id: 'debug-repl', type: 'system' },
      timestamp: Date.now(),
      type: 'system_alert',
    }
    const variables = this.repl.describeGlobals(
      this.deps.taskExecutor.getAvailableActions(),
      this.createRuntimeGlobals(replEvent, snapshot as unknown as Record<string, unknown>),
      { includeBuiltins: options.includeBuiltins },
    )

    return {
      paused: this.paused,
      updatedAt: Date.now(),
      variables,
    }
  }

  public init(bot: MineflayerWithAgents): void {
    this.deps.logger.log('INFO', 'Brain: Initializing stateful core...')
    this.runtimeMineflayer = bot

    // Perception Handler
    this.unsubscribeEventBus = this.deps.eventBus.subscribe<PerceptionSignal>('conscious:signal:*', (event: TracedEvent<PerceptionSignal>) => {
      // AIRI context updates are injected into conversation history without triggering a full cognitive cycle
      if (event.payload.type === 'airi_context') {
        this.conversationHistory.push({
          content: `[AIRI_CONTEXT] ${event.payload.description}`,
          role: 'user',
        })
        this.deps.logger.log('INFO', `Brain: Injected AIRI context: ${event.payload.description.slice(0, 80)}`)
        return
      }

      this.enqueueEvent(bot, {
        payload: event.payload,
        source: { id: event.payload.sourceId ?? 'perception', type: event.payload.sourceId === 'airi' ? 'airi' : 'minecraft' },
        timestamp: Date.now(),
        type: 'perception',
      }).catch(err => this.deps.logger.withError(err).error('Brain: Failed to process perception event'))
    })

    // Action telemetry logger
    this.onActionCompleted = async ({ action, result }: { action: ActionInstruction, result: unknown }) => {
      this.deps.logger.log('INFO', `Brain: Action completed: ${action.tool}`)
      this.appendLlmLog({
        eventType: 'feedback',
        kind: 'feedback',
        metadata: {
          params: action.params,
          result: stringifyForLog(result),
        },
        sourceId: 'executor',
        sourceType: 'system',
        tags: ['feedback', 'success', action.tool],
        text: `Action completed: ${action.tool}`,
        turnId: this.turnCounter,
      })

      if (action.tool === 'chat' && action.params?.feedback !== true) {
        return
      }

      if (action.tool === 'giveUp') {
        this.givenUp = true
        this.giveUpReason = typeof action.params?.reason === 'string' ? action.params.reason : undefined

        try {
          const reason = this.giveUpReason ? `: ${this.giveUpReason}` : ''
          bot.bot.chat(`[debug] Gave up${reason}. Waiting for player input.`)
        }
        catch (err) {
          this.deps.logger.withError(err as Error).warn('Brain: Failed to announce giveUp to chat')
        }
      }

      if (action.tool === 'chat' && action.params?.feedback === true) {
        this.enqueueEvent(bot, {
          payload: { action, result, status: 'success' },
          source: { id: 'executor', type: 'system' },
          timestamp: Date.now(),
          type: 'feedback',
        }).catch(err => this.deps.logger.withError(err).error('Brain: Failed to process chat feedback'))
      }
    }
    this.deps.taskExecutor.on('action:completed', this.onActionCompleted)

    this.onActionFailed = async ({ action, error }: { action: ActionInstruction, error: Error }) => {
      this.deps.logger.withError(error).warn(`Brain: Action failed: ${action.tool}`)
      this.appendLlmLog({
        eventType: 'feedback',
        kind: 'feedback',
        metadata: {
          params: action.params,
        },
        sourceId: 'executor',
        sourceType: 'system',
        tags: ['feedback', 'error', action.tool],
        text: `Action failed: ${action.tool}: ${error?.message || String(error)}`,
        turnId: this.turnCounter,
      })
    }
    this.deps.taskExecutor.on('action:failed', this.onActionFailed)

    this.deps.logger.log('INFO', 'Brain: Online.')

    this.deps.minecraftContextService.bindBot(bot)
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

  public isPaused(): boolean {
    return this.paused
  }

  public setPaused(paused: boolean): boolean {
    this.paused = paused
    if (paused)
      this.cancelInFlightLlm('Brain paused')
    return this.paused
  }

  public togglePaused(): boolean {
    return this.setPaused(!this.paused)
  }

  private appendLlmLog(entry: {
    eventType: string
    kind: LlmLogEntryKind
    metadata?: Record<string, unknown>
    sourceId: string
    sourceType: string
    tags?: string[]
    text: string
    turnId: number
  }): void {
    const normalized: LlmLogEntry = {
      eventType: entry.eventType,
      id: ++this.llmLogIdCounter,
      kind: entry.kind,
      metadata: entry.metadata,
      sourceId: entry.sourceId,
      sourceType: entry.sourceType,
      tags: entry.tags ?? [],
      text: entry.text,
      timestamp: Date.now(),
      turnId: entry.turnId,
    }

    this.llmLogEntries.push(normalized)
    if (this.llmLogEntries.length > 1000) {
      this.llmLogEntries.shift()
    }
  }

  private buildNoActionSignature(returnValue: string | undefined, logs: string[]): string {
    const returnPart = truncateForPrompt(returnValue ?? 'undefined', 320)
    const logsPart = logs.slice(-3).map(line => truncateForPrompt(line, 140)).join('|')
    return `${returnPart}||${logsPart}`
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
        const resultText = typeof p.result === 'string' ? p.result : JSON.stringify(p.result)
        parts.push(`[FEEDBACK] ${tool}: Success. ${truncateForPrompt(resultText, 200)}`)
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

    if (this.givenUp) {
      parts.push(`[STATE] giveUp active (halted until player input). reason=${this.giveUpReason ?? 'unknown'}`)
    }

    if (this.errorBurstGuardState) {
      const guard = this.errorBurstGuardState
      parts.push(`[ERROR_BURST_GUARD] active. errors=${guard.errorTurnCount}/${guard.windowTurns}; threshold=${guard.threshold}`)
      if (guard.recentErrorSummary.length > 0) {
        const condensed = guard.recentErrorSummary
          .slice(0, 3)
          .map(summary => truncateForPrompt(summary, 180))
          .join(' || ')
        parts.push(`[ERROR_BURST_GUARD] recent=${condensed}`)
      }
      parts.push(`[MANDATORY] Too many recent errors. This turn must include BOTH: await giveUp({ reason: "..." }) and await chat({ message: "...", feedback: false }). Explain what failed and what you will do next.`)
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
    const noActionBudget = this.getNoActionBudgetState()
    parts.push(`[NO_ACTION_BUDGET] remaining=${noActionBudget.remaining}; default=${noActionBudget.default}; max=${noActionBudget.max}; stagnation=${this.noActionFollowupStagnationCount}/${NO_ACTION_STAGNATION_REPEAT_LIMIT}`)
    // Only include [ERROR_BURST] line when the guard is actually active
    // (inactive state is the default and doesn't need to be stated every turn)
    if (this.errorBurstGuardState) {
      parts.push(`[ERROR_BURST] active=yes`)
    }

    return parts.join('\n\n')
  }

  private async callLLM(messages: Message[]): Promise<LLMResult> {
    const abortController = new AbortController()

    this.currentLlmAbortController = abortController
    try {
      return await this.deps.llmAgent.callLLM({
        abortSignal: abortController.signal,
        messages,
        timeoutMs: DEFAULT_LLM_ATTEMPT_TIMEOUT_MS,
      })
    }
    finally {
      if (this.currentLlmAbortController === abortController)
        this.currentLlmAbortController = null
    }
  }

  private cancelInFlightLlm(reason: string): void {
    if (!this.currentLlmAbortController)
      return
    if (!this.currentLlmAbortController.signal.aborted) {
      const abortError = Object.assign(new Error(reason), { name: 'AbortError' })
      this.currentLlmAbortController.abort(abortError)
    }
    this.currentLlmAbortController = null
  }

  private canResumeFromGiveUp(signal: PerceptionSignal): boolean {
    return signal.type === 'chat_message' || signal.type === 'airi_command'
  }

  private clearErrorBurstGuardState(turnId: number, reason: 'manual' | 'resolved'): void {
    if (!this.errorBurstGuardState)
      return

    this.appendLlmLog({
      eventType: 'system_alert',
      kind: 'scheduler',
      metadata: {
        guard: { ...this.errorBurstGuardState },
      },
      sourceId: ERROR_BURST_GUARD_SOURCE_ID,
      sourceType: 'system',
      tags: ['scheduler', 'error_burst', 'guard_cleared', reason],
      text: `Error burst guard cleared (${reason})`,
      turnId,
    })

    this.errorBurstGuardSuppressUntilTurnId = turnId + ERROR_BURST_WINDOW_TURNS
    this.errorBurstGuardState = null
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

  private cloneActionParams(params: Record<string, unknown>): Record<string, unknown> {
    return JSON.parse(JSON.stringify(params)) as Record<string, unknown>
  }

  private cloneMessages(messages: Message[]): Message[] {
    return JSON.parse(JSON.stringify(messages)) as Message[]
  }

  /**
   * Coalesce the event queue: promote high-priority events (player chat, AIRI commands)
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

    // Drop redundant no-action follow-ups when an urgent perception is waiting
    const hasUrgentPerception = this.queue.some(
      item => getEventPriority(item.event) === EVENT_PRIORITY_URGENT_PERCEPTION,
    )
    if (hasUrgentPerception) {
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
          eventType: 'system_alert',
          kind: 'scheduler',
          sourceId: 'brain:coalesce',
          sourceType: 'system',
          tags: ['scheduler', 'coalesce', 'drop_followups'],
          text: `Coalesced queue: dropped ${before - this.queue.length} stale no-action follow-ups (urgent perception waiting)`,
          turnId: this.turnCounter,
        })
      }
    }

    // Stable-sort by priority so urgent perception events are processed first
    this.queue.sort((a, b) => getEventPriority(a.event) - getEventPriority(b.event))
  }

  private collectRecentErrorTurns(windowTurns = ERROR_BURST_WINDOW_TURNS): {
    errorTurnIds: number[]
    recentTurnIds: number[]
    summaries: string[]
  } {
    const turnIds: number[] = []
    const seen = new Set<number>()

    for (let index = this.llmLogEntries.length - 1; index >= 0; index--) {
      const entry = this.llmLogEntries[index]
      if (!entry || entry.kind !== 'turn_input')
        continue
      if (seen.has(entry.turnId))
        continue
      seen.add(entry.turnId)
      turnIds.push(entry.turnId)
      if (turnIds.length >= windowTurns)
        break
    }

    const entriesByTurnId = new Map<number, LlmLogEntry[]>()
    for (const turnId of turnIds)
      entriesByTurnId.set(turnId, [])

    for (const entry of this.llmLogEntries) {
      const bucket = entriesByTurnId.get(entry.turnId)
      if (!bucket)
        continue
      bucket.push(entry)
    }

    const errorTurnIds: number[] = []
    const summaries: string[] = []
    for (const turnId of turnIds) {
      const turnEntries = entriesByTurnId.get(turnId) ?? []
      const errors = turnEntries.filter(entry => this.isErrorLlmLogEntry(entry))
      if (errors.length === 0)
        continue
      errorTurnIds.push(turnId)
      const evidence = errors.slice(0, 2).map(entry => this.describeErrorLlmLogEntry(entry)).join(' | ')
      summaries.push(`turn=${turnId} ${evidence}`)
    }

    return {
      errorTurnIds,
      recentTurnIds: turnIds,
      summaries,
    }
  }

  private createRuntimeGlobals(
    event: BotEvent,
    snapshot: Record<string, unknown>,
    mineflayerOverride?: MineflayerWithAgents | null,
  ) {
    const mineflayer = mineflayerOverride ?? this.runtimeMineflayer
    return {
      actionQueue: this.getActionQueueSnapshot(),
      bot: mineflayer?.bot,
      currentInput: this.currentInputEnvelope,
      errorBurstGuard: this.errorBurstGuardState ? { ...this.errorBurstGuardState } : null,
      event,
      forgetConversation: () => this.forgetConversation(),
      getNoActionBudget: () => this.getNoActionBudgetState(),
      history: this.historyRuntime,
      llmInput: this.lastLlmInputSnapshot,
      llmLog: this.llmLogRuntime,
      mineflayer,
      noActionBudget: this.getNoActionBudgetState(),
      notifyAiri: (headline: string, note?: string, urgency?: 'immediate' | 'later' | 'soon') =>
        this.deps.airiBridge.sendNotify(headline, note, urgency),
      patterns: this.patternRuntime,
      setNoActionBudget: (value: number) => this.setNoActionFollowupBudget(value),
      snapshot,
      updateAiriContext: (text: string, hints?: string[], lane?: string) =>
        this.deps.airiBridge.sendContextUpdate(text, hints, lane),
    }
  }

  private dequeueNextQueuedEvent(): QueuedEvent {
    const shouldForceLowPriorityDispatch = this.consecutiveHighPriorityTurns >= MAX_CONSECUTIVE_HIGH_PRIORITY_TURNS
    let item: QueuedEvent | undefined

    if (shouldForceLowPriorityDispatch) {
      const lowPriorityIndex = this.queue.findIndex(
        candidate => getEventPriority(candidate.event) > EVENT_PRIORITY_PERCEPTION,
      )
      if (lowPriorityIndex >= 0) {
        // FIXME: Temporary starvation guard. Replace with weighted-fair scheduling once queue model is refactored.
        item = this.queue.splice(lowPriorityIndex, 1)[0]
        this.appendLlmLog({
          eventType: item.event.type,
          kind: 'scheduler',
          metadata: {
            queueLength: this.queue.length,
            streakBeforeDispatch: this.consecutiveHighPriorityTurns,
          },
          sourceId: 'brain:starvation_guard',
          sourceType: item.event.source.type,
          tags: ['scheduler', 'queue', 'starvation_guard', 'temp_fix'],
          text: 'Forced a low-priority event after high-priority streak',
          turnId: this.turnCounter,
        })
      }
    }

    if (!item)
      item = this.queue.shift()!

    if (getEventPriority(item.event) <= EVENT_PRIORITY_PERCEPTION)
      this.consecutiveHighPriorityTurns += 1
    else
      this.consecutiveHighPriorityTurns = 0

    return item
  }

  private describeErrorLlmLogEntry(entry: LlmLogEntry): string {
    return `${entry.kind}: ${truncateForPrompt(entry.text, 140)}`
  }

  private emitConversationUpdate(isProcessing: boolean, sessionBoundary?: boolean): void {
    this.debugService.emitConversationUpdate({
      isProcessing,
      messages: this.toDebugConversationMessages(this.cloneMessages(this.conversationHistory)),
      ...(sessionBoundary && { sessionBoundary }),
    })
  }

  private emitNoActionBudgetDebugChat(
    bot: MineflayerWithAgents,
    reason: 'no_action_budget_exhausted' | 'no_action_stagnated',
  ): void {
    const message = reason === 'no_action_budget_exhausted'
      ? `[debug] no-action follow-up budget exhausted (remaining=0).`
      : `[debug] no-action follow-up blocked due to stagnant eval loop.`

    try {
      bot.bot.chat(message)
    }
    catch (err) {
      this.deps.logger.withError(err as Error).warn('Brain: Failed to send no-action budget debug chat')
    }
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
      action: {
        params: this.cloneActionParams(action.params),
        tool: action.tool,
      },
      enqueuedAt: Date.now(),
      id: ++this.nextControlActionId,
      sourceTurnId,
      state: 'pending',
    }
    this.pendingControlActions.push(entry)
    this.touchActionQueue()

    this.appendLlmLog({
      eventType: 'system_alert',
      kind: 'scheduler',
      metadata: {
        actionId: entry.id,
        pendingCount: this.pendingControlActions.length,
      },
      sourceId: 'brain:action_queue',
      sourceType: 'system',
      tags: ['scheduler', 'action_queue', 'enqueued'],
      text: `Queued control action #${entry.id}: ${entry.action.tool}`,
      turnId: sourceTurnId,
    })

    this.startControlActionWorker(bot)
    return {
      actionId: entry.id,
      pendingAhead: Math.max(0, this.pendingControlActions.length - 1),
      queue: this.getActionQueueSnapshot().counts,
      queued: true,
      state: entry.state,
    }
  }

  private async enqueueEvent(bot: MineflayerWithAgents, event: BotEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ event, reject, resolve })
      this.trimEventQueueOverflow()
      // Use setImmediate to avoid re-entrant processQueue calls that could
      // bypass the isProcessing guard during the finally block.
      if (!this.isProcessing) {
        setImmediate(() => this.processQueue(bot))
      }
    })
  }

  private async executeStopAction(bot: MineflayerWithAgents, sourceTurnId: number): Promise<unknown> {
    const clearedCount = this.clearPendingControlActions('cancelled')
    const cancelledActiveActionId = this.activeControlAction?.id
    if (cancelledActiveActionId)
      this.stopCancelledControlActionIds.add(cancelledActiveActionId)

    this.currentCancellationToken?.cancel()
    this.deps.reflexManager.clearFollowTarget()

    try {
      bot.interrupt('stop requested by brain')
    }
    catch (err) {
      this.deps.logger.withError(err as Error).warn('Brain: Failed to interrupt mineflayer during stop')
    }

    this.completedControlActionsSinceLastFeedback = 0

    this.appendLlmLog({
      eventType: 'system_alert',
      kind: 'scheduler',
      metadata: {
        cancelledActiveActionId,
      },
      sourceId: 'brain:action_queue',
      sourceType: 'system',
      tags: ['scheduler', 'action_queue', 'stop'],
      text: `Stop requested. Cleared pending control actions: ${clearedCount}`,
      turnId: sourceTurnId,
    })

    const result = await this.deps.taskExecutor.executeActionWithResult({ params: {}, tool: 'stop' })
    void this.enqueueEvent(bot, {
      payload: {
        action: { params: {}, tool: 'stop' },
        result,
        status: 'success',
        summary: {
          cancelledActiveActionId,
          clearedPendingCount: clearedCount,
        },
      },
      source: { id: 'executor', type: 'system' },
      timestamp: Date.now(),
      type: 'feedback',
    }).catch(err => this.deps.logger.withError(err).error('Brain: Failed to enqueue stop feedback'))

    return {
      cancelledActiveActionId,
      clearedPendingCount: clearedCount,
      ok: true,
      stopped: true,
    }
  }

  // FIXME: Temporary fix to preserve reasoning in debug payload while message typing is inconsistent.
  private extractMessageReasoning(message: Message): string | undefined {
    const maybeReasoning = (message as Message & { reasoning?: unknown }).reasoning
    if (typeof maybeReasoning === 'string' && maybeReasoning.length > 0)
      return maybeReasoning
    if ('reasoning_content' in message && typeof message.reasoning_content === 'string' && message.reasoning_content.length > 0)
      return message.reasoning_content
    return undefined
  }

  private findOverflowDropIndex(): number {
    const nonFeedbackCandidateIndex = this.findOverflowDropIndexByFilter(
      item => item.event.type !== 'feedback',
    )
    if (nonFeedbackCandidateIndex >= 0)
      return nonFeedbackCandidateIndex

    return this.findOverflowDropIndexByFilter(() => true)
  }

  private findOverflowDropIndexByFilter(filter: (item: QueuedEvent) => boolean): number {
    let candidateIndex = -1
    let candidatePriority = Number.NEGATIVE_INFINITY

    for (let index = 0; index < this.queue.length; index++) {
      const item = this.queue[index]!
      if (!filter(item))
        continue

      const priority = getEventPriority(item.event)
      if (candidateIndex === -1 || priority > candidatePriority) {
        candidatePriority = priority
        candidateIndex = index
      }
    }

    return candidateIndex
  }

  private getActionQueueSnapshot(): ActionQueueSnapshot {
    const executing = this.activeControlAction ? this.toActionQueueEntryView(this.activeControlAction) : null
    const pending = this.pendingControlActions.map(entry => this.toActionQueueEntryView(entry))
    const recent = this.recentControlActions.map(entry => this.toActionQueueEntryView(entry))
    const executingCount = executing ? 1 : 0
    const pendingCount = pending.length

    return {
      capacity: {
        executing: 1,
        pending: MAX_PENDING_CONTROL_ACTIONS,
        total: MAX_QUEUED_CONTROL_ACTIONS,
      },
      counts: {
        executing: executingCount,
        pending: pendingCount,
        total: executingCount + pendingCount,
      },
      executing,
      pending,
      recent,
      updatedAt: this.actionQueueUpdatedAt,
    }
  }

  private getNoActionBudgetState(): NoActionBudgetState {
    return {
      default: NO_ACTION_FOLLOWUP_BUDGET_DEFAULT,
      max: NO_ACTION_FOLLOWUP_BUDGET_MAX,
      remaining: this.noActionFollowupBudgetRemaining,
    }
  }

  private isAbortError(err: unknown): boolean {
    if (!err || typeof err !== 'object')
      return false
    return (err as { name?: unknown }).name === PAUSE_ABORT_ERROR_NAME
  }

  private isAiriCommandEvent(event: BotEvent): boolean {
    if (event.type !== 'perception')
      return false
    const signal = event.payload as PerceptionSignal
    return signal.type === 'airi_command'
  }

  private isErrorLlmLogEntry(entry: LlmLogEntry): boolean {
    if (entry.kind === 'repl_error')
      return true

    if (entry.kind === 'repl_result') {
      const errorCount = Number((entry.metadata as Record<string, unknown> | undefined)?.errorCount ?? 0)
      return Number.isFinite(errorCount) && errorCount > 0
    }

    if (entry.kind === 'feedback') {
      const tags = new Set(entry.tags.map(tag => tag.toLowerCase()))
      return tags.has('error') || tags.has('failure')
    }

    return false
  }

  private isPlayerChatEvent(event: BotEvent): boolean {
    if (event.type !== 'perception')
      return false
    const signal = event.payload as PerceptionSignal
    return signal.type === 'chat_message'
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

  private maybeActivateErrorBurstGuard(
    bot: MineflayerWithAgents,
    event: BotEvent,
    turnId: number,
  ): void {
    if (this.errorBurstGuardState)
      return

    if (turnId <= this.errorBurstGuardSuppressUntilTurnId)
      return

    const { errorTurnIds, recentTurnIds, summaries } = this.collectRecentErrorTurns(ERROR_BURST_WINDOW_TURNS)
    if (errorTurnIds.length < ERROR_BURST_THRESHOLD)
      return

    const recentErrorSummary = summaries.slice(0, ERROR_BURST_WINDOW_TURNS)
    this.errorBurstGuardState = {
      errorTurnCount: errorTurnIds.length,
      recentErrorSummary,
      recentTurnIds,
      threshold: ERROR_BURST_THRESHOLD,
      triggeredAtTurnId: turnId,
      windowTurns: ERROR_BURST_WINDOW_TURNS,
    }

    this.appendLlmLog({
      eventType: 'system_alert',
      kind: 'scheduler',
      metadata: {
        errorTurnIds,
        recentErrorSummary,
        threshold: ERROR_BURST_THRESHOLD,
        windowTurns: ERROR_BURST_WINDOW_TURNS,
      },
      sourceId: ERROR_BURST_GUARD_SOURCE_ID,
      sourceType: 'system',
      tags: ['scheduler', 'error_burst', 'guard_triggered', 'error'],
      text: `Error burst guard activated (${errorTurnIds.length}/${Math.max(recentTurnIds.length, ERROR_BURST_WINDOW_TURNS)} recent turns contain errors)`,
      turnId,
    })

    if (event.source.type === 'system' && event.source.id === ERROR_BURST_GUARD_SOURCE_ID)
      return

    void this.enqueueEvent(bot, {
      payload: {
        errorTurnCount: errorTurnIds.length,
        guidance: 'Too many recent errors. Call giveUp(...) and send one chat explanation.',
        reason: 'error_burst_guard',
        recentErrorSummary,
        threshold: ERROR_BURST_THRESHOLD,
        windowTurns: ERROR_BURST_WINDOW_TURNS,
      },
      source: { id: ERROR_BURST_GUARD_SOURCE_ID, type: 'system' },
      timestamp: Date.now(),
      type: 'system_alert',
    }).catch(err => this.deps.logger.withError(err).error('Brain: Failed to enqueue error-burst guard alert'))
  }

  private normalizeReplCode(code: string): string {
    return normalizeReplScript(code)
  }

  private async processEvent(bot: MineflayerWithAgents, event: BotEvent): Promise<void> {
    if (this.paused) {
      this.appendLlmLog({
        eventType: event.type,
        kind: 'scheduler',
        sourceId: event.source.id,
        sourceType: event.source.type,
        tags: ['scheduler', 'paused', 'suppressed'],
        text: `Suppressed event while paused: ${event.type} from ${event.source.type}:${event.source.id}`,
        turnId: this.turnCounter,
      })
      this.deps.logger.log('INFO', `Brain: Ignoring event while paused (${event.type} from ${event.source.type}:${event.source.id})`)
      return
    }

    this.resumeFromGiveUpIfNeeded(event)
    if (this.shouldSuppressDuringGiveUp(event))
      return
    if (this.isPlayerChatEvent(event))
      this.resetNoActionFollowupBudget('player_chat')
    if (this.isAiriCommandEvent(event))
      this.resetNoActionFollowupBudget('airi_command')

    const turnId = ++this.turnCounter
    this.maybeActivateErrorBurstGuard(bot, event, turnId)

    // 0. Build Context View
    const snapshot = this.deps.reflexManager.getContextSnapshot()
    const view = buildConsciousContextView(snapshot)
    const contextView = `[PERCEPTION] Self: ${view.selfSummary}\nEnvironment: ${view.environmentSummary}`

    // 1. Construct User Message (Diffing happens here)
    const userMessage = this.buildUserMessage(event, contextView)

    // Update state after consuming difference
    this.lastContextView = contextView

    // 2. Prepare System Prompt (static + bound master identity)
    const systemPrompt = generateBrainSystemPrompt(this.deps.taskExecutor.getAvailableActions(), { masterUsername: config.bot.masterUsername })
    this.currentInputEnvelope = {
      contextView,
      event: {
        payload: event.payload,
        sourceId: event.source.id,
        sourceType: event.source.type,
        type: event.type,
      },
      id: turnId,
      systemPrompt: {
        length: systemPrompt.length,
        preview: truncateForPrompt(systemPrompt, 240),
      },
      timestamp: Date.now(),
      turnId,
      userMessage,
    }
    this.appendLlmLog({
      eventType: event.type,
      kind: 'turn_input',
      metadata: {
        queueLength: this.queue.length,
      },
      sourceId: event.source.id,
      sourceType: event.source.type,
      tags: ['input', event.type],
      text: truncateForPrompt(userMessage, 600),
      turnId,
    })

    this.debugService.emitConversationUpdate({
      isProcessing: true,
      messages: this.toDebugConversationMessages(this.cloneMessages([
        ...this.conversationHistory,
        { content: userMessage, role: 'user' },
      ])),
    })

    // 3. Call LLM with retry logic
    const maxAttempts = 3
    let result: null | string = null
    let capturedReasoning: string | undefined
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Check pause at start of each retry attempt
      if (this.paused) {
        this.appendLlmLog({
          eventType: event.type,
          kind: 'scheduler',
          sourceId: event.source.id,
          sourceType: event.source.type,
          tags: ['scheduler', 'paused', 'interrupted'],
          text: `Interrupted during LLM retry loop (attempt ${attempt}/${maxAttempts}) while paused`,
          turnId,
        })
        this.deps.logger.log('INFO', `Brain: Interrupted LLM retry loop while paused (attempt ${attempt}/${maxAttempts})`)
        return
      }

      try {
        // Build messages: system + conversation history + new user message
        const messages: Message[] = [
          { content: systemPrompt, role: 'system' },
          ...this.conversationHistory,
          { content: userMessage, role: 'user' },
        ]
        this.lastLlmInputSnapshot = {
          attempt,
          conversationHistory: this.cloneMessages(this.conversationHistory),
          messages: this.cloneMessages(messages),
          systemPrompt,
          updatedAt: Date.now(),
          userMessage,
        }
        this.currentInputEnvelope.llm = {
          attempt,
          model: config.openai.model,
        }
        this.appendLlmLog({
          eventType: event.type,
          kind: 'llm_attempt',
          metadata: {
            attempt,
            maxAttempts,
            messageCount: messages.length,
          },
          sourceId: event.source.id,
          sourceType: event.source.type,
          tags: ['llm', 'attempt'],
          text: `LLM attempt ${attempt}/${maxAttempts}`,
          turnId,
        })

        const traceStart = Date.now()

        const llmResult = await this.callLLM(messages)

        const content = llmResult.text
        const reasoning = llmResult.reasoning

        if (!content)
          throw new Error('No content from LLM')

        // Capture reasoning for later use
        capturedReasoning = reasoning
        result = content

        this.debugService.traceLLM({
          content,
          duration: Date.now() - traceStart,
          messages,
          model: config.openai.model,
          reasoning,
          route: 'brain',
          usage: llmResult.usage,
        })
        // Store lightweight trace (no full messages clone to prevent O(turns²) memory)
        const estimatedTokens = Math.ceil(messages.reduce((sum, m) => {
          const c = typeof m.content === 'string' ? m.content.length : 0
          return sum + c
        }, 0) / 4)
        this.llmTraceEntries.push({
          attempt,
          content,
          durationMs: Date.now() - traceStart,
          estimatedTokens,
          eventType: event.type,
          id: ++this.llmTraceIdCounter,
          messageCount: messages.length,
          model: config.openai.model,
          reasoning,
          sourceId: event.source.id,
          sourceType: event.source.type,
          timestamp: Date.now(),
          turnId,
          usage: llmResult.usage,
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
          eventType: event.type,
          kind: 'llm_attempt',
          metadata: {
            attempt,
            reasoningSize: reasoning?.length ?? 0,
            usage: llmResult.usage,
          },
          sourceId: event.source.id,
          sourceType: event.source.type,
          tags: ['llm', 'response'],
          text: truncateForPrompt(content, 400),
          turnId,
        })

        this.debugService.emitBrainState({
          lastContextView: this.lastContextView,
          queueLength: this.queue.length,
          status: 'processing',
        })

        break // Success, exit retry loop
      }
      catch (err) {
        if (this.paused && this.isAbortError(err)) {
          this.appendLlmLog({
            eventType: event.type,
            kind: 'scheduler',
            metadata: {
              attempt,
              maxAttempts,
            },
            sourceId: event.source.id,
            sourceType: event.source.type,
            tags: ['scheduler', 'paused', 'interrupted'],
            text: `Interrupted during LLM call (attempt ${attempt}/${maxAttempts}) while paused`,
            turnId,
          })
          this.deps.logger.log('INFO', `Brain: Interrupted LLM call while paused (attempt ${attempt}/${maxAttempts})`)
          return
        }

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

        // Check pause after backoff sleep (before next retry)
        if (this.paused) {
          this.appendLlmLog({
            eventType: event.type,
            kind: 'scheduler',
            sourceId: event.source.id,
            sourceType: event.source.type,
            tags: ['scheduler', 'paused', 'interrupted'],
            text: `Interrupted after retry backoff (attempt ${attempt}/${maxAttempts}) while paused`,
            turnId,
          })
          this.deps.logger.log('INFO', `Brain: Interrupted after retry backoff while paused (attempt ${attempt}/${maxAttempts})`)
          return
        }
      }
    }

    // 4. Parse & Execute
    if (!result) {
      this.deps.logger.withError(lastError).warn('Brain: No response after all retries')
      this.appendLlmLog({
        eventType: event.type,
        kind: 'repl_error',
        sourceId: event.source.id,
        sourceType: event.source.type,
        tags: ['repl', 'error', 'empty_response'],
        text: 'No LLM response after retries',
        turnId,
      })
      this.maybeActivateErrorBurstGuard(bot, event, turnId)
      return
    }

    // Check pause again after LLM call (allows !pause to interrupt before REPL execution)
    if (this.paused) {
      this.appendLlmLog({
        eventType: event.type,
        kind: 'scheduler',
        sourceId: event.source.id,
        sourceType: event.source.type,
        tags: ['scheduler', 'paused', 'interrupted'],
        text: `Interrupted before REPL execution while paused: ${event.type} from ${event.source.type}:${event.source.id}`,
        turnId,
      })
      this.deps.logger.log('INFO', `Brain: Interrupted processing before REPL while paused (${event.type} from ${event.source.type}:${event.source.id})`)
      return
    }

    try {
      // Only append to conversation history after successful parsing (avoid dirty data on retry)
      this.conversationHistory.push({ content: userMessage, role: 'user' })
      // Store reasoning in the assistant message's reasoning field (if available)
      // Reasoning is transient thinking and doesn't need the [REASONING] prefix hack anymore
      this.conversationHistory.push({
        content: result,
        role: 'assistant',
        ...(capturedReasoning && { reasoning: capturedReasoning }),
      } as Message)

      // Trim conversation history as an in-memory safety net for long sessions.
      if (this.conversationHistory.length > MAX_CONVERSATION_HISTORY_MESSAGES) {
        const trimCount = this.conversationHistory.length - MAX_CONVERSATION_HISTORY_MESSAGES
        this.conversationHistory = this.conversationHistory.slice(trimCount)
      }

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
        errorCount: runResult.actions.filter(item => !item.ok).length,
        logs: runResult.logs.slice(-3),
        okCount: runResult.actions.filter(item => item.ok).length,
        returnValue: runResult.returnValue,
        updatedAt: Date.now(),
      }
      this.appendLlmLog({
        eventType: event.type,
        kind: 'repl_result',
        metadata: {
          actionCount: runResult.actions.length,
          actions: runResult.actions.map(item => ({
            error: item.error,
            ok: item.ok,
            tool: item.action.tool,
          })),
          errorCount: runResult.actions.filter(item => !item.ok).length,
          logs: runResult.logs.slice(-5),
          okCount: runResult.actions.filter(item => item.ok).length,
          returnValue: runResult.returnValue,
        },
        sourceId: event.source.id,
        sourceType: event.source.type,
        tags: [
          'repl',
          runResult.actions.length === 0 ? 'no_actions' : 'actions',
          runResult.actions.some(item => !item.ok) ? 'error' : 'ok',
        ],
        text: `actions=${runResult.actions.length} return=${runResult.returnValue ?? 'undefined'}`,
        turnId,
      })
      this.updateErrorBurstGuardCompletion(
        turnId,
        runResult.actions.map(item => ({
          action: item.action,
          ok: item.ok,
        })),
      )
      this.maybeActivateErrorBurstGuard(bot, event, turnId)

      if (runResult.actions.length === 0 || runResult.actions.every(item => item.action.tool === 'skip')) {
        this.debugService.emit('debug:repl_result', {
          actions: this.toDebugReplActions(runResult.actions),
          code: result,
          durationMs: 0,
          logs: runResult.logs,
          returnValue: runResult.returnValue,
          source: 'llm',
          timestamp: Date.now(),
        })
        if (runResult.actions.length === 0) {
          this.queueNoActionFollowup(bot, event, turnId, runResult.returnValue, runResult.logs)
        }
        this.deps.logger.log('INFO', 'Brain: Skipping turn (observing)')
        this.emitConversationUpdate(false)
        return
      }

      this.debugService.emit('debug:repl_result', {
        actions: this.toDebugReplActions(runResult.actions),
        code: result,
        durationMs: 0,
        logs: runResult.logs,
        returnValue: runResult.returnValue,
        source: 'llm',
        timestamp: Date.now(),
      })

      this.deps.logger.log('INFO', `Brain: Executed ${runResult.actions.length} action(s)`, {
        actions: runResult.actions.map(item => ({
          error: item.error,
          ok: item.ok,
          result: item.result,
          tool: item.action.tool,
        })),
        logs: runResult.logs,
        returnValue: runResult.returnValue,
      })
      this.emitConversationUpdate(false)
    }
    catch (err) {
      this.deps.logger.withError(err).error('Brain: Failed to execute decision')
      this.appendLlmLog({
        eventType: event.type,
        kind: 'repl_error',
        metadata: {
          code: result,
        },
        sourceId: event.source.id,
        sourceType: event.source.type,
        tags: ['repl', 'error'],
        text: truncateForPrompt(toErrorMessage(err), 360),
        turnId,
      })
      this.maybeActivateErrorBurstGuard(bot, event, turnId)
      const augmentedError = augmentDecisionError(toErrorMessage(err))
      this.debugService.emit('debug:repl_result', {
        actions: [],
        code: result,
        durationMs: 0,
        error: augmentedError,
        logs: [],
        source: 'llm',
        timestamp: Date.now(),
      })
      void this.enqueueEvent(bot, {
        payload: { error: augmentedError, status: 'failure' },
        source: { id: 'brain', type: 'system' },
        timestamp: Date.now(),
        type: 'feedback',
      })
      this.emitConversationUpdate(false)
    }
  }

  private async processQueue(bot: MineflayerWithAgents): Promise<void> {
    if (this.isProcessing || this.queue.length === 0)
      return

    try {
      this.isProcessing = true
      this.debugService.emitBrainState({
        lastContextView: this.lastContextView,
        queueLength: this.queue.length,
        status: 'processing',
      })

      this.coalesceQueue()
      const item = this.dequeueNextQueuedEvent()

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
        lastContextView: this.lastContextView,
        queueLength: this.queue.length,
        status: 'idle',
      })

      if (this.queue.length === 0)
        this.consecutiveHighPriorityTurns = 0

      if (this.queue.length > 0) {
        setImmediate(() => this.processQueue(bot))
      }
    }
  }

  private pushRecentControlAction(entry: ControlActionQueueEntry): void {
    this.recentControlActions.push({
      ...entry,
      action: {
        params: this.cloneActionParams(entry.action.params),
        tool: entry.action.tool,
      },
    })
    if (this.recentControlActions.length > ACTION_QUEUE_RECENT_HISTORY_LIMIT) {
      this.recentControlActions.shift()
    }
  }

  private queueNoActionFollowup(
    bot: MineflayerWithAgents,
    triggeringEvent: BotEvent,
    turnId: number,
    returnValue: string | undefined,
    logs: string[],
  ): void {
    const signature = this.buildNoActionSignature(returnValue, logs)
    const budgetBefore = this.noActionFollowupBudgetRemaining
    if (signature === this.noActionFollowupLastSignature)
      this.noActionFollowupStagnationCount++
    else
      this.noActionFollowupStagnationCount = 0
    this.noActionFollowupLastSignature = signature

    const stagnated = this.noActionFollowupStagnationCount >= NO_ACTION_STAGNATION_REPEAT_LIMIT
    const exhausted = this.noActionFollowupBudgetRemaining <= 0
    if (stagnated || exhausted) {
      const reason: 'no_action_budget_exhausted' | 'no_action_stagnated' = exhausted
        ? 'no_action_budget_exhausted'
        : 'no_action_stagnated'

      this.appendLlmLog({
        eventType: triggeringEvent.type,
        kind: 'scheduler',
        metadata: {
          budgetAfter: this.noActionFollowupBudgetRemaining,
          budgetBefore,
          returnValue: returnValue ?? 'undefined',
          signature,
          stagnationCount: this.noActionFollowupStagnationCount,
        },
        sourceId: triggeringEvent.source.id,
        sourceType: triggeringEvent.source.type,
        tags: ['scheduler', 'no_action', 'blocked', reason],
        text: `Blocked no-action follow-up: ${reason}`,
        turnId,
      })

      if (triggeringEvent.source.type === 'system' && triggeringEvent.source.id === NO_ACTION_BUDGET_ALERT_SOURCE_ID) {
        this.deps.logger.log('INFO', `Brain: Suppressed repeated no-action budget alert (${reason})`)
        return
      }

      this.debugService.log('DEBUG', `No-action follow-up blocked: ${reason}`)
      this.emitNoActionBudgetDebugChat(bot, reason)

      const followupEvent: BotEvent = {
        payload: {
          guidance: 'No-action follow-up budget exhausted. Abandon this approach or call setNoActionBudget(n) for this scenario.',
          logs: logs.slice(-3),
          noActionBudget: this.getNoActionBudgetState(),
          reason,
          returnValue: returnValue ?? 'undefined',
        },
        source: { id: NO_ACTION_BUDGET_ALERT_SOURCE_ID, type: 'system' },
        timestamp: Date.now(),
        type: 'system_alert',
      }

      void this.enqueueEvent(bot, followupEvent).catch(err =>
        this.deps.logger.withError(err).error('Brain: Failed to enqueue no-action budget alert'),
      )
      return
    }

    this.noActionFollowupBudgetRemaining = Math.max(0, this.noActionFollowupBudgetRemaining - 1)
    const budgetAfter = this.noActionFollowupBudgetRemaining

    const followupEvent: BotEvent = {
      payload: {
        logs: logs.slice(-3),
        noActionBudget: this.getNoActionBudgetState(),
        reason: 'no_actions',
        returnValue: returnValue ?? 'undefined',
      },
      source: { id: NO_ACTION_FOLLOWUP_SOURCE_ID, type: 'system' },
      timestamp: Date.now(),
      type: 'system_alert',
    }

    this.appendLlmLog({
      eventType: triggeringEvent.type,
      kind: 'scheduler',
      metadata: {
        budgetAfter,
        budgetBefore,
        returnValue: returnValue ?? 'undefined',
        signature,
        stagnationCount: this.noActionFollowupStagnationCount,
      },
      sourceId: triggeringEvent.source.id,
      sourceType: triggeringEvent.source.type,
      tags: ['scheduler', 'no_action'],
      text: 'Scheduled budgeted no-action follow-up turn',
      turnId,
    })
    this.debugService.log('DEBUG', 'Scheduling budgeted no-action follow-up turn')
    void this.enqueueEvent(bot, followupEvent).catch(err =>
      this.deps.logger.withError(err).error('Brain: Failed to enqueue no-action follow-up'),
    )
  }

  private resetNoActionFollowupBudget(reason: 'airi_command' | 'manual' | 'player_chat'): NoActionBudgetState {
    this.noActionFollowupBudgetRemaining = NO_ACTION_FOLLOWUP_BUDGET_DEFAULT
    this.noActionFollowupLastSignature = null
    this.noActionFollowupStagnationCount = 0
    this.appendLlmLog({
      eventType: 'system_alert',
      kind: 'scheduler',
      metadata: {
        budget: this.getNoActionBudgetState(),
      },
      sourceId: 'brain:no_action_budget',
      sourceType: 'system',
      tags: ['scheduler', 'no_action', 'budget_reset', reason],
      text: `No-action follow-up budget reset (${reason})`,
      turnId: this.turnCounter,
    })
    return this.getNoActionBudgetState()
  }

  // --- Event Queue Logic ---

  private resumeFromGiveUpIfNeeded(event: BotEvent): void {
    if (!this.givenUp)
      return

    if (event.type !== 'perception')
      return

    const signal = event.payload as PerceptionSignal
    if (!this.canResumeFromGiveUp(signal))
      return

    this.givenUp = false
    this.giveUpReason = undefined
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
          eventType: 'system_alert',
          kind: 'scheduler',
          metadata: {
            actionId: entry.id,
          },
          sourceId: 'brain:action_queue',
          sourceType: 'system',
          tags: ['scheduler', 'action_queue', 'executing'],
          text: `Executing control action #${entry.id}: ${entry.action.tool}`,
          turnId: entry.sourceTurnId,
        })

        const actionDef = this.deps.taskExecutor.getAvailableActions().find(item => item.name === entry.action.tool)
        if (actionDef?.followControl === 'detach')
          this.deps.reflexManager.clearFollowTarget()

        const cancellationToken = createCancellationToken()
        this.currentCancellationToken = cancellationToken

        try {
          const result = await this.deps.taskExecutor.executeActionWithResult(entry.action, cancellationToken)
          const cancelledByStop = cancellationToken.isCancelled || this.stopCancelledControlActionIds.has(entry.id)
          if (cancelledByStop) {
            entry.state = 'cancelled'
            entry.error = 'Cancelled by stop action'
            entry.finishedAt = Date.now()
            this.pushRecentControlAction(entry)

            this.appendLlmLog({
              eventType: 'feedback',
              kind: 'scheduler',
              metadata: {
                actionId: entry.id,
                reason: 'stop',
              },
              sourceId: 'brain:action_queue',
              sourceType: 'system',
              tags: ['scheduler', 'action_queue', 'cancelled', entry.action.tool],
              text: `Control action #${entry.id} cancelled: ${entry.action.tool}`,
              turnId: entry.sourceTurnId,
            })

            this.stopCancelledControlActionIds.delete(entry.id)
            this.activeControlAction = null
            this.touchActionQueue()
            continue
          }

          entry.state = 'succeeded'
          entry.result = result
          entry.finishedAt = Date.now()
          this.pushRecentControlAction(entry)
          this.completedControlActionsSinceLastFeedback++

          this.appendLlmLog({
            eventType: 'feedback',
            kind: 'scheduler',
            sourceId: 'brain:action_queue',
            sourceType: 'system',
            tags: ['scheduler', 'action_queue', 'success', entry.action.tool],
            text: `Control action #${entry.id} succeeded: ${entry.action.tool}`,
            turnId: entry.sourceTurnId,
          })

          this.activeControlAction = null
          this.touchActionQueue()

          if (this.pendingControlActions.length === 0) {
            const completedCount = this.completedControlActionsSinceLastFeedback
            this.completedControlActionsSinceLastFeedback = 0
            await this.enqueueEvent(bot, {
              payload: {
                action: entry.action,
                result: entry.result,
                status: 'success',
                summary: {
                  completedCount,
                  queueDrained: true,
                },
              },
              source: { id: 'executor', type: 'system' },
              timestamp: Date.now(),
              type: 'feedback',
            })
          }
        }
        catch (err) {
          const interrupted = err instanceof ActionError && err.code === 'INTERRUPTED'
          const cancelledByStop = cancellationToken.isCancelled
            || interrupted
            || this.stopCancelledControlActionIds.has(entry.id)

          if (cancelledByStop) {
            entry.state = 'cancelled'
            entry.error = 'Cancelled by stop action'
            entry.finishedAt = Date.now()
            this.pushRecentControlAction(entry)

            this.appendLlmLog({
              eventType: 'feedback',
              kind: 'scheduler',
              metadata: {
                actionId: entry.id,
                reason: interrupted ? 'interrupted' : 'stop',
              },
              sourceId: 'brain:action_queue',
              sourceType: 'system',
              tags: ['scheduler', 'action_queue', 'cancelled', entry.action.tool],
              text: `Control action #${entry.id} cancelled: ${entry.action.tool}`,
              turnId: entry.sourceTurnId,
            })

            this.stopCancelledControlActionIds.delete(entry.id)
            this.activeControlAction = null
            this.touchActionQueue()
            continue
          }

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
            eventType: 'feedback',
            kind: 'scheduler',
            metadata: {
              actionId: entry.id,
              clearedPendingCount: clearedCount,
              error: errorMessage,
            },
            sourceId: 'brain:action_queue',
            sourceType: 'system',
            tags: ['scheduler', 'action_queue', 'failure', entry.action.tool],
            text: `Control action #${entry.id} failed: ${entry.action.tool}`,
            turnId: entry.sourceTurnId,
          })

          await this.enqueueEvent(bot, {
            payload: {
              action: entry.action,
              error: errorMessage,
              status: 'failure',
              summary: {
                clearedPendingCount: clearedCount,
                failedActionId: entry.id,
              },
            },
            source: { id: 'executor', type: 'system' },
            timestamp: Date.now(),
            type: 'feedback',
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

  private setNoActionFollowupBudget(value: number): NoActionBudgetState & { ok: true } {
    const normalizedRaw = Number(value)
    const normalized = Number.isFinite(normalizedRaw)
      ? Math.floor(normalizedRaw)
      : this.noActionFollowupBudgetRemaining
    const clamped = Math.max(0, Math.min(NO_ACTION_FOLLOWUP_BUDGET_MAX, normalized))
    this.noActionFollowupBudgetRemaining = clamped
    this.noActionFollowupLastSignature = null
    this.noActionFollowupStagnationCount = 0

    this.appendLlmLog({
      eventType: 'system_alert',
      kind: 'scheduler',
      metadata: {
        budget: this.getNoActionBudgetState(),
        requested: value,
      },
      sourceId: 'brain:no_action_budget',
      sourceType: 'system',
      tags: ['scheduler', 'no_action', 'budget_set'],
      text: `No-action follow-up budget set to ${clamped}`,
      turnId: this.turnCounter,
    })

    return {
      ok: true,
      ...this.getNoActionBudgetState(),
    }
  }

  private shouldSuppressDuringGiveUp(event: BotEvent): boolean {
    if (!this.givenUp)
      return false

    if (event.source.type === 'system' && event.source.id === ERROR_BURST_GUARD_SOURCE_ID)
      return false

    if (event.type !== 'perception')
      return true

    const signal = event.payload as PerceptionSignal
    return !this.canResumeFromGiveUp(signal)
  }

  private startControlActionWorker(bot: MineflayerWithAgents): void {
    if (this.isActionWorkerRunning)
      return

    this.isActionWorkerRunning = true
    setImmediate(() => {
      void this.runControlActionWorker(bot)
    })
  }

  private toActionQueueEntryView(entry: ControlActionQueueEntry): ActionQueueEntryView {
    return {
      enqueuedAt: entry.enqueuedAt,
      error: entry.error,
      finishedAt: entry.finishedAt,
      id: entry.id,
      params: this.cloneActionParams(entry.action.params),
      result: entry.result,
      sourceTurnId: entry.sourceTurnId,
      startedAt: entry.startedAt,
      state: entry.state,
      tool: entry.action.tool,
    }
  }

  // FIXME: Temporary fix to normalize xsai Message[] into the debug dashboard's string-only message schema.
  private toDebugConversationMessages(messages: Message[]): ConversationUpdateEvent['messages'] {
    return messages.map((message) => {
      const normalizedMessage: ConversationUpdateEvent['messages'][number] = {
        content: this.toDebugMessageContent(message.content),
        role: message.role,
      }
      const reasoning = this.extractMessageReasoning(message)
      if (reasoning)
        normalizedMessage.reasoning = reasoning
      return normalizedMessage
    })
  }

  // --- Cognitive Cycle ---

  // FIXME: Temporary fix to flatten structured message parts into a string for debug transport compatibility.
  private toDebugMessageContent(content: Message['content']): string {
    if (typeof content === 'string')
      return content
    if (!content)
      return ''
    return content
      .map((part) => {
        if (part.type === 'text')
          return part.text
        if (part.type === 'refusal')
          return part.refusal
        return JSON.stringify(part)
      })
      .join('\n')
  }

  private toDebugReplActions(actions: Array<{
    action: ActionInstruction
    error?: string
    ok: boolean
    result?: unknown
  }>): DebugReplResult['actions'] {
    return actions.map(item => ({
      error: item.error,
      ok: item.ok,
      params: item.action.params,
      result: item.result === undefined ? undefined : (typeof item.result === 'string' ? item.result : JSON.stringify(item.result)),
      tool: item.action.tool,
    }))
  }

  private touchActionQueue(): void {
    this.actionQueueUpdatedAt = Date.now()
  }

  private trimEventQueueOverflow(): void {
    while (this.queue.length > MAX_EVENT_QUEUE_LENGTH) {
      const dropIndex = this.findOverflowDropIndex()
      const [dropped] = this.queue.splice(dropIndex, 1)
      if (!dropped)
        break

      dropped.resolve()
      this.appendLlmLog({
        eventType: dropped.event.type,
        kind: 'scheduler',
        metadata: {
          droppedPriority: getEventPriority(dropped.event),
          queueLength: this.queue.length,
        },
        sourceId: dropped.event.source.id,
        sourceType: dropped.event.source.type,
        tags: ['scheduler', 'queue', 'overflow_drop'],
        text: `Dropped queued event due to queue overflow (max=${MAX_EVENT_QUEUE_LENGTH})`,
        turnId: this.turnCounter,
      })
    }
  }

  private updateErrorBurstGuardCompletion(
    turnId: number,
    actions: Array<{
      action: ActionInstruction
      ok: boolean
    }>,
  ): void {
    if (!this.errorBurstGuardState)
      return

    const hasGiveUp = actions.some(item => item.action.tool === 'giveUp' && item.ok)
    const hasChat = actions.some(item => item.action.tool === 'chat' && item.ok)

    if (hasGiveUp && hasChat) {
      this.clearErrorBurstGuardState(turnId, 'resolved')
      return
    }

    if (hasGiveUp || hasChat) {
      this.appendLlmLog({
        eventType: 'system_alert',
        kind: 'scheduler',
        sourceId: ERROR_BURST_GUARD_SOURCE_ID,
        sourceType: 'system',
        tags: ['scheduler', 'error_burst', 'guard_pending'],
        text: 'Error burst guard still pending: this turn must include both giveUp and chat actions',
        turnId,
      })
    }
  }
}

/**
 * Turn a cryptic sandbox runtime error into actionable guidance the LLM can act on next turn.
 *
 * The dominant recurring failure is reading a coordinate (`.x`/`.y`/`.z`/`.pos`) off a query result
 * that was `null` — e.g. `query.entities().whereName("pig").first().pos.x` when no pig was found.
 * The raw message ("Cannot read properties of undefined (reading 'x')") gave the model nothing to
 * fix, so it would repeat the same crash for several turns and then give up. Appending the concrete
 * fix lets it recover in one turn.
 *
 * Before:
 * - "Cannot read properties of undefined (reading 'x')"
 * After:
 * - "...reading 'x') — You read coordinates from a missing query result. Check for null first..."
 */
function augmentDecisionError(message: string): string {
  if (/Cannot read properties of (?:undefined|null) \(reading '(?:[xyz]|pos|position|location)'\)/.test(message)) {
    return `${message} — You tried to read coordinates from a missing object. query.entities()/query.blocks().first() returns null when no target is found, and reading .pos/.x from that value crashes. Fix it by checking for null first, for example: const t = query.entities().whereName("pig").first(); if (!t) { await chat({ message: "I do not see the target nearby, so I will search another direction.", feedback: false }) } else { await goToCoordinate({ x: t.pos.x, y: t.pos.y, z: t.pos.z, closeness: 1 }) }. Tip: to kill an animal, use attack({ type: "pig" }) against the nearest one; you usually do not need to query coordinates manually.`
  }
  return message
}

function getEventPriority(event: BotEvent): number {
  if (event.type === 'perception') {
    const signal = event.payload as PerceptionSignal
    if (signal.type === 'chat_message' || signal.type === 'airi_command')
      return EVENT_PRIORITY_URGENT_PERCEPTION
    return EVENT_PRIORITY_PERCEPTION
  }
  if (event.source.type === 'system' && event.source.id === NO_ACTION_FOLLOWUP_SOURCE_ID)
    return EVENT_PRIORITY_NO_ACTION_FOLLOWUP
  if (event.type === 'feedback')
    return EVENT_PRIORITY_FEEDBACK
  return EVENT_PRIORITY_PERCEPTION
}
