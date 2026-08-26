import type { Client } from '@proj-airi/server-sdk'

import type { Mineflayer } from '../../libs/mineflayer'
import type { ReflexManager } from '../reflex/reflex-manager'

// FIXME unsafe type
export interface BotEvent<T = any> {
  handled?: boolean // Set by Reflex layer to inhibit Conscious layer
  payload: T
  // Layered Architecture Metadata
  priority?: number // Higher is more urgent
  source: BotEventSource
  timestamp: number
  type: EventCategory
}

export interface BotEventSource {
  id: string // Agent/Source identifier
  reply?: (message: string) => void
  type: 'airi' | 'minecraft' | 'system'
}

export interface CognitiveEngineOptions {
  airiClient: Client
}

// TODO: currently stimulus is just chat events, consider renaming to 'input' or 'user_interaction'
export type EventCategory = 'feedback' | 'perception' | 'system_alert'

export interface MineflayerWithAgents extends Mineflayer {
  reflexManager: ReflexManager
}
