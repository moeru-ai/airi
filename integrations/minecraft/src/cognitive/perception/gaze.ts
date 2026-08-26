import type { Bot } from 'mineflayer'

import { Vec3 } from 'vec3'

export interface PlayerGazeResult {
  distanceToSelf: number
  hitBlock: null | {
    name: string
    pos: Vec3Like
  }
  lookPoint: Vec3Like
  playerName: string
}

interface PlayerEntityLike {
  pitch?: number
  position: Vec3
  type?: string
  username?: string
  yaw?: number
}

interface Vec3Like { x: number, y: number, z: number }

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
      return { dist, p }
    })
    .filter(x => x.dist <= nearbyDistance)
    .sort((a, b) => a.dist - b.dist)
    .map(({ dist, p }) => {
      const { hitBlock, lookPoint } = rayTraceBlockFromEntity(bot, p, { maxDistance: options?.maxDistance ?? 32 })
      return {
        distanceToSelf: dist,
        hitBlock,
        lookPoint,
        playerName: p.username!,
      }
    })
}

export function rayTraceBlockFromEntity(
  bot: Bot,
  entity: PlayerEntityLike,
  options?: {
    eyeHeight?: number
    maxDistance?: number
    step?: number
  },
): { hitBlock: PlayerGazeResult['hitBlock'], lookPoint: Vec3Like } {
  const maxDistance = options?.maxDistance ?? 32
  const step = options?.step ?? 0.25
  const eyeHeight = options?.eyeHeight ?? 1.62

  const yaw = entity.yaw ?? 0
  const pitch = entity.pitch ?? 0

  const dir = normalize(directionFromYawPitch(yaw, pitch))
  const origin = add(entity.position, { x: 0, y: eyeHeight, z: 0 })

  const lookPoint = add(origin, scale(dir, maxDistance))

  let lastBlockPosKey: null | string = null

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
        hitBlock: {
          name: block.name,
          pos: { x: block.position.x, y: block.position.y, z: block.position.z },
        },
        lookPoint,
      }
    }
  }

  return { hitBlock: null, lookPoint }
}

function add(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function directionFromYawPitch(yaw: number, pitch: number): Vec3Like {
  const x = -Math.sin(yaw) * Math.cos(pitch)
  // Mineflayer pitch convention: positive pitch looks up, negative pitch looks down.
  const y = Math.sin(pitch)
  const z = -Math.cos(yaw) * Math.cos(pitch)
  return { x, y, z }
}

function distance(a: Vec3Like, b: Vec3Like): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function floorVec(v: Vec3Like): Vec3Like {
  return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) }
}

function normalize(v: Vec3Like): Vec3Like {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

function scale(v: Vec3Like, s: number): Vec3Like {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}
