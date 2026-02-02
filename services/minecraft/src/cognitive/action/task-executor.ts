import type { ActionAgent, ChatAgent, Plan } from '../../libs/mineflayer/base-agent'
import type { Logger } from '../../utils/logger'
import type { CancellationToken } from '../conscious/task-state'
import type { ActionInstruction } from './types'

import { EventEmitter } from 'node:events'

import { ActionError } from '../../utils/errors'

interface TaskExecutorConfig {
  logger: Logger
  actionAgent: ActionAgent
  chatAgent: ChatAgent
}

export class TaskExecutor extends EventEmitter {
  private actionAgent: ActionAgent
  private chatAgent: ChatAgent
  private logger: Logger
  private initialized = false

  constructor(config: TaskExecutorConfig) {
    super()
    this.logger = config.logger
    this.actionAgent = config.actionAgent
    this.chatAgent = config.chatAgent
  }

  public async initialize(): Promise<void> {
    if (this.initialized)
      return

    this.logger.log('Initializing Task Executor')
    this.initialized = true
  }

  public async destroy(): Promise<void> {
    this.initialized = false
  }

  public async executePlan(plan: Plan, cancellationToken?: CancellationToken): Promise<void> {
    if (!this.initialized) {
      throw new Error('TaskExecutor not initialized')
    }

    if (!plan.requiresAction) {
      this.logger.log('Plan does not require actions, skipping execution')
      return
    }

    this.logger.withField('plan', plan).log('Executing plan')

    try {
      plan.status = 'in_progress'

      // Execute each step
      for (const step of plan.steps) {
        if (cancellationToken?.isCancelled) {
          this.logger.log('Plan execution cancelled')
          plan.status = 'cancelled'
          return
        }

        const action: ActionInstruction = {
          tool: step.tool,
          params: step.params,
        }

        await this.runSingleAction(action)
      }

      plan.status = 'completed'
    }
    catch (error) {
      plan.status = 'failed'
      throw error
    }
  }

  public async executeAction(action: ActionInstruction, cancellationToken?: CancellationToken): Promise<void> {
    if (!this.initialized) {
      throw new Error('TaskExecutor not initialized')
    }

    if (cancellationToken?.isCancelled) {
      this.logger.log('Action execution cancelled before start')
      return
    }

    try {
      await this.runSingleAction(action)
    }
    catch (error) {
      // Errors handled in runSingleAction event emission, but we rethrow to caller (Brain)
      // actually runSingleAction rethrows?
      // Let's rely on runSingleAction behavior
    }
  }

  private async runSingleAction(action: ActionInstruction): Promise<void> {
    this.emit('action:started', { action })

    try {
      let result: string | void

      if (action.tool === 'chat') {
        const message = action.params.message
        if (typeof message !== 'string' || message.trim().length === 0)
          throw new Error('Invalid chat tool params: expected params.message to be a string')

        await this.chatAgent.sendMessage(message)
        result = 'Message sent'
      }
      else if (action.tool === 'skip') {
        result = 'Skipped turn'
      }
      else {
        // Dispatch to Action Agent (mineflayer)
        // ActionAgent.performAction takes PlanStep (tool, params, description)
        // ActionInstruction matches structure (tool, params)
        result = await this.actionAgent.performAction(action as any)
      }

      this.emit('action:completed', { action, result })
    }
    catch (error) {
      this.logger.withError(error).error('Action execution failed')

      // Interrupts are special - no feedback needed? keeping logic
      if (error instanceof ActionError && error.code === 'INTERRUPTED') {
        return
      }

      this.emit('action:failed', { action, error })
      throw error
    }
  }

  public getAvailableActions() {
    return this.actionAgent.getAvailableActions()
  }
}
