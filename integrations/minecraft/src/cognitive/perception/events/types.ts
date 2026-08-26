import type { Bot } from 'mineflayer'
import type { Vec3 } from 'vec3'

export interface MineflayerBinding<TArgs extends any[] = any[], TExtract = any> {
  event: string
  extract: (ctx: PerceptionContext, ...args: TArgs) => TExtract
  filter?: (ctx: PerceptionContext, ...args: TArgs) => boolean
}

export interface PerceptionContext {
  bot: Bot
  distanceTo: (entity: any) => null | number
  distanceToPos: (pos: Vec3) => null | number
  entityId: (entity: any) => string
  isSelf: (entity: any) => boolean
  maxDistance: number
  selfUsername: string
}

export interface PerceptionEventDefinition<TArgs extends any[] = any[], TExtract = any> {
  id: string
  kind: string
  mineflayer: MineflayerBinding<TArgs, TExtract>

  modality: PerceptionModality
}

export type PerceptionModality = 'felt' | 'heard' | 'sighted' | 'system'

export interface RawPerceptionEventBase {
  kind: string
  modality: PerceptionModality
  source: string
  timestamp: number
}
