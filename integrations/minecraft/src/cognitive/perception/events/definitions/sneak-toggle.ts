import type { PerceptionContext } from '../types'

import { definePerceptionEvent } from '..'

interface SneakToggleExtract {
  displayName?: string
  distance: number
  entityId: string
  entityType: 'player'
  hasLineOfSight: boolean
  pos: any
  sneaking: boolean
}

const sneakingState = new Map<string, boolean>()

function extractSneakingState(entity: any): boolean {
  const flags = entity?.metadata?.[0]
  return typeof flags === 'number' ? !!(flags & 0x02) : false
}

function hasSneakingStateChanged(entityId: string, isSneaking: boolean): boolean {
  const lastState = sneakingState.get(entityId)
  return lastState !== isSneaking
}

export const sneakToggleEvent = definePerceptionEvent<[any], SneakToggleExtract>({
  id: 'sneak_toggle',
  kind: 'sneak_toggle',
  mineflayer: {
    event: 'entityUpdate',
    extract: (ctx: PerceptionContext, entity: any) => ({
      displayName: entity?.username,
      distance: ctx.distanceTo(entity)!,
      entityId: ctx.entityId(entity),
      entityType: 'player',
      hasLineOfSight: true,
      pos: entity?.position,
      sneaking: extractSneakingState(entity),
    }),
    filter: (ctx: PerceptionContext, entity: any) => {
      if (!entity || entity.type !== 'player')
        return false
      if (ctx.isSelf(entity))
        return false

      const entityId = ctx.entityId(entity)
      const isSneaking = extractSneakingState(entity)

      if (!hasSneakingStateChanged(entityId, isSneaking))
        return false

      sneakingState.set(entityId, isSneaking)

      const dist = ctx.distanceTo(entity)
      return dist !== null && dist <= ctx.maxDistance
    },
  },

  modality: 'sighted',

})
