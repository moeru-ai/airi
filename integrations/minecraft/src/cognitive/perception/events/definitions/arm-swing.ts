import { definePerceptionEvent } from '..'

interface ArmSwingExtract {
  entityType: 'player'
  entityId: string
  displayName?: string
  distance: number
  hasLineOfSight: boolean
  pos: any
}

export const armSwingEvent = definePerceptionEvent<[any], ArmSwingExtract>({
  id: 'arm_swing',
  modality: 'sighted',
  kind: 'arm_swing',

  mineflayer: {
    event: 'entitySwingArm',
    filter: (ctx, entity) => {
      if (!entity)
        return false
      if (ctx.isSelf(entity))
        return false
      const dist = ctx.distanceTo(entity)
      return dist !== null && dist <= ctx.maxDistance
    },
    extract: (ctx, entity) => ({
      entityType: 'player',
      entityId: ctx.entityId(entity),
      displayName: entity?.username,
      distance: ctx.distanceTo(entity)!,
      hasLineOfSight: true,
      pos: entity?.position,
    }),
  },

})
