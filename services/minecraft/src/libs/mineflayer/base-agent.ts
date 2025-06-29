import type { PlanStep } from '../../agents/planning/adapter'
import type { Logger } from '../../utils/logger'
import type { Action } from './action'

import EventEmitter3 from 'eventemitter3'

import { useLogg } from '@guiiai/logg'

export type AgentType = 'action' | 'memory' | 'planning' | 'chat'

export interface AgentConfig {
  id: string
  type: AgentType
}

export interface BaseAgent {
  readonly id: string
  readonly type: AgentType
  init: () => Promise<void>
  destroy: () => Promise<void>
}

export interface ActionAgent extends BaseAgent {
  type: 'action'
  performAction: (step: PlanStep) => Promise<string>
  getAvailableActions: () => Action[]
}

export interface MemoryAgent extends BaseAgent {
  type: 'memory'
  remember: (key: string, value: unknown) => void
  recall: <T>(key: string) => T | undefined
  forget: (key: string) => void
  getMemorySnapshot: () => Record<string, unknown>
}

export interface Plan {
  goal: string
  steps: PlanStep[]
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  requiresAction: boolean
}

export interface PlanningAgent extends BaseAgent {
  type: 'planning'
  createPlan: (goal: string) => Promise<Plan>
  executePlan: (plan: Plan) => Promise<void>
  adjustPlan: (plan: Plan, feedback: string, sender: string) => Promise<Plan>
}

export interface ChatAgent extends BaseAgent {
  type: 'chat'
  processMessage: (message: string, sender: string) => Promise<string>
  startConversation: (player: string) => void
  endConversation: (player: string) => void
}

export abstract class AbstractAgent extends EventEmitter3 implements BaseAgent {
  public readonly id: string
  public readonly type: AgentConfig['type']
  public readonly name: string

  protected initialized: boolean
  protected logger: Logger
  // protected actionManager: ReturnType<typeof useActionManager>
  // protected conversationStore: ReturnType<typeof useConversationStore>

  constructor(config: AgentConfig) {
    super()
    this.id = config.id // TODO: use uuid, is it needed?
    this.type = config.type
    this.name = `${this.type}-agent`
    this.initialized = false
    this.logger = useLogg(this.name).useGlobalConfig()

    // Initialize managers
    // this.actionManager = useActionManager(this)
    // this.conversationStore = useConversationStore({
    //   agent: this,
    //   chatBotMessages: true,
    // })
  }

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.initializeAgent()
    this.initialized = true
  }

  public async destroy(): Promise<void> {
    if (!this.initialized) {
      return
    }

    this.logger.log('Destroying agent')
    await this.destroyAgent()
    this.initialized = false
  }

  // Agent interface implementation
  // public isIdle(): boolean {
  //   return !this.actionManager.executing
  // }

  public handleMessage(sender: string, message: string): void {
    this.logger.withFields({ sender, message }).log('Received message')
    this.emit('message', { sender, message })
  }

  public openChat(message: string): void {
    this.logger.withField('message', message).log('Opening chat')
    this.emit('chat', message)
  }

  // public clearBotLogs(): void {
  //   // Implement if needed
  // }

  public requestInterrupt(): void {
    this.emit('interrupt')
  }

  // Methods to be implemented by specific agents
  protected abstract initializeAgent(): Promise<void>
  protected abstract destroyAgent(): Promise<void>
}
