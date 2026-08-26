import { definePerceptionEvent } from '..'

interface ArmSwingExtract {
  displayName?: string
  distance: number
  entityId: string
  entityType: 'player'
  hasLineOfSight: boolean
  pos: any
}

export const armSwingEvent = definePerceptionEvent<[any], ArmSwingExtract>({
  id: 'arm_swing',
  kind: 'arm_swing',
  mineflayer: {
    event: 'entitySwingArm',
    extract: (ctx, entity) => ({
      displayName: entity?.username,
      distance: ctx.distanceTo(entity)!,
      entityId: ctx.entityId(entity),
      entityType: 'player',
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
