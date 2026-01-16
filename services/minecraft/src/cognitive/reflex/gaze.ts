import type { Bot } from 'mineflayer'

import { Vec3 } from 'vec3'

interface Vec3Like { x: number, y: number, z: number }

interface PlayerEntityLike {
  type?: string
  username?: string
  position: Vec3
  yaw?: number
  pitch?: number
}

export interface PlayerGazeResult {
  playerName: string
  distanceToSelf: number
  lookPoint: Vec3Like
  hitBlock: null | {
    name: string
    pos: Vec3Like
  }
}

function directionFromYawPitch(yaw: number, pitch: number): Vec3Like {
  const x = -Math.sin(yaw) * Math.cos(pitch)
  const y = Math.sin(pitch)
  const z = -Math.cos(yaw) * Math.cos(pitch)
  return { x, y, z }
}

function normalize(v: Vec3Like): Vec3Like {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

function add(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function scale(v: Vec3Like, s: number): Vec3Like {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}

function floorVec(v: Vec3Like): Vec3Like {
  return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }
}

function distance(a: Vec3Like, b: Vec3Like): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function rayTraceBlockFromEntity(
  bot: Bot,
  entity: PlayerEntityLike,
  options?: {
    maxDistance?: number
    step?: number
    eyeHeight?: number
  },
): { lookPoint: Vec3Like, hitBlock: PlayerGazeResult['hitBlock'] } {
  const maxDistance = options?.maxDistance ?? 32
  const step = options?.step ?? 0.25
  const eyeHeight = options?.eyeHeight ?? 1.62

  const yaw = entity.yaw ?? 0
  const pitch = entity.pitch ?? 0

  const dir = normalize(directionFromYawPitch(yaw, pitch))
  const origin = add(entity.position, { x: 0, y: eyeHeight, z: 0 })

  const lookPoint = add(origin, scale(dir, maxDistance))

  let lastBlockPosKey: string | null = null

  for (let d = 0; d <= maxDistance; d += step) {
    const p = add(origin, scale(dir, d))
    const bp = floorVec(p)
    const key = `${bp.x},${bp.y},${bp.z}`
    if (key === lastBlockPosKey)
      continue
    lastBlockPosKey = key

    const block = bot.blockAt(new Vec3(bp.x, bp.y, bp.z))
    if (!block)
      continue

    if (block.name !== 'air') {
      return {
        lookPoint,
        hitBlock: {
          name: block.name,
          pos: { x: block.position.x, y: block.position.y, z: block.position.z },
        },
      }
    }
  }

  return { lookPoint, hitBlock: null }
}

export function computeNearbyPlayerGaze(
  bot: Bot,
  options?: {
    maxDistance?: number
    nearbyDistance?: number
  },
): PlayerGazeResult[] {
  const self = bot.entity
  if (!self)
    return []

  const nearbyDistance = options?.nearbyDistance ?? 16

  const players = Object.values(bot.players ?? {})
    .map(p => p?.entity as PlayerEntityLike | undefined)
    .filter((e): e is PlayerEntityLike => Boolean(e && e.type === 'player' && e.username))
    .filter(e => e.username !== bot.username)

  const selfPos = self.position

  return players
    .map((p) => {
      const dist = distance(selfPos, p.position)
      return { p, dist }
    })
    .filter(x => x.dist <= nearbyDistance)
    .sort((a, b) => a.dist - b.dist)
    .map(({ p, dist }) => {
      const { lookPoint, hitBlock } = rayTraceBlockFromEntity(bot, p, { maxDistance: options?.maxDistance ?? 32 })
      return {
        playerName: p.username!,
        distanceToSelf: dist,
        lookPoint,
        hitBlock,
      }
    })
}
