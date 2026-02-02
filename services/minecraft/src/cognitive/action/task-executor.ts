import type { Mineflayer } from '../../libs/mineflayer/core'
import type { Logger } from '../../utils/logger'
import type { CancellationToken } from '../conscious/task-state'
import type { ActionInstruction } from './types'

import { EventEmitter } from 'node:events'

import { ActionError } from '../../utils/errors'
import { ActionRegistry } from './action-registry'

interface TaskExecutorConfig {
  logger: Logger
}

export class TaskExecutor extends EventEmitter {
  private logger: Logger
  private initialized = false
  private actionRegistry: ActionRegistry
  private mineflayer: Mineflayer | null = null

  constructor(config: TaskExecutorConfig) {
    super()
    this.logger = config.logger
    this.actionRegistry = new ActionRegistry()
  }

  public async initialize(): Promise<void> {
    if (this.initialized)
      return

    this.logger.log('Initializing Task Executor')
    this.initialized = true
  }

  /**
   * Set the mineflayer instance for action execution
   */
  public setMineflayer(mineflayer: Mineflayer): void {
    this.mineflayer = mineflayer
    this.actionRegistry.setMineflayer(mineflayer)
  }

  public async destroy(): Promise<void> {
    this.initialized = false
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
      // Errors handled in runSingleAction event emission
    }
  }

  private async runSingleAction(action: ActionInstruction): Promise<void> {
    this.emit('action:started', { action })

    try {
      let result: string | void

      if (action.tool === 'chat') {
        // Handle chat action via mineflayer directly
        const message = action.params.message
        if (typeof message !== 'string' || message.trim().length === 0)
          throw new Error('Invalid chat tool params: expected params.message to be a string')

        if (!this.mineflayer) {
          throw new Error('Mineflayer instance not set in TaskExecutor')
        }

        this.mineflayer.bot.chat(message)
        result = 'Message sent'
      }
      else if (action.tool === 'skip') {
        result = 'Skipped turn'
      }
      else {
        // Dispatch to ActionRegistry
        const step = {
          description: action.tool,
          tool: action.tool,
          params: action.params,
        }

        result = await this.actionRegistry.performAction(step)
      }

      this.emit('action:completed', { action, result })
    }
    catch (error) {
      this.logger.withError(error).error('Action execution failed')

      // Interrupts are special - no feedback needed
      if (error instanceof ActionError && error.code === 'INTERRUPTED') {
        return
      }

      this.emit('action:failed', { action, error })
      throw error
    }
  }

  public getAvailableActions() {
    return this.actionRegistry.getAvailableActions()
  }
}
