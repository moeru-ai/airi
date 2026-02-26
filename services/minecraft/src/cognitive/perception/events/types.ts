import type { Bot } from 'mineflayer'
import type { Vec3 } from 'vec3'

export type PerceptionModality = 'sighted' | 'heard' | 'felt' | 'system'

export interface PerceptionContext {
  bot: Bot
  selfUsername: string
  maxDistance: number
  distanceTo: (entity: any) => number | null
  distanceToPos: (pos: Vec3) => number | null
  isSelf: (entity: any) => boolean
  entityId: (entity: any) => string
}

export interface MineflayerBinding<TArgs extends any[] = any[], TExtract = any> {
  event: string
  filter?: (ctx: PerceptionContext, ...args: TArgs) => boolean
  extract: (ctx: PerceptionContext, ...args: TArgs) => TExtract
}

export interface PerceptionEventDefinition<TArgs extends any[] = any[], TExtract = any> {
  id: string
  modality: PerceptionModality
  kind: string

  mineflayer: MineflayerBinding<TArgs, TExtract>
}

export interface RawPerceptionEventBase {
  modality: PerceptionModality
  kind: string
  timestamp: number
  source: string
}
