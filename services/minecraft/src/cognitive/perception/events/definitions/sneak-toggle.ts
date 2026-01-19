import type { PerceptionContext } from '../types'

import { definePerceptionEvent } from '..'

interface SneakToggleExtract {
  entityType: 'player'
  entityId: string
  displayName?: string
  distance: number
  hasLineOfSight: boolean
  sneaking: boolean
  pos: any
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
  modality: 'sighted',
  kind: 'sneak_toggle',

  mineflayer: {
    event: 'entityUpdate',
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
    extract: (ctx: PerceptionContext, entity: any) => ({
      entityType: 'player',
      entityId: ctx.entityId(entity),
      displayName: entity?.username,
      distance: ctx.distanceTo(entity)!,
      hasLineOfSight: true,
      sneaking: extractSneakingState(entity),
      pos: entity?.position,
    }),
  },

  saliency: {
    threshold: 5,
    key: 'teabag:player',
  },

  signal: {
    type: 'entity_attention',
    description: extracted => `Player ${extracted.displayName || 'unknown'} is teabagging (rapid sneaking)`,
    metadata: extracted => ({
      kind: 'player',
      action: 'teabag',
      distance: extracted.distance,
      hasLineOfSight: extracted.hasLineOfSight,
      displayName: extracted.displayName,
    }),
  },

  routes: ['conscious', 'reflex', 'debug'],
})
