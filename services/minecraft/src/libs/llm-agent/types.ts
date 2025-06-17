import type { Client } from '@proj-airi/server-sdk'
import type { Neuri } from 'neuri'

import type { Mineflayer } from '../mineflayer'
import type { ActionAgent, ChatAgent, PlanningAgent } from '../mineflayer/base-agent'

export interface LLMConfig {
  agent: Neuri
  model?: string
  retryLimit?: number
  delayInterval?: number
  maxContextLength?: number
}

export interface LLMResponse {
  content: string
  usage?: any
}

export interface MineflayerWithAgents extends Mineflayer {
  planning: PlanningAgent
  action: ActionAgent
  chat: ChatAgent
}

export interface LLMAgentOptions {
  agent: Neuri
  airiClient: Client
}
