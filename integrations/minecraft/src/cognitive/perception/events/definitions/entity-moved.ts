import { definePerceptionEvent } from '..'

interface EntityMovedExtract {
  entityType: 'player' | 'mob'
  entityId: string
  displayName?: string
  distance: number
  hasLineOfSight: boolean
  pos: any
}

export const entityMovedEvent = definePerceptionEvent<[any], EntityMovedExtract>({
  id: 'entity_moved',
  modality: 'sighted',
  kind: 'entity_moved',

  mineflayer: {
    event: 'entityMoved',
    filter: (ctx, entity) => {
      if (!entity)
        return false
      if (ctx.isSelf(entity))
        return false
      const dist = ctx.distanceTo(entity)
      return dist !== null && dist <= ctx.maxDistance
    },
    extract: (ctx, entity) => ({
      entityType: entity?.type === 'player' ? 'player' : 'mob',
      entityId: ctx.entityId(entity),
      displayName: entity?.username,
      distance: ctx.distanceTo(entity)!,
      hasLineOfSight: true,
      pos: entity?.position,
    }),
  },

})
