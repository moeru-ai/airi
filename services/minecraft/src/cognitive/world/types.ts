import type { Vec3 } from 'vec3'

/**
 * State of an entity at a point in time
 */
export interface EntityState {
  id: string
  type: 'player' | 'mob' | 'item'
  name?: string

  // Position & Movement
  position: Vec3
  velocity: Vec3
  yaw: number
  pitch: number

  // Status flags
  isSneaking: boolean
  isSprinting: boolean
  onGround: boolean

  // Timestamps
  firstSeen: number
  lastUpdate: number
}

/**
 * A change in entity state
 */
export interface StateChange {
  entityId: string
  field: keyof EntityState
  from: unknown
  to: unknown
  timestamp: number
}

/**
 * Belief about an entity's behavior
 */
export interface Belief {
  confidence: number // 0-1
  data?: Record<string, unknown>
}

/**
 * Definition of a pattern that computes beliefs
 */
export interface PatternDefinition {
  id: string
  category: 'social' | 'spatial' | 'threat' | 'neutral'
  description: string

  compute: (
    entityId: string,
    getState: (id: string) => EntityState | null,
    getHistory: (id: string, since: number) => StateChange[],
    selfPosition: Vec3 | null,
  ) => Belief
}

/**
 * View of an entity for upper layers
 */
export interface EntityView {
  id: string
  name: string
  type: EntityState['type']
  state: EntityState
  beliefs: Record<string, Belief>
  distanceToSelf: number
}
