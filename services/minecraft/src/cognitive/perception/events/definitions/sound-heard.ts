import type { Vec3 } from 'vec3'

import { definePerceptionEvent } from '..'

interface SoundHeardExtract {
  soundId: string
  distance: number
  pos: Vec3
}

export const soundHeardEvent = definePerceptionEvent<[string, Vec3], SoundHeardExtract>({
  id: 'sound_heard',
  modality: 'heard',
  kind: 'sound',

  mineflayer: {
    event: 'soundEffectHeard',
    filter: (ctx, _soundId, pos) => {
      if (!pos)
        return false
      const dist = ctx.distanceToPos(pos)
      return dist !== null && dist <= ctx.maxDistance
    },
    extract: (ctx, soundId, pos) => ({
      soundId,
      distance: ctx.distanceToPos(pos)!,
      pos,
    }),
  },

})
