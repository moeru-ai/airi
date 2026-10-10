import type { MotionControllerSnapshot } from '../motions/types'

/** One short-lived attention event. The adapter supplies a loaded-model identity and preserves the source event identity. */
export interface NotificationWaveIntent {
  modelId: string
  eventId: string
  intentId: string
  coalesceKey?: string
  createdAt: number
  expiresAt: number
}

/** Snapshot state proves busy playback, not ownership. Explicit flags cover user work before the mixer starts it. */
export interface NotificationWaveContext {
  modelId: string | undefined
  snapshot: MotionControllerSnapshot | undefined
  manipulationActive: boolean
  gameActive: boolean
  userMotionActive: boolean
  /** Explicit low-priority conversation ownership. Snapshot IDs alone cannot grant preemption. @default false */
  conversationMotionActive?: boolean
  paused: boolean
  doNotDisturb: boolean
  reducedMotion: boolean
  enabled: boolean
  waveAvailable: boolean
}

/** The host rechecks this lease before playback and after asynchronous loads. It never grants window focus or native surface access. */
export interface NotificationWaveLease {
  modelId: string
  leaseId: string
  eventIds: string[]
  motionId: 'wave'
  loop: false
  duration: number
}

/** Cancellation targets only the matching notification lease, never an arbitrary active motion. */
export type NotificationWaveDecision
  = { kind: 'start', lease: NotificationWaveLease }
    | { kind: 'cancel', modelId: string, leaseId: string, reason: 'suppressed' | 'preempted' | 'expired' | 'model-changed' }
    | { kind: 'wait' }

/** A rejected intent does not enter the pending queue. Duplicate event and delivery IDs share bounded replay protection. */
export type NotificationWaveAcceptance = 'queued' | 'coalesced' | 'duplicate' | 'suppressed' | 'full' | 'invalid'

/** Runtime policy is bounded regardless of configuration. */
export interface NotificationWaveOptions {
  /** Pending coalesced groups. @default 8 */
  maxPending?: number
  /** Distinct events retained for replay protection. @default 256 */
  maxSeen?: number
  /** A source expiry cannot exceed this lifetime in milliseconds. @default 15000 */
  maxLifetimeMs?: number
  /** Quiet period after one wave finishes or is cancelled. @default 3000 */
  cooldownMs?: number
  /** Maximum wave playback and lease lifetime in milliseconds. @default 5000 */
  waveDurationMs?: number
}

interface PendingWave {
  key: string
  eventIds: string[]
  expiresAt: number
}

interface SeenEvent {
  eventId: string
  intentId: string
  expiresAt: number
}

interface ActiveWave {
  lease: NotificationWaveLease
  expiresAt: number
}

function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value!)) : fallback
}

function validId(value: string) {
  return typeof value === 'string' && value.length > 0 && value.length <= 160
}

function suppressed(context: NotificationWaveContext) {
  return !context.enabled || context.paused || context.doNotDisturb || context.reducedMotion || !context.waveAvailable
}

/** Direct manipulation, games, and user requests always outrank notifications, including requests still loading. */
export function notificationMotionOwner(context: NotificationWaveContext): 'suppressed' | 'manual' | 'game' | 'user' | 'conversation' | 'busy' | 'idle' | 'unknown' {
  if (suppressed(context))
    return 'suppressed'
  if (context.manipulationActive)
    return 'manual'
  if (context.gameActive)
    return 'game'
  if (context.userMotionActive)
    return 'user'
  if (!context.modelId || !context.snapshot)
    return 'unknown'
  if (context.conversationMotionActive)
    return 'conversation'
  if (context.snapshot.loadingId || context.snapshot.queuedIds.length > 0 || context.snapshot.activeId !== context.snapshot.idleId)
    return 'busy'
  return 'idle'
}

/**
 * Owns pending waves and one finite playback lease for a loaded model. It performs no external side effects.
 * Busy playback delays waves until expiry. Pause, DND, disabled reactions, model changes, and disposal clear pending work.
 * Replay protection survives suppression. A full replay cache rejects new events instead of evicting still-valid identities.
 */
export class NotificationWaveQueue {
  private readonly maxPending: number
  private readonly maxSeen: number
  private readonly maxLifetimeMs: number
  private readonly cooldownMs: number
  private readonly waveDurationMs: number
  private readonly pending: PendingWave[] = []
  private readonly seen: SeenEvent[] = []
  private active: ActiveWave | undefined
  private sequence = 0
  private nextAllowedAt = 0
  private previousTime = -1
  private disposed = false

  constructor(private readonly modelId: string, options: NotificationWaveOptions = {}) {
    this.maxPending = Math.floor(bounded(options.maxPending, 8, 1, 32))
    this.maxSeen = Math.floor(bounded(options.maxSeen, 256, 1, 1024))
    this.maxLifetimeMs = bounded(options.maxLifetimeMs, 15_000, 250, 60_000)
    this.cooldownMs = bounded(options.cooldownMs, 3000, 0, 60_000)
    this.waveDurationMs = bounded(options.waveDurationMs, 5000, 250, 10_000)
  }

  /** Returns the current queue size without exposing mutable entries. An active lease is not pending. */
  get pendingCount() {
    return this.pending.length
  }

  /** Checks a lease after async work. The caller must also recheck current explicit ownership before changing the mixer. */
  owns(leaseId: string) {
    return !this.disposed && this.active?.lease.leaseId === leaseId
  }

