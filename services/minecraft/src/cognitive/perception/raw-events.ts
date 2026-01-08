import type { Vec3 } from 'vec3'

export type PerceptionModality = 'sighted' | 'heard' | 'felt'

export interface RawPerceptionEventBase {
  modality: PerceptionModality
  timestamp: number
  source: 'minecraft'
  pos?: Vec3
}

export interface SightedEntityMovedEvent extends RawPerceptionEventBase {
  modality: 'sighted'
  kind: 'entity_moved'
  entityType: 'player' | 'mob'
  entityId: string
  displayName?: string
  distance: number
  hasLineOfSight: boolean
}

export interface SightedArmSwingEvent extends RawPerceptionEventBase {
  modality: 'sighted'
  kind: 'arm_swing'
  entityType: 'player'
  entityId: string
  displayName?: string
  distance: number
  hasLineOfSight: boolean
}

export interface SightedSneakToggleEvent extends RawPerceptionEventBase {
  modality: 'sighted'
  kind: 'sneak_toggle'
  entityType: 'player'
  entityId: string
  displayName?: string
  distance: number
  hasLineOfSight: boolean
  sneaking: boolean
}

export type SightedEvent = SightedEntityMovedEvent | SightedArmSwingEvent | SightedSneakToggleEvent

export interface HeardSoundEvent extends RawPerceptionEventBase {
  modality: 'heard'
  kind: 'sound'
  soundId: string
  distance: number
  inferredEntityType?: 'player' | 'mob'
  inferredEntityId?: string
}

export type HeardEvent = HeardSoundEvent

export interface FeltDamageTakenEvent extends RawPerceptionEventBase {
  modality: 'felt'
  kind: 'damage_taken'
  amount?: number
  attackerEntityType?: 'player' | 'mob'
  attackerEntityId?: string
  distance?: number
}

export interface FeltItemCollectedEvent extends RawPerceptionEventBase {
  modality: 'felt'
  kind: 'item_collected'
  itemName: string
  count?: number
}

export type FeltEvent = FeltDamageTakenEvent | FeltItemCollectedEvent

export type RawPerceptionEvent = SightedEvent | HeardEvent | FeltEvent
