import type { Logg } from '@guiiai/logg'

import type { PlanStep } from '../../cognitive/action/types'
import type { Action } from './action'

import EventEmitter3 from 'eventemitter3'

import { useLogg } from '@guiiai/logg'

export interface ActionAgent extends BaseAgent {
  getAvailableActions: () => Action[]
  performAction: (step: PlanStep) => Promise<string>
  type: 'action'
}

export interface AgentConfig {
  id: string
  type: AgentType
}

export type AgentType = 'action' | 'chat' | 'memory' | 'planning'

export interface BaseAgent {
  destroy: () => Promise<void>
  readonly id: string
  init: () => Promise<void>
  readonly type: AgentType
}

export interface ChatAgent extends BaseAgent {
  endConversation: (player: string) => void
  processMessage: (message: string, sender: string) => Promise<string>
  sendMessage: (message: string) => Promise<void>
  startConversation: (player: string) => void
  type: 'chat'
}

export interface MemoryAgent extends BaseAgent {
  forget: (key: string) => void
  getMemorySnapshot: () => Record<string, unknown>
  recall: <T>(key: string) => T | undefined
  remember: (key: string, value: unknown) => void
  type: 'memory'
}

export interface Plan {
  goal: string
  requiresAction: boolean
  status: 'cancelled' | 'completed' | 'failed' | 'in_progress' | 'pending'
  steps: PlanStep[]
}

export interface PlanningAgent extends BaseAgent {
  adjustPlan: (plan: Plan, feedback: string, sender: string, availableActions?: Action[]) => Promise<Plan>
  createPlan: (goal: string, availableActions?: Action[]) => Promise<Plan>
  type: 'planning'
}

export abstract class AbstractAgent extends EventEmitter3 implements BaseAgent {
  public readonly id: string
  public readonly name: string
  public readonly type: AgentConfig['type']

  protected initialized: boolean
  protected logger: Logg
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

  public async destroy(): Promise<void> {
    if (!this.initialized) {
      return
    }

    this.logger.log('Destroying agent')
    await this.destroyAgent()
    this.initialized = false
  }

  public handleMessage(sender: string, message: string): void {
    this.logger.withFields({ message, sender }).log('Received message')
    this.emit('message', { message, sender })
  }

  // Agent interface implementation
  // public isIdle(): boolean {
  //   return !this.actionManager.executing
  // }

  public async init(): Promise<void> {
    if (this.initialized) {
      return
    }

    await this.initializeAgent()
    this.initialized = true
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

  protected abstract destroyAgent(): Promise<void>
  // Methods to be implemented by specific agents
  protected abstract initializeAgent(): Promise<void>
}
