import type { Mineflayer } from '../../libs/mineflayer'
import type { Action } from '../../libs/mineflayer/action'
import type { ActionAgent, AgentConfig } from '../../libs/mineflayer/base-agent'
import type { PlanStep } from '../planning/adapter'

import { useBot } from '../../composables/bot'
import { AbstractAgent } from '../../libs/mineflayer/base-agent'
import { actionsList } from './tools'

interface ActionState {
  executing: boolean
  label: string
  startTime: number
}

/**
 * ActionAgentImpl implements the ActionAgent interface to handle action execution
 * Manages action lifecycle, state tracking and error handling
 */
export class ActionAgentImpl extends AbstractAgent implements ActionAgent {
  public readonly type = 'action' as const
  private actions: Map<string, Action>
  private mineflayer: Mineflayer
  private currentActionState: ActionState

  constructor(config: AgentConfig) {
    super(config)
    this.actions = new Map()
    this.mineflayer = useBot().bot
    this.currentActionState = {
      executing: false,
      label: '',
      startTime: 0,
    }
  }

  protected async initializeAgent(): Promise<void> {
    this.logger.log('Initializing action agent')
    actionsList.forEach(action => this.actions.set(action.name, action))

    // Set up event listeners
    this.on('message', async ({ sender, message }) => {
      await this.handleAgentMessage(sender, message)
    })
  }

  protected async destroyAgent(): Promise<void> {
    this.actions.clear()
    this.removeAllListeners()
  }

  public async performAction(step: PlanStep): Promise<string> {
    if (!this.initialized) {
      throw new Error('Action agent not initialized')
    }

    const action = this.actions.get(step.tool)
    if (!action) {
      throw new Error(`Unknown action: ${step.tool}`)
    }

    this.logger.withFields({
      action: step.tool,
      description: step.description,
      params: step.params,
    }).log('Performing action')

    // Update action state
    this.updateActionState(true, step.description)

    try {
      // Execute action with provided parameters
      const result = await action.perform(this.mineflayer)(...Object.values(step.params))
      return this.formatActionOutput({
        message: result,
        timedout: false,
        interrupted: false,
      })
    }
    catch (error) {
      this.logger.withError(error).error('Action failed')
      throw error
    }
    finally {
      this.updateActionState(false)
    }
  }

  public getAvailableActions(): Action[] {
    return Array.from(this.actions.values())
  }

  private async handleAgentMessage(sender: string, message: string): Promise<void> {
    if (sender === 'system' && message.includes('interrupt') && this.currentActionState.executing) {
      // Handle interruption
      this.logger.log('Received interrupt request')
      // Additional interrupt handling logic here
    }
  }

  private updateActionState(executing: boolean, label = ''): void {
    this.currentActionState = {
      executing,
      label,
      startTime: executing ? Date.now() : this.currentActionState.startTime,
    }
  }

  private formatActionOutput(result: { message: string | null, timedout: boolean, interrupted: boolean }): string {
    if (result.timedout) {
      return 'Action timed out'
    }
    if (result.interrupted) {
      return 'Action was interrupted'
    }
    return result.message || 'Action completed successfully'
  }
}
