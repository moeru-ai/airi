import type { Logg } from '@guiiai/logg'
import type { Vec3 } from 'vec3'

import type { MineflayerWithAgents } from '../types'
import type {
  FeltDamageTakenEvent,
  FeltItemCollectedEvent,
  HeardSoundEvent,
  RawPerceptionEvent,
  SightedArmSwingEvent,
  SightedEntityMovedEvent,
  SightedSneakToggleEvent,
} from './raw-events'

export class MineflayerPerceptionCollector {
  private bot: MineflayerWithAgents | null = null
  private readonly listeners: Array<{
    event: string
    handler: (...args: any[]) => void
  }> = []

  private readonly lastMovedEmitAt = new Map<string, number>()
  private readonly lastSneak = new Map<string, boolean>()
  private lastSelfHealth: number | null = null

  constructor(
    private readonly deps: {
      logger: Logg
      emitRaw: (event: RawPerceptionEvent) => void
      maxDistance: number
    },
  ) { }

  public init(bot: MineflayerWithAgents): void {
    this.bot = bot
    this.lastSelfHealth = bot.bot.health

    this.onBot('entityMoved', (entity: any) => {
      const now = Date.now()
      const dist = this.distanceTo(entity)
      if (dist === null || dist > this.deps.maxDistance)
        return

      const entityId = this.entityId(entity)
      const last = this.lastMovedEmitAt.get(entityId) ?? 0
      if (now - last < 100)
        return
      this.lastMovedEmitAt.set(entityId, now)

      const event: SightedEntityMovedEvent = {
        modality: 'sighted',
        kind: 'entity_moved',
        entityType: entity?.type === 'player' ? 'player' : 'mob',
        entityId,
        displayName: entity?.username,
        distance: dist,
        hasLineOfSight: this.hasLineOfSight(entity),
        timestamp: now,
        source: 'minecraft',
        pos: entity?.position,
      }

      this.deps.emitRaw(event)
    })

    this.onBot('entitySwingArm', (entity: any) => {
      const now = Date.now()
      const dist = this.distanceTo(entity)
      if (dist === null || dist > this.deps.maxDistance)
        return

      const event: SightedArmSwingEvent = {
        modality: 'sighted',
        kind: 'arm_swing',
        entityType: 'player',
        entityId: this.entityId(entity),
        displayName: entity?.username,
        distance: dist,
        hasLineOfSight: this.hasLineOfSight(entity),
        timestamp: now,
        source: 'minecraft',
        pos: entity?.position,
      }

      this.deps.emitRaw(event)
    })

    this.onBot('entityUpdate', (entity: any) => {
      if (!entity || entity.type !== 'player')
        return

      const now = Date.now()
      const dist = this.distanceTo(entity)
      if (dist === null || dist > this.deps.maxDistance)
        return

      const entityId = this.entityId(entity)

      const flags = entity?.metadata?.[0]
      const sneaking = typeof flags === 'number' ? !!(flags & 0x02) : false

      const prev = this.lastSneak.get(entityId)
      if (prev === sneaking)
        return
      this.lastSneak.set(entityId, sneaking)

      const event: SightedSneakToggleEvent = {
        modality: 'sighted',
        kind: 'sneak_toggle',
        entityType: 'player',
        entityId,
        displayName: entity?.username,
        distance: dist,
        hasLineOfSight: this.hasLineOfSight(entity),
        sneaking,
        timestamp: now,
        source: 'minecraft',
        pos: entity?.position,
      }

      this.deps.emitRaw(event)
    })

    this.onBot('soundEffectHeard', (soundId: string, pos: Vec3) => {
      const now = Date.now()
      if (!pos)
        return

      const dist = this.distanceToPos(pos)
      if (dist === null || dist > this.deps.maxDistance)
        return

      const event: HeardSoundEvent = {
        modality: 'heard',
        kind: 'sound',
        soundId,
        distance: dist,
        timestamp: now,
        source: 'minecraft',
        pos,
      }

      this.deps.emitRaw(event)
    })

    // Felt: damage taken (self health decreased)
    this.onBot('health', () => {
      if (!this.bot)
        return

      const now = Date.now()
      const current = this.bot.bot.health
      const prev = this.lastSelfHealth
      this.lastSelfHealth = current
      if (typeof prev !== 'number')
        return

      if (current >= prev)
        return

      const event: FeltDamageTakenEvent = {
        modality: 'felt',
        kind: 'damage_taken',
        amount: prev - current,
        timestamp: now,
        source: 'minecraft',
      }

      this.deps.emitRaw(event)
    })

    // Felt: item collected (best-effort; depends on mineflayer version/events)
    this.onBot('playerCollect', (collector: any, collected: any) => {
      if (!this.bot)
        return
      if (!collector)
        return
      if (collector.username !== this.bot.bot.username)
        return

      const now = Date.now()
      const itemName = String(collected?.name ?? collected?.displayName ?? collected?.type ?? 'unknown')

      const event: FeltItemCollectedEvent = {
        modality: 'felt',
        kind: 'item_collected',
        itemName,
        timestamp: now,
        source: 'minecraft',
      }

      this.deps.emitRaw(event)
    })

    this.onBot('entityCollect', (collector: any, collected: any) => {
      if (!this.bot)
        return
      if (!collector)
        return
      if (collector.username !== this.bot.bot.username)
        return

      const now = Date.now()
      const itemName = String(collected?.name ?? collected?.displayName ?? collected?.type ?? 'unknown')

      const event: FeltItemCollectedEvent = {
        modality: 'felt',
        kind: 'item_collected',
        itemName,
        timestamp: now,
        source: 'minecraft',
      }

      this.deps.emitRaw(event)
    })
  }

