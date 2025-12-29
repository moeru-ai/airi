import type { Client } from '@proj-airi/server-sdk'
import type { Neuri } from 'neuri'

import type { Mineflayer } from '../libs/mineflayer'
import type { ActionAgent, ChatAgent, PlanningAgent } from '../libs/mineflayer/base-agent'

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

export interface CognitiveEngineOptions {
  agent: Neuri
  airiClient: Client
}

// TODO: currently stimulus is just chat events, consider renaming to 'input' or 'user_interaction'
export type EventCategory = 'stimulus' | 'perception' | 'feedback' | 'world_update' | 'system_alert'

export interface BotEventSource {
  type: 'minecraft' | 'airi' | 'system'
  id: string // Agent/Source identifier
  reply?: (message: string) => void
}

export interface BotEvent<T = any> {
  type: EventCategory
  payload: T
  source: BotEventSource
  timestamp: number
  // Layered Architecture Metadata
  priority?: number // Higher is more urgent
  handled?: boolean // Set by Reflex layer to inhibit Conscious layer
}

export interface StimulusPayload {
  content: string
  metadata?: {
    entity?: any // prismarine-entity Entity
    displayName?: string
  }
}

export interface WorldUpdatePayload {
  event: string
  data: any
}
