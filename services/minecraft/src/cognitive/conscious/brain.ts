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
import { LLMAgent } from './llm-agent'
import {
  extractJsonCandidate,
  isLikelyAuthOrBadArgError,
  isRateLimitError,
  sleep,
  toErrorMessage,
} from './llmlogic'
import { generateBrainSystemPrompt } from './prompts/brain-prompt'
import { createCancellationToken, type CancellationToken } from './task-state'

interface BrainResponse {
  action: ActionInstruction & { id?: string }
}

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

export class Brain {
  private debugService: DebugService

  // State
  private queue: QueuedEvent[] = []
  private isProcessing = false
  private currentCancellationToken: CancellationToken | undefined
  private lastContextView: string | undefined
  private conversationHistory: Message[] = []

  constructor(private readonly deps: BrainDeps) {
    this.debugService = DebugService.getInstance()
  }

  public init(bot: MineflayerWithAgents): void {
    this.deps.logger.log('INFO', 'Brain: Initializing stateful core...')

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

      // Suppress feedback for chat actions on success
      if (action.tool === 'chat') return

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
          responseFormat: { type: 'json_object' },
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
      const parsed = this.parseResponse(result)
      const action = parsed.action

      // Only append to conversation history after successful parsing (avoid dirty data on retry)
      this.conversationHistory.push({ role: 'user', content: userMessage })
      // Store reasoning in the assistant message's reasoning field (if available)
      // Reasoning is transient thinking and doesn't need the [REASONING] prefix hack anymore
      this.conversationHistory.push({
        role: 'assistant',
        content: result,
        ...(capturedReasoning && { reasoning: capturedReasoning }),
      } as Message)

      if (action.tool === 'skip') {
        this.deps.logger.log('INFO', 'Brain: Skipping turn (observing)')
        return
      }

      this.deps.logger.log('INFO', `Brain: Decided action: ${action.tool}`, { params: action.params })

      // Check if action is read-only
      const availableActions = this.deps.taskExecutor.getAvailableActions()
      const actionDef = availableActions.find(a => a.name === action.tool)

      let token: CancellationToken | undefined

      if (actionDef?.readonly) {
        // Read-only Actions: Do not cancel background/physical actions
        // Can be executed in parallel with physical actions
        token = undefined
      } else {
        // Physical Actions: Cancel previous background action
        if (this.currentCancellationToken) {
          this.currentCancellationToken.cancel()
        }
        this.currentCancellationToken = createCancellationToken()
        token = this.currentCancellationToken
      }

      // Execute
      void this.deps.taskExecutor.executeAction(action, token)

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

    return parts.join('\n\n')
  }

  private parseResponse(content: string): BrainResponse {
    const jsonStr = extractJsonCandidate(content)
    try {
      return JSON.parse(jsonStr)
    } catch (e) {
      throw new Error(`Invalid JSON response: ${content.substring(0, 100)}...`)
    }
  }
}
