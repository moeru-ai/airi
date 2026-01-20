import type { Vec3 } from 'vec3'

export type PerceptionModality = 'sighted' | 'heard' | 'felt' | 'system'

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
  damageSource?: DamageSourceMetadata
}

export type DamageSourceCause
  = | 'player'
    | 'mob'
    | 'fall'
    | 'lava'
    | 'fire'
    | 'drown'
    | 'anvil'
    | 'gravity'
    | 'explosion'
    | 'projectile'
    | 'unknown'

export interface DamageSourceMetadata {
  cause: DamageSourceCause
  name?: string
  entityId?: string
  distance?: number
}

export interface FeltItemCollectedEvent extends RawPerceptionEventBase {
  modality: 'felt'
  kind: 'item_collected'
  itemName: string
  count?: number
}

export type FeltEvent = FeltDamageTakenEvent | FeltItemCollectedEvent

export interface PlayerJoinedEvent extends RawPerceptionEventBase {
  modality: 'system'
  kind: 'player_joined'
  playerId: string
  displayName?: string
}

export interface SystemMessageEvent extends RawPerceptionEventBase {
  modality: 'system'
  kind: 'system_message'
  message: string
  position: string
}

export type SystemEvent = PlayerJoinedEvent | SystemMessageEvent

export type RawPerceptionEvent = SightedEvent | HeardEvent | FeltEvent | SystemEvent
