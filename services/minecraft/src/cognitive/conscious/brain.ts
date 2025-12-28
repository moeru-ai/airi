import type { Logg } from '@guiiai/logg'
import type { Neuri } from 'neuri'

import type { TaskExecutor } from '../action/task-executor'
import type { ActionInstruction } from '../action/types'
import type { EventManager } from '../perception/event-manager'
import type { BotEvent, MineflayerWithAgents, StimulusPayload } from '../types'

import { system, user } from 'neuri/openai'

import { config } from '../../composables/config'
import { DebugService } from '../../debug-server'
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

interface QueuedEvent {
  event: BotEvent
  resolve: () => void
  reject: (err: Error) => void
}

export class Brain {
  private blackboard: Blackboard
  private debugService: DebugService

  // Event Queue
  private queue: QueuedEvent[] = []
  private isProcessing = false

  constructor(private readonly deps: BrainDeps) {
    this.blackboard = new Blackboard()
    this.debugService = DebugService.getInstance()
  }

  public init(bot: MineflayerWithAgents): void {
    this.log('INFO', 'Brain: Initializing...')

    // Listen to Stimuli (Chat/Voice)
    // We treat these as "Sensory Inputs" that trigger the Cognitive Cycle
    this.deps.eventManager.on<StimulusPayload>('stimulus', async (event) => {
      if (event.handled) {
        this.log('INFO', `Brain: Stimulus from ${event.source.id} already handled by reflex, ignoring.`)
        return
      }
      this.log('INFO', `Brain: Received stimulus from ${event.source.id}: ${event.payload.content}`)
      await this.enqueueEvent(bot, event)
    })

    // Listen to Task Execution Events (Action Feedback)
    this.deps.taskExecutor.on('action:completed', async ({ action, result }) => {
      this.log('INFO', `Brain: Action completed: ${action.type}`)
      await this.enqueueEvent(bot, {
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
      this.log('WARN', `Brain: Action failed: ${action.type}`, { error })
      await this.enqueueEvent(bot, {
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

    this.log('INFO', 'Brain: Online.')
    this.updateDebugState()
  }

  // --- Event Queue Logic ---

  private async enqueueEvent(bot: MineflayerWithAgents, event: BotEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ event, resolve, reject })
      this.updateDebugState()
      this.processQueue(bot)
    })
  }

  private async processQueue(bot: MineflayerWithAgents): Promise<void> {
    if (this.isProcessing)
      return
    if (this.queue.length === 0)
      return

    this.isProcessing = true
    const item = this.queue.shift()!
    this.updateDebugState(item.event)

    try {
      await this.processEvent(bot, item.event)
      item.resolve()
    }
    catch (err) {
      this.log('ERROR', 'Brain: Error processing event', { error: err })
      item.reject(err as Error)
    }
    finally {
      this.isProcessing = false
      this.updateDebugState()
      // Context switch: Check queue again
      if (this.queue.length > 0) {
        setImmediate(() => this.processQueue(bot))
      }
    }
  }

  // --- Cognitive Cycle ---

  private async processEvent(bot: MineflayerWithAgents, event: BotEvent): Promise<void> {
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
      this.log('WARN', 'Brain: No decision made.')
      return
    }

    // 4. Act (Execute Decision)
    this.log('INFO', `Brain: Thought: ${decision.thought}`)

    // Update Blackboard
    this.blackboard.update({
      currentGoal: decision.blackboard.currentGoal || this.blackboard.goal,
      currentThought: decision.blackboard.currentThought || this.blackboard.thought,
      executionStrategy: decision.blackboard.executionStrategy || this.blackboard.strategy,
    })

    // Sync Blackboard to Debug
    this.debugService.updateBlackboard(this.blackboard)

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
      nearbyPlayers: Object.keys(bot.bot.players).filter(p => p !== bot.bot.username),
    })

    // Sync Blackboard to Debug
    this.debugService.updateBlackboard(this.blackboard)
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
          } as any) as any

          // Trace LLM
          this.debugService.traceLLM({
            route: 'action',
            messages: ctx.messages,
            content: completion?.choices?.[0]?.message?.content,
            usage: completion?.usage,
            model: config.openai.model,
          })

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
      this.log('ERROR', 'Brain: Decision failed', { error: err })
      return null
    }
  }

  private generateSystemPrompt(blackboard: Blackboard): string {
    const actions = this.deps.taskExecutor.getAvailableActions()
    return generateBrainSystemPrompt(blackboard, actions)
  }

  // --- Debug Helpers ---

  private log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, fields?: any) {
    // Dual logging: Console/File via Logger AND DebugServer
    if (level === 'ERROR')
      this.deps.logger.withError(fields?.error).error(message)
    else if (level === 'WARN')
      this.deps.logger.warn(message, fields)
    else this.deps.logger.log(message, fields)

    this.debugService.log(level, message, fields)
  }

  private updateDebugState(processingEvent?: BotEvent) {
    this.debugService.updateQueue(
      this.queue.map(q => q.event),
      processingEvent,
    )
  }
}
