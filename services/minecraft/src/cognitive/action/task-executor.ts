import type { ActionAgent, ChatAgent, Plan } from '../../libs/mineflayer/base-agent'
import type { Logger } from '../../utils/logger'
import type { ActionInstruction } from './types'

import { EventEmitter } from 'node:events'

import { ActionError } from '../../utils/errors'

interface CancellationToken {
  isCancelled: boolean
}

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
    // ActionAgent is initialized by container/orchestrator
    this.initialized = true
  }

  public async destroy(): Promise<void> {
    this.initialized = false
    // ActionAgentImpl doesn't expose destroy publicly in interface but defines it?
    // Checking AbstractAgent, yes it has destroy().
    // We cast to access it or trust it's handled.
    // For now, assume we don't need explicit destroy of ActionAgent if it just clears listeners.
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
        // Check for cancellation before each step
        if (cancellationToken?.isCancelled) {
          this.logger.log('Plan execution cancelled')
          plan.status = 'cancelled'
          return
        }

        try {
          this.logger.withField('step', step).log('Executing step')
          await this.actionAgent.performAction(step)
        }
        catch (stepError: any) {
          if (stepError instanceof ActionError) {
            this.logger.withError(stepError).warn('Step execution failed with ActionError')
            // Fail fast on hard errors
            if (stepError.code === 'RESOURCE_MISSING' || stepError.code === 'CRAFTING_FAILED' || stepError.code === 'INVENTORY_FULL') {
              throw stepError
            }
          }

          this.logger.withError(stepError).error('Failed to execute step')

          // Re-throw to let Orchestrator handle retry logic
          throw stepError
        }
      }

      plan.status = 'completed'
    }
    catch (error) {
      plan.status = 'failed'
      throw error
    }
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
        if (action.type === 'sequential' || action.type === 'parallel') {
          if (action.type === 'parallel') {
            const available = this.actionAgent.getAvailableActions()
            const def = available.find(a => a.name === action.step.tool)
            if (!def || def.execution !== 'parallel') {
              throw new ActionError('UNKNOWN', `Tool '${action.step.tool}' is not allowed for parallel actions`, {
                tool: action.step.tool,
                requestedExecution: action.type,
                allowedExecution: def?.execution,
              })
            }
          }
          result = await this.actionAgent.performAction(action.step)
        }
        else if (action.type === 'chat') {
          await this.chatAgent.sendMessage(action.message)
          result = 'Message sent'
        }
        else {
          throw new Error(`Unknown action type: ${(action as any).type}`)
        }

        this.emit('action:completed', { action, result })
      }
      catch (error) {
        this.logger.withError(error).error('Action execution failed')
        if (error instanceof ActionError && error.code === 'INTERRUPTED') {
          // Foreseeable interruption (e.g. stop tool). Don't send feedback to LLM.
          return
        }

        // failed actions always emit feedback
        this.emit('action:failed', { action, error })
        throw error
      }
    }

    const sequentialActions = actions.filter(a => a.type === 'sequential')
    const parallelActions = actions.filter(a => a.type === 'parallel' || a.type === 'chat')

    // Fire and forget: parallel-safe actions can run concurrently.
    parallelActions.forEach((action) => {
      void runSingleAction(action).catch(() => {
        // errors are emitted via events; nothing else to do here
      })
    })

    // Sequential actions must be executed strictly in order.
    void (async () => {
      for (const action of sequentialActions) {
        if (cancellationToken?.isCancelled) {
          this.logger.log('Action execution cancelled before start')
          return
        }

        try {
          await runSingleAction(action)
        }
        catch (error) {
          // Fail fast: stop executing remaining physical actions.
          return
        }
      }
    })()
  }

  public getAvailableActions() {
    return this.actionAgent.getAvailableActions()
  }
}
