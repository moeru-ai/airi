import { describe, expect, it } from 'vitest'
import { Vec3 } from 'vec3'

import { rayTraceBlockFromEntity } from './gaze'

describe('rayTraceBlockFromEntity', () => {
  it('detects block when player looks downward', () => {
    const bot = {
      blockAt(pos: Vec3) {
        if (pos.x === 0 && pos.y === 63 && pos.z === -3) {
          return {
            name: 'grass_block',
            position: new Vec3(0, 63, -3),
          }
        }
        return { name: 'air', position: pos }
      },
    } as any

    const entity = {
      type: 'player',
      username: 'tester',
      position: new Vec3(0, 64, 0),
      yaw: 0,
      pitch: Math.PI / 4,
    }

    const result = rayTraceBlockFromEntity(bot, entity, { maxDistance: 8, step: 0.1 })
    expect(result.hitBlock?.name).toBe('grass_block')
    expect(result.hitBlock?.pos).toEqual({ x: 0, y: 63, z: -3 })
  })

  it('returns null hitBlock when no solid block is intersected', () => {
    const bot = {
      blockAt(pos: Vec3) {
        return { name: 'air', position: pos }
      },
    } as any

    const entity = {
      type: 'player',
      username: 'tester',
      position: new Vec3(0, 64, 0),
      yaw: 0,
      pitch: -Math.PI / 4,
    }

    const result = rayTraceBlockFromEntity(bot, entity, { maxDistance: 8, step: 0.1 })
    expect(result.hitBlock).toBeNull()
  })
})
