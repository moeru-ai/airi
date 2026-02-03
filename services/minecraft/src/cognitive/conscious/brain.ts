import type { Logg } from '@guiiai/logg'
import type { Message } from '@xsai/shared-chat'

import type { TaskExecutor } from '../action/task-executor'
import type { EventBus, TracedEvent } from '../os'
import type { PerceptionSignal } from '../perception/types/signals'
import type { ReflexManager } from '../reflex/reflex-manager'
import type { BotEvent, MineflayerWithAgents } from '../types'
import type { ActionInstruction } from '../action/types'

import { config } from '../../composables/config'
import { DebugService } from '../../debug'
import { buildConsciousContextView } from './context-view'
import { JavaScriptPlanner } from './js-planner'
import { LLMAgent } from './llm-agent'
import {
  isLikelyAuthOrBadArgError,
  isRateLimitError,
  sleep,
  toErrorMessage,
} from './llmlogic'
import { generateBrainSystemPrompt } from './prompts/brain-prompt'
import { createCancellationToken, type CancellationToken } from './task-state'

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

interface PlannerOutcomeSummary {
  actionCount: number
  okCount: number
  errorCount: number
  returnValue?: string
  logs: string[]
  updatedAt: number
}

function truncateForPrompt(value: string, maxLength = 220): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`
}

export class Brain {
  private debugService: DebugService
  private readonly planner = new JavaScriptPlanner()

  // State
  private queue: QueuedEvent[] = []
  private isProcessing = false
  private currentCancellationToken: CancellationToken | undefined
  private giveUpUntil = 0
  private giveUpReason: string | undefined
  private lastHumanChatAt = 0
  private botUsername = ''
  private lastContextView: string | undefined
  private lastPlannerOutcome: PlannerOutcomeSummary | undefined
  private conversationHistory: Message[] = []

  constructor(private readonly deps: BrainDeps) {
    this.debugService = DebugService.getInstance()
  }

  public init(bot: MineflayerWithAgents): void {
    this.deps.logger.log('INFO', 'Brain: Initializing stateful core...')
    this.botUsername = bot.bot.username

    // Perception Handler
    this.deps.eventBus.subscribe<PerceptionSignal>('conscious:signal:*', (event: TracedEvent<PerceptionSignal>) => {
      this.enqueueEvent(bot, {
        type: 'perception',
        payload: event.payload,
        source: { type: 'minecraft', id: event.payload.sourceId ?? 'perception' },
        timestamp: Date.now(),
      }).catch(err => this.deps.logger.withError(err).error('Brain: Failed to process perception event'))
    })

    // Action Feedback Handler
    this.deps.taskExecutor.on('action:completed', async ({ action, result }) => {
      this.deps.logger.log('INFO', `Brain: Action completed: ${action.tool}`)

      if (action.tool === 'chat' && action.params?.feedback !== true) {
        return
      }

      if (action.tool === 'giveUp') {
        const secondsRaw = Number(action.params?.cooldown_seconds ?? 45)
        const cooldownSeconds = Number.isFinite(secondsRaw) ? Math.min(600, Math.max(10, Math.floor(secondsRaw))) : 45
        this.giveUpUntil = Date.now() + cooldownSeconds * 1000
        this.giveUpReason = typeof action.params?.reason === 'string' ? action.params.reason : undefined
      }

      this.enqueueEvent(bot, {
        type: 'feedback',
        payload: { status: 'success', action, result },
        source: { type: 'system', id: 'executor' },
        timestamp: Date.now(),
      }).catch(err => this.deps.logger.withError(err).error('Brain: Failed to process success feedback'))
    })

    this.deps.taskExecutor.on('action:failed', async ({ action, error }) => {
      this.deps.logger.withError(error).warn(`Brain: Action failed: ${action.tool}`)
      this.enqueueEvent(bot, {
        type: 'feedback',
        payload: { status: 'failure', action, error: error.message || error },
        source: { type: 'system', id: 'executor' },
        timestamp: Date.now(),
      }).catch(err => this.deps.logger.withError(err).error('Brain: Failed to process failure feedback'))
    })

    this.deps.logger.log('INFO', 'Brain: Online.')
  }

  public destroy(): void {
    this.currentCancellationToken?.cancel()
  }

  // --- Event Queue Logic ---

  private async enqueueEvent(bot: MineflayerWithAgents, event: BotEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ event, resolve, reject })
      void this.processQueue(bot)
    })
  }

  private async processQueue(bot: MineflayerWithAgents): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return

    try {
      this.isProcessing = true
      this.debugService.emitBrainState({
        status: 'processing',
        queueLength: this.queue.length,
        lastContextView: this.lastContextView,
      })

      const item = this.queue.shift()!

      try {
        await this.processEvent(bot, item.event)
        item.resolve()
      } catch (err) {
        this.deps.logger.withError(err).error('Brain: Error processing event')
        item.reject(err as Error)
      }
    } finally {
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
    this.updateHumanChatTimestamp(event)
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

    // 3. Call LLM with retry logic
    const maxAttempts = 3
    let result: string | null = null
    let capturedReasoning: string | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Build complete message history: system + conversation history + new user message
        const messages: Message[] = [
          { role: 'system', content: systemPrompt },
          ...this.conversationHistory,
          { role: 'user', content: userMessage },
        ]

        const traceStart = Date.now()

        const llmResult = await this.deps.llmAgent.callLLM({
          messages,
        })

        const content = llmResult.text
        const reasoning = llmResult.reasoning

        if (!content) throw new Error('No content from LLM')

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

        this.debugService.emitBrainState({
          status: 'processing',
          queueLength: this.queue.length,
          lastContextView: this.lastContextView,
        })

        break // Success, exit retry loop
      } catch (err) {
        const remaining = maxAttempts - attempt
        const isRateLimit = isRateLimitError(err)
        const shouldRetry = remaining > 0 && !isLikelyAuthOrBadArgError(err)
        this.deps.logger.withError(err).error(`Brain: Decision attempt failed (attempt ${attempt}/${maxAttempts}, retry: ${shouldRetry}, rateLimit: ${isRateLimit})`)

        if (!shouldRetry) {
          throw err // Re-throw if we can't retry
        }

        // Backoff on rate limit (429)
        if (isRateLimit) {
          await sleep(500)
        }
      }
    }

    // 4. Parse & Execute
    if (!result) {
      this.deps.logger.warn('Brain: No response after all retries')
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
      let turnCancellationToken: CancellationToken | undefined

      const runResult = await this.planner.evaluate(
        result,
        this.deps.taskExecutor.getAvailableActions(),
        { event, snapshot: snapshot as unknown as Record<string, unknown> },
        async (action: ActionInstruction) => {
          if (action.tool === 'chat' && !this.shouldAllowChatForEvent(event, snapshot.self.health)) {
            return 'Chat suppressed: no direct user prompt for chat this turn'
          }

          const actionDef = actionDefs.get(action.tool)
          if (actionDef?.followControl === 'detach')
            this.deps.reflexManager.clearFollowTarget()

          const isPhysicalAction = action.tool !== 'skip' && !actionDef?.readonly

          if (isPhysicalAction) {
            if (!turnCancellationToken) {
              this.currentCancellationToken?.cancel()
              this.currentCancellationToken = createCancellationToken()
              turnCancellationToken = this.currentCancellationToken
            }
            return this.deps.taskExecutor.executeActionWithResult(action, turnCancellationToken)
          }

          return this.deps.taskExecutor.executeActionWithResult(action)
        },
      )

      this.lastPlannerOutcome = {
        actionCount: runResult.actions.length,
        okCount: runResult.actions.filter(item => item.ok).length,
        errorCount: runResult.actions.filter(item => !item.ok).length,
        returnValue: runResult.returnValue,
        logs: runResult.logs.slice(-3),
        updatedAt: Date.now(),
      }

      if (runResult.actions.length === 0 || runResult.actions.every(item => item.action.tool === 'skip')) {
        this.deps.logger.log('INFO', 'Brain: Skipping turn (observing)')
        return
      }

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

    } catch (err) {
      this.deps.logger.withError(err).error('Brain: Failed to execute decision')
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
      } else {
        parts.push(`[EVENT] Perception Signal: ${signal.description}`)
      }
    } else if (event.type === 'feedback') {
      const p = event.payload as any
      const tool = p.action?.tool || 'unknown'
      if (p.status === 'success') {
        parts.push(`[FEEDBACK] ${tool}: Success. ${typeof p.result === 'string' ? p.result : JSON.stringify(p.result)}`)
      } else {
        parts.push(`[FEEDBACK] ${tool}: Failed. ${p.error}`)
      }
    } else {
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

    if (this.lastPlannerOutcome) {
      const ageMs = Date.now() - this.lastPlannerOutcome.updatedAt
      const returnValue = truncateForPrompt(this.lastPlannerOutcome.returnValue ?? 'undefined')
      const logs = this.lastPlannerOutcome.logs.length > 0
        ? this.lastPlannerOutcome.logs.map((line, index) => `#${index + 1} ${truncateForPrompt(line, 120)}`).join(' | ')
        : '(none)'
      parts.push(`[SCRIPT] Last eval ${ageMs}ms ago: return=${returnValue}; actions=${this.lastPlannerOutcome.actionCount} (ok=${this.lastPlannerOutcome.okCount}, err=${this.lastPlannerOutcome.errorCount}); logs=${logs}`)
    }

    parts.push('[RUNTIME] Globals are refreshed every turn: snapshot, self, environment, social, threat, attention, autonomy, event, now, mem, lastRun, prevRun, lastAction. Player gaze is available in environment.nearbyPlayersGaze when needed.')

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

  private shouldAllowChatForEvent(event: BotEvent, health: number): boolean {
    if (health <= 8)
      return true

    if (event.type !== 'perception')
      return Date.now() - this.lastHumanChatAt <= 45000 && event.type === 'feedback'

    const signal = event.payload as PerceptionSignal
    if (signal.type === 'chat_message') {
      const speaker = typeof (signal.metadata as any)?.username === 'string'
        ? String((signal.metadata as any).username)
        : signal.sourceId
      if (speaker === this.botUsername)
        return false
      return true
    }

    return false
  }

  private updateHumanChatTimestamp(event: BotEvent): void {
    if (event.type !== 'perception')
      return

    const signal = event.payload as PerceptionSignal
    if (signal.type !== 'chat_message')
      return

    this.lastHumanChatAt = Date.now()
  }
}
