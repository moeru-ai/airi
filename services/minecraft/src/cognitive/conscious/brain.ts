import type { Logg } from '@guiiai/logg'
import type { Neuri } from 'neuri'

import type { TaskExecutor } from '../action/task-executor'
import type { ActionInstruction } from '../action/types'
import type { EventManager } from '../perception/event-manager'
import type { MineflayerWithAgents, StimulusPayload } from '../types'

import { system, user } from 'neuri/openai'

import { config } from '../../composables/config'
import { Blackboard } from './blackboard'
import { generateBrainSystemPrompt } from './prompts/brain-prompt'

interface BrainDeps {
  eventManager: EventManager
  neuri: Neuri
  logger: Logg
  taskExecutor: TaskExecutor
}

interface BrainResponse {
  thought: string
  blackboard: {
    currentGoal?: string
    currentThought?: string
    executionStrategy?: string
  }
  actions: ActionInstruction[]
}

export class Brain {
  private blackboard: Blackboard

  constructor(private readonly deps: BrainDeps) {
    this.blackboard = new Blackboard()
  }

  public init(bot: MineflayerWithAgents): void {
    this.deps.logger.log('Brain: Initializing...')

    // Listen to Stimuli (Chat/Voice)
    // We treat these as "Sensory Inputs" that trigger the Cognitive Cycle
    this.deps.eventManager.on<StimulusPayload>('stimulus', async (event) => {
      if (event.handled) {
        this.deps.logger.log(`Brain: Stimulus from ${event.source.id} already handled by reflex, ignoring.`)
        return
      }
      this.deps.logger.log(`Brain: Received stimulus from ${event.source.id}: ${event.payload.content}`)
      await this.processEvent(bot, event)
    })

    // Listen to Task Execution Events (Action Feedback)
    this.deps.taskExecutor.on('action:completed', async ({ action, result }) => {
      this.deps.logger.log(`Brain: Action completed: ${action.type}`)
      await this.processEvent(bot, {
        type: 'feedback',
        payload: {
          status: 'success',
          action,
          result,
        },
        source: { type: 'system', id: 'executor' },
        timestamp: Date.now(),
      })
    })

    this.deps.taskExecutor.on('action:failed', async ({ action, error }) => {
      this.deps.logger.withError(error).warn(`Brain: Action failed: ${action.type}`)
      await this.processEvent(bot, {
        type: 'feedback',
        payload: {
          status: 'failure',
          action,
          error: error.message || error,
        },
        source: { type: 'system', id: 'executor' },
        timestamp: Date.now(),
      })
    })

    this.deps.logger.log('Brain: Online.')
  }

  private async processEvent(bot: MineflayerWithAgents, event: any): Promise<void> {
    // OODA Loop: Observe -> Orient -> Decide -> Act

    // 1. Observe (Update Blackboard with Environment Sense)
    this.updatePerception(bot)

    // 2. Orient (Contextualize Event)
    let contextMsg = ''
    if (event.type === 'stimulus') {
      contextMsg = `${event.source.type} stimulus from ${event.source.id}: "${event.payload.content}"`
    }
    else if (event.type === 'feedback') {
      const { status, result, error, action } = event.payload
      const actionDesc = action.type === 'physical' ? action.step.tool : 'chat'
      contextMsg = `Internal Feedback: ${actionDesc} ${status}. Result: ${JSON.stringify(result || error)}`
    }

    // 3. Decide (LLM Call)
    const systemPrompt = this.generateSystemPrompt(this.blackboard)
    const decision = await this.decide(systemPrompt, contextMsg)

    if (!decision) {
      this.deps.logger.warn('Brain: No decision made.')
      return
    }

    // 4. Act (Execute Decision)
    this.deps.logger.log(`Brain: Thought: ${decision.thought}`)

    // Update Blackboard
    this.blackboard.update({
      currentGoal: decision.blackboard.currentGoal || this.blackboard.goal,
      currentThought: decision.blackboard.currentThought || this.blackboard.thought,
      executionStrategy: decision.blackboard.executionStrategy || this.blackboard.strategy,
    })

    // Issue Actions
    if (decision.actions && decision.actions.length > 0) {
      this.deps.taskExecutor.executeActions(decision.actions)
    }
  }

  private updatePerception(bot: MineflayerWithAgents): void {
    const pos = bot.bot.entity.position
    this.blackboard.updateSelf({
      location: pos,
      health: bot.bot.health,
      food: bot.bot.food,
    })

    this.blackboard.updateEnvironment({
      time: bot.bot.time.isDay ? 'day' : 'night',
      weather: bot.bot.isRaining ? 'rain' : 'clear',
      nearbyAgents: Object.keys(bot.bot.players).filter(p => p !== bot.bot.username),
    })
  }

  private async decide(sysPrompt: string, userMsg: string): Promise<BrainResponse | null> {
    try {
      const response = await this.deps.neuri.handleStateless(
        [
          system(sysPrompt),
          user(userMsg),
        ],
        async (ctx) => {
          const completion = await ctx.reroute('action', ctx.messages, {
            model: config.openai.model,
            response_format: { type: 'json_object' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any) as any

          if (!completion || !completion.choices?.[0]?.message?.content) {
            throw new Error('LLM failed to return content')
          }
          return completion.choices[0].message.content
        },
      )

      if (!response)
        return null

      const parsed = JSON.parse(response) as BrainResponse
      return parsed
    }
    catch (err) {
      this.deps.logger.withError(err).error('Brain: Decision failed')
      return null
    }
  }

  private generateSystemPrompt(blackboard: Blackboard): string {
    const actions = this.deps.taskExecutor.getAvailableActions()
    return generateBrainSystemPrompt(blackboard, actions)
  }
}
