import type { Client } from '@proj-airi/server-sdk'

import type { Mineflayer } from '../../libs/mineflayer'
import type { ReflexManager } from '../reflex/reflex-manager'

export interface MineflayerWithAgents extends Mineflayer {
  reflexManager: ReflexManager
}

export interface CognitiveEngineOptions {
  airiClient: Client
}

// TODO: currently stimulus is just chat events, consider renaming to 'input' or 'user_interaction'
export type EventCategory = 'perception' | 'feedback' | 'world_update' | 'system_alert'

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

export interface WorldUpdatePayload {
  event: string
  data: any
}
