import type { Logg } from '@guiiai/logg'
import type { Neuri, NeuriContext } from 'neuri'

import type { EventManager } from '../perception/event-manager'
import type { BotEvent, MineflayerWithAgents, UserIntentPayload } from '../types'
import type { CancellationToken } from './task-state'

import { withRetry } from '@moeru/std'
import { system, user } from 'neuri/openai'

import { DebugServer } from '../../debug-server'
import { handleLLMCompletion } from './completion'
import { generateStatusPrompt } from './prompt'
import { TaskManager } from './task-manager'

export class Orchestrator {
  private taskManager: TaskManager
  private eventQueue: Array<BotEvent<UserIntentPayload>> = []
  private isProcessingQueue = false

  constructor(
    private readonly deps: {
      eventManager: EventManager
      neuri: Neuri
      logger: Logg
    },
  ) {
    this.taskManager = new TaskManager(deps.logger)
  }

  public init(bot: MineflayerWithAgents): void {
    this.deps.eventManager.on<UserIntentPayload>('user_intent', async (event) => {
      await this.handleUserIntent(bot, event)
    })
  }

  private async handleUserIntent(bot: MineflayerWithAgents, event: BotEvent<UserIntentPayload>): Promise<void> {
    const { payload, source } = event
    const { content, metadata } = payload
    const username = metadata?.displayName || source.id

    // Layered Architecture: Check for inhibition from Reflex layer
    if (event.handled) {
      this.deps.logger.log('Orchestrator: Intent already handled by Reflex layer, inhibiting Conscious processing')
      return
    }

    // Check if there's a current task
    if (this.taskManager.hasCurrentTask()) {
      // Determine if we should cancel current task or queue this event
      if (this.shouldCancelCurrentTask(event)) {
        this.deps.logger
          .withFields({ currentTaskId: this.taskManager.getCurrentTask()?.id, priority: event.priority })
          .log('Orchestrator: Cancelling current task for high-priority event')
        this.taskManager.cancelCurrentTask('High-priority event received')
        this.broadcastTaskStatus()
      }
      else {
        // Queue the event for later processing
        this.eventQueue.push(event)
        this.deps.logger
          .withFields({ queueSize: this.eventQueue.length, username, event: content })
          .log('Orchestrator: Event queued')
        this.broadcastTaskStatus()

        // Notify user that we're busy
        const busyMessage = 'I\'m busy right now, I\'ll get to that in a moment!'
        if (source.reply) {
          source.reply(busyMessage)
        }
        else {
          bot.bot.chat(busyMessage)
        }
        return
      }
    }

    // Create new task
    const task = this.taskManager.createTask(content)
    this.deps.logger
      .withFields({ username, content, taskId: task.id })
      .log('Orchestrator: Starting new task')
    this.broadcastTaskStatus()

    try {
      // 1. Update memory
      bot.memory.chatHistory.push(user(`${username}: ${content}`))

      // 2. Execute task with cancellation support
      await this.executeTaskWithCancellation(bot, event, task.cancellationToken)
    }
    catch (error) {
      this.deps.logger.withError(error).warn('Orchestrator: Failed to process intent')
      const errorMessage = `Sorry, I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`
      if (source.reply) {
        source.reply(errorMessage)
      }
      else {
        bot.bot.chat(errorMessage)
      }
    }
    finally {
      this.taskManager.completeCurrentTask()
      this.broadcastTaskStatus()
      // Process next queued event
      this.processNextQueuedEvent(bot)
    }
  }

  private async executeTaskWithCancellation(
    bot: MineflayerWithAgents,
    event: BotEvent<UserIntentPayload>,
    cancellationToken: CancellationToken,
  ): Promise<void> {
    const { payload, source } = event
    const { content } = payload

    // Planning phase
    if (cancellationToken.isCancelled)
      return
    this.taskManager.updateTaskStatus('planning')
    this.broadcastTaskStatus()
    this.deps.logger.log('Orchestrator: Starting planning phase')

    const plan = await bot.planning.createPlan(content)
    this.taskManager.setTaskPlan(plan)
    this.deps.logger.withFields({ steps: plan.steps.length }).log('Orchestrator: Plan created')

    // Execution phase
    if (cancellationToken.isCancelled)
      return
    this.taskManager.updateTaskStatus('executing')
    this.broadcastTaskStatus()
    this.deps.logger.log('Orchestrator: Executing plan')

    await bot.planning.executePlan(plan, cancellationToken)
    this.deps.logger.log('Orchestrator: Plan executed successfully')

    // Response generation phase
    if (cancellationToken.isCancelled)
      return
    this.taskManager.updateTaskStatus('responding')
    this.broadcastTaskStatus()
    this.deps.logger.log('Orchestrator: Generating response')

    const statusPrompt = await generateStatusPrompt(bot)
    const taskContext = this.taskManager.getTaskContextForLLM()

    const response = await this.deps.neuri.handleStateless(
      [
        ...bot.memory.chatHistory,
        system(statusPrompt),
        system(`Task Context: ${taskContext}`),
      ],
      async (c: NeuriContext) => {
        this.deps.logger.log('Orchestrator: thinking...')
        return withRetry<NeuriContext, string>(
          ctx => handleLLMCompletion(ctx, bot, this.deps.logger),
          {
            retry: 3,
            retryDelay: 1000,
          },
        )(c)
      },
    )

    // Reply
    if (cancellationToken.isCancelled)
      return
    if (response) {
      this.deps.logger.withFields({ response }).log('Orchestrator: Responded')
      if (source.reply) {
        source.reply(response)
      }
      else {
        bot.bot.chat(response)
      }
    }
  }

  private shouldCancelCurrentTask(event: BotEvent<UserIntentPayload>): boolean {
    // High priority events should cancel current task
    const HIGH_PRIORITY_THRESHOLD = 8
    return (event.priority ?? 5) >= HIGH_PRIORITY_THRESHOLD
  }

  private async processNextQueuedEvent(bot: MineflayerWithAgents): Promise<void> {
    // Prevent concurrent queue processing
    if (this.isProcessingQueue || this.eventQueue.length === 0) {
      return
    }

    this.isProcessingQueue = true
    const nextEvent = this.eventQueue.shift()

    if (nextEvent) {
      this.deps.logger.log('Orchestrator: Processing next queued event')
      await this.handleUserIntent(bot, nextEvent)
    }

    this.isProcessingQueue = false
  }

  private broadcastTaskStatus(): void {
    const debugServer = DebugServer.getInstance()
    debugServer.broadcast('task-status', {
      currentTask: this.taskManager.getCurrentTask(),
      queueSize: this.eventQueue.length,
      queue: this.eventQueue,
      history: this.taskManager.getTaskHistory(),
    })
  }
}
