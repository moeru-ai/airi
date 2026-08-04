import type { DamageSourceCause, DamageSourceMetadata } from '../../types/raw-events'

import { definePerceptionEvent } from '..'
import { recentAttacker } from './attacker-tracker'
import { classifyRecentFall } from './fall-tracker'

interface DamageTakenExtract {
  amount: number
  damageSource: DamageSourceMetadata
  /**
   * Attacker's in-game name when the damage came from an entity, else '' (always defined so the
   *  rule template never leaves a raw `{{ }}` placeholder for environmental causes).
   */
  attacker: string
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

  // Fall damage: by the time the health event fires the entity has usually already landed
  // (onGround=true, velocity reset by prismarine-physics), so the instantaneous velocity is no
  // longer a reliable tell. Consult the physics-tick fall tracker, which remembers the descent from
  // just before landing. See fall-tracker.ts.
  if (classifyRecentFall(entity, Date.now()))
    return { cause: 'fall' }

  // Real attacker: mineflayer's `entityHurt` (1.20+ damage_event) tells us the ACTUAL entity that
  // dealt the damage — the skeleton that shot the arrow, the player who hit. Prefer it over the
  // unreliable "nearest entity" guess below, which blamed the master for a mob's ranged attack when
  // the master stood nearby. See attacker-tracker.ts.
  const attacker = recentAttacker(Date.now())
  if (attacker) {
    const attributed = attributeDamageEntity(attacker, undefined, ctx.entityId)
    if (attributed)
      return attributed
  }

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
    const attributed = attributeDamageEntity(nearest, nearestDistance ?? undefined, ctx.entityId)
    if (attributed)
      return attributed
  }

  return { cause: 'unknown' }
}

/**
 * Map an attacking entity to a damage source (player → its username, mob → its species, else infer
 * from the entity name for anvils/explosions/projectiles). Returns null when the entity is not a
 * recognisable damage source. Shared by the real-attacker and nearest-entity paths so both attribute
 * identically.
 */
function attributeDamageEntity(entity: any, distance: number | undefined, entityIdOf: (e: any) => string): DamageSourceMetadata | null {
  const entityType = entity?.type === 'player' ? 'player' : entity?.type === 'mob' ? 'mob' : null
  if (entityType) {
    return {
      cause: entityType,
      name: entity.username ?? entity.displayName ?? entity.name,
      entityId: entityIdOf(entity),
      distance,
    }
  }

  const cause = inferCauseFromName(String(entity?.name ?? '').toLowerCase())
  if (cause !== 'unknown') {
    return { cause, name: entity.name, entityId: entityIdOf(entity), distance }
  }

  return null
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
      const damageSource = inferDamageSource(ctx)
      return {
        amount: pendingDamageAmount ?? Math.max(0, prev - current),
        damageSource,
        attacker: damageSource.name ?? '',
      }
    },
  },

})
