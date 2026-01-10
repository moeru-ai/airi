import type { Logg } from '@guiiai/logg'

import type { EventManager } from './event-manager'
import type { RawPerceptionEvent } from './raw-events'

import { LeakyBucket } from './leaky-bucket'

export interface PlayerAttentionEventPayload {
  kind: 'player'
  playerName?: string
  hasLineOfSight?: boolean
  distance?: number
  playerAction: 'move' | 'punch' | 'teabag' | 'sound' | 'damage' | 'pickup'
}

export interface MobAttentionEventPayload {
  kind: 'mob'
  mobName?: string
  hasLineOfSight?: boolean
  distance?: number
  mobAction: string
}

export type AttentionEventPayload = PlayerAttentionEventPayload | MobAttentionEventPayload

export class AttentionDetector {
  private readonly buckets = new Map<string, LeakyBucket>()

  private readonly movementState = new Map<
    string,
    {
      movingSince: number
      lastSeenMove: number
      emitted: boolean
    }
  >()

  constructor(
    private readonly deps: {
      eventManager: EventManager
      logger: Logg
    },
  ) { }

  public tick(deltaMs: number): void {
    for (const bucket of this.buckets.values()) {
      bucket.tick(deltaMs)
    }

    const now = Date.now()
    for (const [id, state] of this.movementState.entries()) {
      if (now - state.lastSeenMove > 250) {
        this.movementState.delete(id)
      }
    }
  }

  public ingest(event: RawPerceptionEvent): void {
    const dispatch: Record<string, Record<string, (event: RawPerceptionEvent) => void>> = {
      sighted: {
        arm_swing: event => this.onPunch(event as any),
        sneak_toggle: event => this.onSneakToggle(event as any),
        entity_moved: event => this.onMove(event as any),
      },
      heard: {
        sound: event => this.onSound(event as any),
      },
      felt: {
        damage_taken: event => this.onDamage(event as any),
        item_collected: event => this.onPickup(event as any),
      },
    }
    dispatch[event.modality]?.[event.kind]?.(event)
  }

  private onPunch(event: Extract<RawPerceptionEvent, { modality: 'sighted', kind: 'arm_swing' }>): void {
    // Heuristic: 3 swings in ~1s triggers
    const bucket = this.getBucket(`punch:${event.entityId}`, {
      capacity: 3,
      leakPerSecond: 3,
      trigger: 3,
    })

    const { fired } = bucket.add(1)
    if (!fired)
      return

    this.emitAttention({
      kind: 'player',
      playerName: event.displayName,
      hasLineOfSight: event.hasLineOfSight,
      distance: event.distance,
      playerAction: 'punch',
    })
  }

  private onSneakToggle(event: Extract<RawPerceptionEvent, { modality: 'sighted', kind: 'sneak_toggle' }>): void {
    // >= 4 toggles within 2s (leaky bucket approximation)
    const bucket = this.getBucket(`teabag:${event.entityId}`, {
      capacity: 4,
      leakPerSecond: 2,
      trigger: 4,
    })

    const { fired } = bucket.add(1)
    if (!fired)
      return

    this.emitAttention({
      kind: 'player',
      playerName: event.displayName,
      hasLineOfSight: event.hasLineOfSight,
      distance: event.distance,
      playerAction: 'teabag',
    })
  }

  private onMove(event: Extract<RawPerceptionEvent, { modality: 'sighted', kind: 'entity_moved' }>): void {
    // Only count players for "attracting attention"
    if (event.entityType !== 'player')
      return

    const now = Date.now()
    const state = this.movementState.get(event.entityId)
    if (!state) {
      this.movementState.set(event.entityId, {
        movingSince: now,
        lastSeenMove: now,
        emitted: false,
      })
      return
    }

    state.lastSeenMove = now
    if (state.emitted)
      return

    if (now - state.movingSince < 600)
      return

    // Cooldown gate to avoid spamming: 1 trigger, leaks over ~3s
    const bucket = this.getBucket(`move:${event.entityId}`, {
      capacity: 1,
      leakPerSecond: 1 / 3,
      trigger: 1,
    })

    const { fired } = bucket.add(1)
    if (!fired)
      return

    state.emitted = true
    this.emitAttention({
      kind: 'player',
      playerName: event.displayName,
      hasLineOfSight: event.hasLineOfSight,
      distance: event.distance,
      playerAction: 'move',
    })
  }

  private onSound(event: Extract<RawPerceptionEvent, { modality: 'heard', kind: 'sound' }>): void {
    // Any sound within range is "interesting". Gate by soundId to prevent spam.
    const bucket = this.getBucket(`sound:${event.soundId}`, {
      capacity: 1,
      leakPerSecond: 1, // ~1s cooldown per soundId
      trigger: 1,
    })

    const { fired } = bucket.add(1)
    if (!fired)
      return

    this.emitAttention({
      kind: 'player',
      playerAction: 'sound',
      distance: event.distance,
    })
  }

  private onDamage(_event: Extract<RawPerceptionEvent, { modality: 'felt', kind: 'damage_taken' }>): void {
    // Self-damage is intrinsically salient; gate with small cooldown
    const bucket = this.getBucket('felt:damage', {
      capacity: 1,
      leakPerSecond: 1 / 2,
      trigger: 1,
    })

    const { fired } = bucket.add(1)
    if (!fired)
      return

    this.emitAttention({
      kind: 'player',
      playerAction: 'damage',
    })
  }

  private onPickup(_event: Extract<RawPerceptionEvent, { modality: 'felt', kind: 'item_collected' }>): void {
    // Item pickup can be spammy (e.g. farms); apply a small cooldown
    const bucket = this.getBucket('felt:pickup', {
      capacity: 1,
      leakPerSecond: 1, // ~1s cooldown
      trigger: 1,
    })

    const { fired } = bucket.add(1)
    if (!fired)
      return

    this.emitAttention({
      kind: 'player',
      playerAction: 'pickup',
    })
  }

  private emitAttention(payload: AttentionEventPayload): void {
    this.deps.eventManager.emit<AttentionEventPayload>({
      type: 'perception',
      payload,
      source: { type: 'minecraft', id: 'perception' },
      timestamp: Date.now(),
    })
  }

  private getBucket(key: string, config: { capacity: number, leakPerSecond: number, trigger: number }): LeakyBucket {
    const existing = this.buckets.get(key)
    if (existing)
      return existing

    const created = new LeakyBucket(config)
    this.buckets.set(key, created)
    return created
  }
}
