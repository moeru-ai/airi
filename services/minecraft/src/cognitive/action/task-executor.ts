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
    this.actionRegistry.setMineflayer(mineflayer)
  }

  public async destroy(): Promise<void> {
    this.initialized = false
    // ActionAgentImpl doesn't expose destroy publicly in interface but defines it?
    // Checking AbstractAgent, yes it has destroy().
    // We cast to access it or trust it's handled.
    // For now, assume we don't need explicit destroy of ActionAgent if it just clears listeners.
  }

  public executeActions(actions: ActionInstruction[], cancellationToken?: CancellationToken): void {
    if (!this.initialized) {
      throw new Error('TaskExecutor not initialized')
    }

    this.logger.withField('count', actions.length).log('Executing actions')

    const runSingleAction = async (action: ActionInstruction): Promise<void> => {
      if (cancellationToken?.isCancelled) {
        this.logger.log('Action execution cancelled before start')
        return
      }

      this.emit('action:started', { action })

      try {
        let result: string | void
        const step = {
          description: action.description ?? action.action,
          tool: action.action,
          params: action.params ?? {},
        }

        result = await this.actionRegistry.performAction(step)

        this.emit('action:completed', { action, result })
      }
      catch (error) {
        this.logger
          .withFields({ action: action.action, id: action.id, params: action.params })
          .withError(error)
          .error('Action execution failed')
        if (error instanceof ActionError && error.code === 'INTERRUPTED') {
          // Foreseeable interruption (e.g. stop tool). Don't send feedback to LLM.
          return
        }

        // failed actions always emit feedback
        this.emit('action:failed', { action, error })

        // Fail fast for all actions: cancel the whole chain (including any remaining queued actions)
        cancellationToken?.cancel?.()
        throw error
      }
    }

    void (async () => {
      for (const action of actions) {
        if (cancellationToken?.isCancelled) {
          this.logger.log('Action execution cancelled before start')
          return
        }

        try {
          await runSingleAction(action)
        }
        catch (error) {
          return
        }
      }
    })()
  }

  public getAvailableActions() {
    return this.actionRegistry.getAvailableActions()
  }
}