  public destroy(): void {
    if (!this.bot)
      return

    for (const { event, handler } of this.listeners) {
      try {
        (this.bot.bot as any).off?.(event, handler);
        (this.bot.bot as any).removeListener?.(event, handler)
      }
      catch (err) {
        this.deps.logger.withError(err as Error).error('MineflayerPerceptionCollector: failed to remove listener')
      }
    }

    this.listeners.length = 0
    this.lastMovedEmitAt.clear()
    this.lastSneak.clear()
    this.lastSelfHealth = null
    this.bot = null
  }

  private onBot(event: string, handler: (...args: any[]) => void): void {
    if (!this.bot)
      return

    (this.bot.bot as any).on(event, handler)
    this.listeners.push({ event, handler })
  }

  private entityId(entity: any): string {
    return String(entity?.id ?? entity?.uuid ?? entity?.username ?? 'unknown')
  }

  private distanceTo(entity: any): number | null {
    const pos = entity?.position
    if (!pos)
      return null
    return this.distanceToPos(pos)
  }

  private distanceToPos(pos: Vec3): number | null {
    if (!this.bot)
      return null
    const selfPos = this.bot.bot.entity?.position
    if (!selfPos)
      return null
    try {
      return selfPos.distanceTo(pos)
    }
    catch {
      return null
    }
  }

  private hasLineOfSight(entity: any): boolean {
    if (!this.bot)
      return false

    try {
      const canSee = (this.bot.bot as any).canSeeEntity
      if (typeof canSee === 'function')
        return !!canSee.call(this.bot.bot, entity)
    }
    catch { }

    // Fallback ray-march; intentionally simple (we'll optimize later)
    try {
      const from = this.bot.bot.entity.position.offset(0, this.bot.bot.entity.height * 0.9, 0)
      const to = entity.position.offset(0, entity.height * 0.9, 0)
      const dir = to.minus(from)
      const total = dir.norm()
      if (total <= 0)
        return true

      const stepSize = 0.25
      const steps = Math.ceil(total / stepSize)
      const step = dir.normalize().scaled(stepSize)

      let cur = from.clone()
      for (let i = 0; i < steps; i++) {
        cur = cur.plus(step)
        const block = this.bot.bot.blockAt(cur)
        if (!block)
          continue

        if (block.boundingBox === 'block' && !block.transparent)
          return false
      }

      return true
    }
    catch {
      return false
    }
  }
}
