import type { Logg } from '@guiiai/logg'
import type { Vec3 } from 'vec3'

import type { MineflayerWithAgents } from '../types'
import type {
  FeltDamageTakenEvent,
  FeltItemCollectedEvent,
  HeardSoundEvent,
  PlayerJoinedEvent,
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

  private knownPlayerIds: Set<string> = new Set()

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
    this.knownPlayerIds = this.snapshotKnownPlayers(bot)

    this.deps.logger.withFields({ maxDistance: this.deps.maxDistance }).log('MineflayerPerceptionCollector: init')

    this.registerEventHandlers()
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

  // ========================================
  // Event Handler Registration
  // ========================================

  private registerEventHandlers(): void {
    this.onBot('entityMoved', entity => this.handleEntityMoved(entity))
    this.onBot('entitySwingArm', entity => this.handleEntitySwingArm(entity))
    this.onBot('entityUpdate', entity => this.handleEntityUpdate(entity))
    this.onBot('playerJoined', player => this.handlePlayerJoined(player))
    this.onBot('playerUpdated', () => this.handlePlayersMaybeChanged())
    this.onBot('soundEffectHeard', (soundId, pos) => this.handleSoundHeard(soundId, pos))
    this.onBot('health', () => this.handleHealthChange())
    this.onBot('playerCollect', (collector, collected) => this.handleItemCollected(collector, collected))
    this.onBot('entityCollect', (collector, collected) => this.handleItemCollected(collector, collected))
  }

  // ========================================
  // Sighted Event Handlers
  // ========================================

  private handleEntityMoved(entity: any): void {
    if (!this.isValidEntityInRange(entity))
      return

    const event: SightedEntityMovedEvent = {
      modality: 'sighted',
      kind: 'entity_moved',
      entityType: entity?.type === 'player' ? 'player' : 'mob',
      entityId: this.entityId(entity),
      displayName: entity?.username,
      distance: this.distanceTo(entity)!,
      hasLineOfSight: true,
      timestamp: Date.now(),
      source: 'minecraft',
      pos: entity?.position,
    }

    this.emitEvent(event, 'sighted.entity_moved')
  }

  private handleEntitySwingArm(entity: any): void {
    if (!this.isValidEntityInRange(entity))
      return

    const event: SightedArmSwingEvent = {
      modality: 'sighted',
      kind: 'arm_swing',
      entityType: 'player',
      entityId: this.entityId(entity),
      displayName: entity?.username,
      distance: this.distanceTo(entity)!,
      hasLineOfSight: true,
      timestamp: Date.now(),
      source: 'minecraft',
      pos: entity?.position,
    }

    this.emitEvent(event, 'sighted.arm_swing')
  }

  private handleEntityUpdate(entity: any): void {
    if (!entity || entity.type !== 'player')
      return

    if (this.isSelfEntity(entity))
      return

    const entityId = this.entityId(entity)
    const isSneaking = this.extractSneakingState(entity)

    if (!this.hasSneakingStateChanged(entityId, isSneaking))
      return

    this.sneakingState.set(entityId, isSneaking)

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
      timestamp: Date.now(),
      source: 'minecraft',
      pos: entity?.position,
    }

    this.emitEvent(event, 'sighted.sneak_toggle')
  }

  // ========================================
  // Heard Event Handlers
  // ========================================

  private handleSoundHeard(soundId: string, pos: Vec3): void {
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
      timestamp: Date.now(),
      source: 'minecraft',
      pos,
    }

    this.deps.emitRaw(event)
  }

  // ========================================
  // Felt Event Handlers
  // ========================================

  private handleHealthChange(): void {
    if (!this.bot)
      return

    const current = this.bot.bot.health
    const prev = this.lastSelfHealth
    this.lastSelfHealth = current

    if (typeof prev !== 'number' || current >= prev)
      return

    const event: FeltDamageTakenEvent = {
      modality: 'felt',
      kind: 'damage_taken',
      amount: prev - current,
      timestamp: Date.now(),
      source: 'minecraft',
    }

    this.emitEvent(event, 'felt.damage_taken')
  }

  private handleItemCollected(collector: any, collected: any): void {
    if (!this.bot || !collector)
      return

    if (collector.username !== this.bot.bot.username)
      return

    const itemName = String(collected?.name ?? collected?.displayName ?? collected?.type ?? 'unknown')

    const event: FeltItemCollectedEvent = {
      modality: 'felt',
      kind: 'item_collected',
      itemName,
      timestamp: Date.now(),
      source: 'minecraft',
    }

    this.emitEvent(event, 'felt.item_collected')
  }

  private handlePlayerJoined(player: any): void {
    if (!player)
      return

    if (player.username === this.bot?.bot.username)
      return

    const playerId = String(player.uuid ?? player.id ?? player.username ?? 'unknown')
    if (this.knownPlayerIds.has(playerId))
      return

    this.knownPlayerIds.add(playerId)

    const event: PlayerJoinedEvent = {
      modality: 'system',
      kind: 'player_joined',
      playerId,
      displayName: player.username,
      timestamp: Date.now(),
      source: 'minecraft',
    }

    this.emitEvent(event, 'system.player_joined')
  }

  private handlePlayersMaybeChanged(): void {
    const bot = this.bot
    if (!bot)
      return

    const current = this.snapshotKnownPlayers(bot)

    for (const playerId of current) {
      if (this.knownPlayerIds.has(playerId))
        continue

      this.knownPlayerIds.add(playerId)

      const player = (bot.bot as any).players?.[playerId]
      const username = player?.username

      const event: PlayerJoinedEvent = {
        modality: 'system',
        kind: 'player_joined',
        playerId,
        displayName: typeof username === 'string' ? username : undefined,
        timestamp: Date.now(),
        source: 'minecraft',
      }

      this.emitEvent(event, 'system.player_joined')
    }
  }

  private snapshotKnownPlayers(bot: MineflayerWithAgents): Set<string> {
    const out = new Set<string>()
    const players = (bot.bot as any).players as Record<string, any> | undefined
    if (!players)
      return out

    const selfUsername = bot.bot.username

    for (const [id, player] of Object.entries(players)) {
      if (!id)
        continue

      const username = player?.username
      if (username && username === selfUsername)
        continue

      out.add(String(id))
    }

    return out
  }

  // ========================================
  // Validation Helpers
  // ========================================

  private isValidEntityInRange(entity: any): boolean {
    const dist = this.distanceTo(entity)
    if (dist === null || dist > this.deps.maxDistance)
      return false

    if (this.isSelfEntity(entity))
      return false

    return true
  }

  private isSelfEntity(entity: any): boolean {
    return entity.username === this.bot?.bot.username
  }

  private extractSneakingState(entity: any): boolean {
    const flags = entity?.metadata?.[0]
    // Bit 1 (0x02) is sneaking
    return typeof flags === 'number' ? !!(flags & 0x02) : false
  }

  private hasSneakingStateChanged(entityId: string, isSneaking: boolean): boolean {
    const lastState = this.sneakingState.get(entityId)
    return lastState !== isSneaking
  }

  // ========================================
  // Utilities
  // ========================================

  private emitEvent(event: RawPerceptionEvent, statKey: string): void {
    this.deps.emitRaw(event)
    this.bumpStat(statKey)
    this.maybeLogStats()
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
