import type { DamageSourceCause, DamageSourceMetadata } from '../../types/raw-events'

import { definePerceptionEvent } from '..'

interface DamageTakenExtract {
  amount: number
  damageSource: DamageSourceMetadata
}

let lastHealth: number | null = null

let pendingDamageAmount: number | null = null

function inferDamageSource(ctx: { bot: { entity?: any, entities?: Record<string, any> }, distanceTo: (entity: any) => number | null, maxDistance: number, isSelf: (entity: any) => boolean, entityId: (entity: any) => string }): DamageSourceMetadata {
  const entity = ctx.bot.entity as any
  const isInLava = Boolean(entity?.isInLava)
  if (isInLava)
    return { cause: 'lava' }

  const isInWater = Boolean(entity?.isInWater)
  if (isInWater)
    return { cause: 'drown' }

  const isOnFire = Boolean(entity?.isOnFire ?? entity?.fire)
  if (isOnFire)
    return { cause: 'fire' }

  const velocityY = typeof entity?.velocity?.y === 'number' ? entity.velocity.y : null
  const onGround = typeof entity?.onGround === 'boolean' ? entity.onGround : null
  if (velocityY !== null && velocityY < -0.2 && onGround === false)
    return { cause: 'gravity' }

  const entities = Object.values(ctx.bot.entities ?? {})
  let nearest: any | null = null
  let nearestDistance: number | null = null

  for (const candidate of entities) {
    if (!candidate || ctx.isSelf(candidate))
      continue

    const distance = ctx.distanceTo(candidate)
    if (distance === null || distance > ctx.maxDistance)
      continue

    if (nearestDistance === null || distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }

  if (nearest) {
    const entityType = nearest.type === 'player' ? 'player' : nearest.type === 'mob' ? 'mob' : null
    if (entityType) {
      return {
        cause: entityType,
        name: nearest.username ?? nearest.displayName ?? nearest.name,
        entityId: ctx.entityId(nearest),
        distance: nearestDistance ?? undefined,
      }
    }

    const name = String(nearest.name ?? '').toLowerCase()
    const cause = inferCauseFromName(name)
    if (cause !== 'unknown') {
      return {
        cause,
        name: nearest.name,
        entityId: ctx.entityId(nearest),
        distance: nearestDistance ?? undefined,
      }
    }
  }

  return { cause: 'unknown' }
}

function inferCauseFromName(name: string): DamageSourceCause {
  if (!name)
    return 'unknown'
  if (name.includes('anvil'))
    return 'anvil'
  if (name.includes('tnt') || name.includes('creeper') || name.includes('explosion'))
    return 'explosion'
  if (name.includes('arrow') || name.includes('trident') || name.includes('snowball'))
    return 'projectile'
  return 'unknown'
}

export const damageTakenEvent = definePerceptionEvent<[], DamageTakenExtract>({
  id: 'damage_taken',
  modality: 'felt',
  kind: 'damage_taken',

  mineflayer: {
    event: 'health',
    filter: (ctx) => {
      const current = ctx.bot.health
      const prev = lastHealth
      lastHealth = current

      if (typeof prev !== 'number') {
        pendingDamageAmount = null
        return false
      }

      const amount = prev - current
      if (amount <= 0) {
        pendingDamageAmount = null
        return false
      }

      pendingDamageAmount = amount
      return true
    },
    extract: (ctx) => {
      const current = ctx.bot.health
      const prev = lastHealth ?? current
      return {
        amount: pendingDamageAmount ?? Math.max(0, prev - current),
        damageSource: inferDamageSource(ctx),
      }
    },
  },

})
