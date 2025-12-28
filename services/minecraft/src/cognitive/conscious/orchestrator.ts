import type { Logg } from '@guiiai/logg'
import type { Neuri, NeuriContext } from 'neuri'

import type { TaskExecutor } from '../action/task-executor'
import type { EventManager } from '../perception/event-manager'
import type { BotEvent, MineflayerWithAgents, UserIntentPayload } from '../types'
import type { CancellationToken } from './task-state'

import { withRetry } from '@moeru/std'
import { system, user } from 'neuri/openai'

import { DebugServer } from '../../debug-server'
import { ActionError } from '../../utils/errors'
import { handleLLMCompletion } from './completion'
import { generateStatusPrompt } from './prompt'
import { TaskManager } from './task-manager'

export class Orchestrator {
  private taskManager: TaskManager

  // We no longer need an event queue for blocking purposes,
  // but we might keep it if we want to handle explicit queuing later.
  // For now, removing the blocking logic.

  constructor(
    private readonly deps: {
      eventManager: EventManager
      neuri: Neuri
      logger: Logg
      taskExecutor: TaskExecutor
    },
  ) {
    this.taskManager = new TaskManager(deps.logger)
  }

  public init(bot: MineflayerWithAgents): void {
    this.deps.eventManager.on<UserIntentPayload>('user_intent', async (event) => {
      // Don't await here to allow event loop to continue?
      // Actually, if we await, the next event won't process until this one finishes
      // ONLY IF eventManager awaits listeners.
      // Assuming we want true parallelism, we should probably not await the full task execution,
      // but we should await the initial decision making.
      // However, handleUserIntent is async void, so awaiting it in event emitter is standard.
      // To ensure non-blocking, handleUserIntent should return quickly.

      // Let's await it, but ensure handleUserIntent doesn't block on long operations
      // before deciding if it's a new task.
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

    // High priority interruption check
    if (this.shouldCancelPrimaryTask(event)) {
      this.deps.logger
        .withFields({
          currentPrimaryId: this.taskManager.getPrimaryTask()?.id,
          priority: event.priority,
        })
        .log('Orchestrator: Cancelling primary task for high-priority event')

      this.taskManager.cancelPrimaryTask('High-priority event received')
      // Note: We continue to process this event as a new task
    }

    // Create new task (Secondary by default if primary exists, Primary if none exists)
    const task = this.taskManager.createTask(content)
    this.deps.logger
      .withFields({ username, content, taskId: task.id })
      .log('Orchestrator: Starting new task processing')
    this.broadcastTaskStatus()

    try {
      // 1. Update memory
      bot.memory.chatHistory.push(user(`${username}: ${content}`))

      // 2. Execute task with cancellation support
      // This will now handle conflicts internally
      this.executeTaskWithCancellation(bot, event, task).catch((err) => {
        this.deps.logger.withError(err).error('Orchestrator: Async task execution failed')
      })

      // We return immediately to allow event loop to process next event
      // (Effectively making it fire-and-forget from the EventManager's perspective)
    }
    catch (error) {
      this.deps.logger.withError(error).warn('Orchestrator: Failed to initiate task')
    }
  }

  private async executeTaskWithCancellation(
    bot: MineflayerWithAgents,
    event: BotEvent<UserIntentPayload>,
    task: { id: string, cancellationToken: CancellationToken }, // Use TaskContext type if imported
  ): Promise<void> {
    const { payload, source } = event
    const { content } = payload
    const { cancellationToken, id: taskId } = task

    try {
      // Planning phase
      if (cancellationToken.isCancelled)
        return
      this.taskManager.updateTaskStatus(taskId, 'planning')
      this.broadcastTaskStatus()
      this.deps.logger.log('Orchestrator: Starting planning phase')

      const availableActions = this.deps.taskExecutor.getAvailableActions()
      const plan = await bot.planning.createPlan(content, availableActions)
      this.taskManager.setTaskPlan(taskId, plan)
      this.deps.logger.withFields({ steps: plan.steps.length }).log('Orchestrator: Plan created')

      // CONFLICT RESOLUTION
      if (plan.requiresAction) {
        // If this task requires action, check if it conflicts with a primary task
        const primaryTask = this.taskManager.getPrimaryTask()

        // If there is a primary task and IT IS NOT THIS TASK
        if (primaryTask && primaryTask.id !== taskId) {
          this.deps.logger.log('Orchestrator: Conflict detected - Secondary task requires action while Primary is busy')

          // Conflict Policy: Reject secondary action tasks
          const busyMessage = `I'm currently busy with "${primaryTask.goal}". Please ask me to "${content}" later or tell me to stop.`
          if (source.reply)
            source.reply(busyMessage)
          else bot.bot.chat(busyMessage)

          // Abort this secondary task
          this.taskManager.completeTask(taskId)
          this.broadcastTaskStatus()
          return
        }
      }

      // Execution phase
      if (cancellationToken.isCancelled)
        return

      if (plan.requiresAction) {
        this.taskManager.updateTaskStatus(taskId, 'executing')
        this.broadcastTaskStatus()
        this.deps.logger.log('Orchestrator: Executing plan')

        // Retry loop implementation
        let currentPlan = plan
        let retryCount = 0
        const MAX_RETRIES = 3

        while (retryCount < MAX_RETRIES) {
          if (cancellationToken.isCancelled)
            return

          try {
            await this.deps.taskExecutor.executePlan(currentPlan, cancellationToken)
            this.deps.logger.log('Orchestrator: Plan executed successfully')
            break // Success
          }
          catch (error: any) {
            if (cancellationToken.isCancelled)
              return

            // Check if it's an actionable error
            const isActionError = error instanceof ActionError
            if (!isActionError)
              throw error // Re-throw system errors

            retryCount++
            if (retryCount >= MAX_RETRIES)
              throw error // Give up

            this.deps.logger.withError(error).warn(`Orchestrator: Plan execution failed (Attempt ${retryCount}/${MAX_RETRIES}). Adjusting plan...`)

            // Adjust plan
            const availableActions = this.deps.taskExecutor.getAvailableActions()
            currentPlan = await bot.planning.adjustPlan(
              currentPlan,
              error.message,
              'system',
              availableActions,
            )
            this.taskManager.setTaskPlan(taskId, currentPlan)
            this.broadcastTaskStatus()
          }
        }
      }
      else {
        this.deps.logger.log('Orchestrator: No physical actions required, skipping execution phase')
      }

      // Response generation phase
      if (cancellationToken.isCancelled)
        return
      this.taskManager.updateTaskStatus(taskId, 'responding')
      this.broadcastTaskStatus()
      this.deps.logger.log('Orchestrator: Generating response')

      const statusPrompt = await generateStatusPrompt(bot)
      const taskContext = this.taskManager.getTaskContextForLLM()

      const response = await this.deps.neuri.handleStateless(
        [
          ...bot.memory.chatHistory,
          system(statusPrompt),
          system(`Task Context:\n${taskContext}`), // Provide full context of all tasks
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
    catch (error) {
      this.deps.logger.withError(error).warn(`Orchestrator: Task ${taskId} processing failed`)
      // Optional: notify user of failure
    }
    finally {
      this.taskManager.completeTask(taskId)
      this.broadcastTaskStatus()
    }
  }

  private shouldCancelPrimaryTask(event: BotEvent<UserIntentPayload>): boolean {
    const primaryTask = this.taskManager.getPrimaryTask()
    if (!primaryTask)
      return false

    // High priority events should cancel current task
    const HIGH_PRIORITY_THRESHOLD = 8
    return (event.priority ?? 5) >= HIGH_PRIORITY_THRESHOLD
  }

  private broadcastTaskStatus(): void {
    const debugServer = DebugServer.getInstance()
    debugServer.broadcast('task-status', {
      currentTask: this.taskManager.getPrimaryTask(), // For backward compatibility with UI
      activeTasks: this.taskManager.getAllActiveTasks(),
      history: this.taskManager.getTaskHistory(),
    })
  }
}
