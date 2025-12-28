import type { Logg } from '@guiiai/logg'
import type { Neuri } from 'neuri'

import type { TaskExecutor } from '../action/task-executor'
import type { ActionInstruction } from '../action/types'
import type { EventManager } from '../perception/event-manager'
import type { MineflayerWithAgents, UserIntentPayload } from '../types'

import { system, user } from 'neuri/openai'
import { zodToJsonSchema } from 'zod-to-json-schema'

import { Blackboard } from './blackboard'

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

    // Listen to User Intents (Chat/Voice)
    // We treat these as "Sensory Inputs" that trigger the Cognitive Cycle
    this.deps.eventManager.on<UserIntentPayload>('user_intent', async (event) => {
      this.deps.logger.log(`Brain: Received intent from ${event.source.id}: ${event.payload.content}`)
      await this.processEvent(bot, event)
    })

    // Listen to Task Execution Events (Action Feedback)
    this.deps.taskExecutor.on('action:completed', async ({ action, result }) => {
      this.deps.logger.log(`Brain: Action completed: ${action.type}`)
      await this.processEvent(bot, {
        type: 'action:feedback',
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
        type: 'action:feedback',
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
    if (event.type === 'user_intent') {
      contextMsg = `User ${event.source.id} says: "${event.payload.content}"`
    }
    else if (event.type === 'action:feedback') {
      const { status, result, error, action } = event.payload
      const actionDesc = action.type === 'physical' ? action.step.tool : 'chat'
      contextMsg = `Action Feedback: ${actionDesc} ${status}. Result: ${JSON.stringify(result || error)}`
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
      nearbyPlayers: Object.keys(bot.bot.players).filter(p => p !== bot.bot.username),
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
    const actionDefinitions = actions.map((a) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema = zodToJsonSchema(a.schema as any)
      return {
        name: a.name,
        description: a.description,
        parameters: schema,
      }
    })

    const availableActionsJson = JSON.stringify(actionDefinitions, null, 2)

    return `你是Minecraft自主Agent的大脑。

当前状态（黑板）:
目标: "${blackboard.goal}"
思绪: "${blackboard.thought}"
策略: "${blackboard.strategy}"
自身: 位置${blackboard.self.location} 生命${blackboard.self.health} 饱食${blackboard.self.food}
环境: ${blackboard.environment.time} ${blackboard.environment.weather} 玩家[${blackboard.environment.nearbyPlayers.join(',')}]

可用动作:
${availableActionsJson}

规则:
1. 可执行上述物理动作(physical)或聊天动作(chat)
2. 可并行执行不冲突的多个动作(如聊天+行走)
3. 必须输出JSON

输出格式:
{
  "thought": "推理过程",
  "blackboard": {
    "currentGoal": "更新的目标",
    "currentThought": "内心独白",
    "executionStrategy": "短期计划"
  },
  "actions": [
    {"type":"chat","message":"..."},
    {"type":"physical","step":{"tool":"动作名","params":{...}}}
  ]
}
`
  }
}