  /** Removes matching unstarted groups, for example after an inbox item is read. Replay protection and active playback remain intact. */
  withdraw(coalesceKey: string): number {
    const previousCount = this.pending.length
    this.pending.splice(0, this.pending.length, ...this.pending.filter(group => group.key !== coalesceKey))
    return previousCount - this.pending.length
  }

  /** Copies valid identities into the queue. Caller-supplied objects are never retained. */
  enqueue(intent: NotificationWaveIntent, context: NotificationWaveContext, now: number): NotificationWaveAcceptance {
    if (!this.advanceClock(now) || this.disposed || intent.modelId !== this.modelId
      || context.modelId !== this.modelId || !validId(intent.eventId) || !validId(intent.intentId)
      || (intent.coalesceKey !== undefined && !validId(intent.coalesceKey))
      || !Number.isFinite(intent.createdAt) || !Number.isFinite(intent.expiresAt)
      || intent.createdAt < 0 || now < intent.createdAt || intent.expiresAt <= now) {
      return 'invalid'
    }
    this.prune(now)
    if (this.seen.some(event => event.eventId === intent.eventId || event.intentId === intent.intentId))
      return 'duplicate'
    if (this.seen.length >= this.maxSeen)
      return 'full'
    const expiresAt = Math.min(intent.expiresAt, intent.createdAt + this.maxLifetimeMs)
    if (expiresAt <= now)
      return 'invalid'
    this.seen.push({ eventId: intent.eventId, intentId: intent.intentId, expiresAt })
    if (suppressed(context)) {
      this.pending.length = 0
      return 'suppressed'
    }
    const key = intent.coalesceKey ?? intent.eventId
    const group = this.pending.find(entry => entry.key === key)
    if (group) {
      if (group.eventIds.length >= 32)
        return 'full'
      group.eventIds.push(intent.eventId)
      // A burst cannot keep an old group alive indefinitely.
      group.expiresAt = Math.min(group.expiresAt, expiresAt)
      return 'coalesced'
    }
    if (this.pending.length >= this.maxPending)
      return 'full'
    this.pending.push({ key, eventIds: [intent.eventId], expiresAt })
    return 'queued'
  }

  /**
   * Poll with current ownership before issuing any motion command. A start decision reserves one lease immediately.
   * Apply cancellation only if the runtime still owns that same lease. Never stop a newer user motion.
   */
  next(context: NotificationWaveContext, now: number): NotificationWaveDecision {
    if (!this.advanceClock(now) || this.disposed)
      return { kind: 'wait' }
    this.prune(now)
    if (context.modelId !== this.modelId) {
      this.pending.length = 0
      return this.cancel('model-changed', now)
    }
    if (suppressed(context)) {
      this.pending.length = 0
      return this.cancel('suppressed', now)
    }
    const owner = notificationMotionOwner(context)
    if (this.active) {
      const snapshot = context.snapshot
      const conflictingPlayback = !!snapshot && (snapshot.queuedIds.length > 0
        || (snapshot.loadingId !== undefined && snapshot.loadingId !== 'wave')
        || (snapshot.activeId !== snapshot.idleId && snapshot.activeId !== 'wave'))
      if (owner === 'manual' || owner === 'game' || owner === 'user' || owner === 'unknown' || conflictingPlayback)
        return this.cancel('preempted', now)
      if (now >= this.active.expiresAt)
        return this.cancel('expired', now)
      return { kind: 'wait' }
    }
    if ((owner !== 'idle' && owner !== 'conversation') || now < this.nextAllowedAt)
      return { kind: 'wait' }
    const pending = this.pending.shift()
    if (!pending)
      return { kind: 'wait' }
    const lease: NotificationWaveLease = {
      modelId: this.modelId,
      leaseId: `notification-wave:${++this.sequence}`,
      eventIds: [...pending.eventIds],
      motionId: 'wave',
      loop: false,
      duration: this.waveDurationMs / 1000,
    }
    this.active = { lease: { ...lease, eventIds: [...lease.eventIds] }, expiresAt: now + this.waveDurationMs }
    return { kind: 'start', lease }
  }

  /** Release on playback completion or load failure. Stale completions cannot release another lease. */
  finish(modelId: string, leaseId: string, now: number) {
    if (!this.advanceClock(now) || this.disposed || modelId !== this.modelId || !this.owns(leaseId))
      return false
    this.active = undefined
    this.nextAllowedAt = now + this.cooldownMs
    return true
  }

  /** Clears local state and revokes the active lease. The host cancels only its matching notification playback. */
  dispose(): NotificationWaveDecision {
    this.disposed = true
    this.pending.length = 0
    this.seen.length = 0
    return this.cancel('model-changed', Math.max(0, this.previousTime))
  }

  private cancel(reason: Extract<NotificationWaveDecision, { kind: 'cancel' }>['reason'], now: number): NotificationWaveDecision {
    const active = this.active
    if (!active)
      return { kind: 'wait' }
    this.active = undefined
    this.nextAllowedAt = now + this.cooldownMs
    return { kind: 'cancel', modelId: this.modelId, leaseId: active.lease.leaseId, reason }
  }

  private advanceClock(now: number) {
    if (!Number.isFinite(now) || now < 0 || now < this.previousTime)
      return false
    this.previousTime = now
    return true
  }

  private prune(now: number) {
    this.pending.splice(0, this.pending.length, ...this.pending.filter(entry => entry.expiresAt > now))
    this.seen.splice(0, this.seen.length, ...this.seen.filter(entry => entry.expiresAt > now))
  }
}
