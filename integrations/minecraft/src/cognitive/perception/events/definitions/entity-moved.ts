import { definePerceptionEvent } from '..'

interface EntityMovedExtract {
  displayName?: string
  distance: number
  entityId: string
  entityType: 'mob' | 'player'
  hasLineOfSight: boolean
  pos: any
}

export const entityMovedEvent = definePerceptionEvent<[any], EntityMovedExtract>({
  id: 'entity_moved',
  kind: 'entity_moved',
  mineflayer: {
    event: 'entityMoved',
    extract: (ctx, entity) => ({
      displayName: entity?.username,
      distance: ctx.distanceTo(entity)!,
      entityId: ctx.entityId(entity),
      entityType: entity?.type === 'player' ? 'player' : 'mob',
      hasLineOfSight: true,
      pos: entity?.position,
    }),
    filter: (ctx, entity) => {
      if (!entity)
        return false
      if (ctx.isSelf(entity))
        return false
      const dist = ctx.distanceTo(entity)
      return dist !== null && dist <= ctx.maxDistance
    },
  },

  modality: 'sighted',

})
