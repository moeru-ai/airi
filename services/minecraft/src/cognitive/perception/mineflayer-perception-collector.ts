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
} from './types/raw-events'

export class MineflayerPerceptionCollector {
  private bot: MineflayerWithAgents | null = null
  private readonly listeners: Array<{
    event: string
    handler: (...args: any[]) => void
  }> = []

  private lastSelfHealth: number | null = null

  private lastStatsAt = 0
  private stats: Record<string, number> = {}
  private sneakingState: Map<string, boolean> = new Map()

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

    this.lastStatsAt = Date.now()
    this.stats = {}

    this.deps.logger.withFields({ maxDistance: this.deps.maxDistance }).log('MineflayerPerceptionCollector: init')

    this.onBot('entityMoved', (entity: any) => {
      const now = Date.now()
      const dist = this.distanceTo(entity)
      if (dist === null || dist > this.deps.maxDistance)
        return

      // Ignore self
      if (entity.username === this.bot?.bot.username)
        return

      const entityId = this.entityId(entity)

      const event: SightedEntityMovedEvent = {
        modality: 'sighted',
        kind: 'entity_moved',
        entityType: entity?.type === 'player' ? 'player' : 'mob',
        entityId,
        displayName: entity?.username,
        distance: dist,
        hasLineOfSight: true,
        timestamp: now,
        source: 'minecraft',
        pos: entity?.position,
      }

      this.deps.emitRaw(event)
      this.bumpStat('sighted.entity_moved')
      this.maybeLogStats()
    })

    this.onBot('entitySwingArm', (entity: any) => {
      const now = Date.now()
      const dist = this.distanceTo(entity)
      if (dist === null || dist > this.deps.maxDistance)
        return

      // Ignore self
      if (entity.username === this.bot?.bot.username)
        return

      const event: SightedArmSwingEvent = {
        modality: 'sighted',
        kind: 'arm_swing',
        entityType: 'player',
        entityId: this.entityId(entity),
        displayName: entity?.username,
        distance: dist,
        hasLineOfSight: true,
        timestamp: now,
        source: 'minecraft',
        pos: entity?.position,
      }

      this.deps.emitRaw(event)
      this.bumpStat('sighted.arm_swing')
      this.maybeLogStats()
    })

    this.onBot('entityUpdate', (entity: any) => {
      if (!entity || entity.type !== 'player')
        return

      // Ignore self
      if (entity.username === this.bot?.bot.username)
        return

      const entityId = this.entityId(entity)
      const flags = entity?.metadata?.[0]
      // Bit 1 (0x02) is sneaking
      const isSneaking = typeof flags === 'number' ? !!(flags & 0x02) : false

      // Check if state actually changed
      const lastState = this.sneakingState.get(entityId)
      if (lastState === isSneaking) {
        return
      }
      this.sneakingState.set(entityId, isSneaking)

      const now = Date.now()
      const dist = this.distanceTo(entity)
      if (dist === null || dist > this.deps.maxDistance)
        return

      const event: SightedSneakToggleEvent = {
        modality: 'sighted',
        kind: 'sneak_toggle',
        entityType: 'player',
        entityId,
        displayName: entity?.username,
        distance: dist,
        hasLineOfSight: true,
        sneaking: isSneaking,
        timestamp: now,
        source: 'minecraft',
        pos: entity?.position,
      }

      this.deps.logger.withFields({ entity: entity.username, sneaking: isSneaking }).log('MineflayerPerceptionCollector: sneak_toggle')

      this.deps.emitRaw(event)
      this.bumpStat('sighted.sneak_toggle')
      this.maybeLogStats()
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
      this.bumpStat('felt.damage_taken')
      this.maybeLogStats()
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
      this.bumpStat('felt.item_collected')
      this.maybeLogStats()
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
      this.bumpStat('felt.item_collected')
      this.maybeLogStats()
    })
  }

  public destroy(): void {
    if (!this.bot)
      return

    this.deps.logger.withFields({ listeners: this.listeners.length }).log('MineflayerPerceptionCollector: destroy')

    for (const { event, handler } of this.listeners) {
      try {
        const b = this.bot.bot as any
        b.off?.(event, handler)
        b.removeListener?.(event, handler)
      }
      catch (err) {
        this.deps.logger.withError(err as Error).error('MineflayerPerceptionCollector: failed to remove listener')
      }
    }

    this.listeners.length = 0
    this.lastSelfHealth = null
    this.bot = null
  }

  private bumpStat(key: string): void {
    this.stats[key] = (this.stats[key] ?? 0) + 1
  }

  private maybeLogStats(): void {
    const now = Date.now()
    if (now - this.lastStatsAt < 2000)
      return

    // this.deps.logger.withFields({
    //   ...this.stats,
    // }).log('MineflayerPerceptionCollector: stats')

    this.lastStatsAt = now
    this.stats = {}
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
}
