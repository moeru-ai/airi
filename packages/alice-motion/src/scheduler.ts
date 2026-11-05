import type { MotionCatalogEntry } from './catalog'
import type { MotionChannel, MotionCue, MotionIntent } from './contracts'

import { MotionCatalog } from './catalog'
import { parseMotionCue, parseMotionIntent } from './contracts'

/**
 * Motion scheduler, sprint S04 (Plan 01, section 7 and phase P2).
 *
 * It turns `MotionIntent`s into `MotionCue`s and decides which cue owns each body channel.
 * It is the only producer of cues. It has no renderer code and never reads a clock:
 * the caller passes the time of each call.
 *
 * Rules:
 * - Idempotency: an intent ID that was seen in the last `seenIdTtlMs` is refused.
 * - Sessions: after `cancelSession`, every cue of that session stops and every later intent
 *   of that session is refused. A reconnection cannot replay an old turn.
 * - Channels: a normal cue conflicts with normal cues on a shared channel. An additive cue conflicts
 *   with additive cues on a shared channel, and with a normal cue that cannot be interrupted.
 * - Arbitration: a new cue takes the channels only when its priority is higher than every
 *   conflicting cue and each of them can be interrupted. Otherwise it is refused. On equal
 *   priority the playing cue keeps its channels, so the same conflict always has the same winner.
 * - TTL: a cue ends at `expiresAtMs`. `update` reports it and frees its channels.
 */

export type StopReason = 'expired' | 'preempted' | 'cancelled'

export type SchedulerEvent
  = | { type: 'start', cue: MotionCue, semanticAction: string }
    | { type: 'stop', cueId: string, atMs: number, fadeOutMs: number, reason: StopReason }

export type SubmitResult
  = | { ok: true, cue: MotionCue, preempted: string[] }
    | { ok: false, reason: string }

export interface MotionSchedulerOptions {
  catalog?: MotionCatalog
  /** How long an intent ID stays known for idempotency. Default: 10 minutes. */
  seenIdTtlMs?: number
}

interface ActiveCue {
  cue: MotionCue
  semanticAction: string
  interruptible: boolean
}

const maxSeenIds = 4096
const maxCancelledSessions = 256
const maxSpeechStarts = 64
/** Fade of a cue that a cancellation stops. Short, so the old turn leaves fast. */
const cancelFadeOutMs = 250

export class MotionScheduler {
  private readonly catalog: MotionCatalog
  private readonly seenIdTtlMs: number
  private readonly seenIds = new Map<string, number>()
  private readonly cancelledSessions: string[] = []
  private readonly speechStarts = new Map<string, number>()
  private readonly active = new Map<string, ActiveCue>()
  private readonly outbox: SchedulerEvent[] = []

  constructor(options: MotionSchedulerOptions = {}) {
    this.catalog = options.catalog ?? new MotionCatalog()
    this.seenIdTtlMs = options.seenIdTtlMs ?? 10 * 60_000
  }

  /** Cues that hold channels now, ordered by start. */
  get activeCues(): MotionCue[] {
    return [...this.active.values()].map(entry => entry.cue)
  }

  /** The normal cue that owns a channel, if any. */
  ownerOf(channel: MotionChannel): string | undefined {
    for (const entry of this.active.values()) {
      if (entry.cue.mode === 'normal' && entry.cue.channels.includes(channel))
        return entry.cue.id
    }
    return undefined
  }

  /**
   * The speech of a session started to play at `atMs`. Intents with `offsetFromSpeechMs`
   * then start relative to the audio that plays, not to the time the text arrived.
   */
  speechStarted(sessionId: string, atMs: number) {
    this.speechStarts.set(sessionId, atMs)
    if (this.speechStarts.size > maxSpeechStarts)
      this.speechStarts.delete(this.speechStarts.keys().next().value!)
  }

  /**
   * Validates an intent from any source and schedules its cue.
   * It never throws. A refused intent returns the reason, and the caller logs it.
   */
  submit(input: unknown, nowMs: number): SubmitResult {
    const parsed = parseMotionIntent(input, { allowedActions: this.catalog.actions })
    if (!parsed.ok)
      return parsed
    const intent = parsed.value

    this.forgetOldIds(nowMs)
    if (this.seenIds.has(intent.id))
      return { ok: false, reason: `intent "${intent.id}" was already received` }
    this.seenIds.set(intent.id, nowMs)
    if (intent.sessionId !== undefined && this.cancelledSessions.includes(intent.sessionId))
      return { ok: false, reason: `session "${intent.sessionId}" was cancelled` }

    const entry = this.catalog.get(intent.semanticAction)!
    const built = this.buildCue(intent, entry, nowMs)
    if (!built.ok)
      return built
    const cue = built.value
    const interruptible = intent.interruptible ?? entry.interruptible

    const conflicts = this.conflictsOf(cue)
    const blocker = conflicts.find(other => !other.interruptible || other.cue.priority >= cue.priority)
    if (blocker) {
      const channel = cue.channels.find(name => blocker.cue.channels.includes(name))
      return { ok: false, reason: `channel ${channel} is held by ${blocker.cue.id} (priority ${blocker.cue.priority})` }
    }

    for (const other of conflicts)
      this.stop(other, nowMs, other.cue.fadeOutMs, 'preempted')
    this.active.set(cue.id, { cue, semanticAction: intent.semanticAction, interruptible })
    this.outbox.push({ type: 'start', cue, semanticAction: intent.semanticAction })
    return { ok: true, cue, preempted: conflicts.map(other => other.cue.id) }
  }

  /** Stops every cue of a session now and refuses its later intents. */
  cancelSession(sessionId: string, nowMs: number) {
    if (!this.cancelledSessions.includes(sessionId)) {
      this.cancelledSessions.push(sessionId)
      if (this.cancelledSessions.length > maxCancelledSessions)
        this.cancelledSessions.shift()
    }
    for (const entry of [...this.active.values()]) {
      if (entry.cue.sessionId === sessionId)
        this.stop(entry, nowMs, Math.min(cancelFadeOutMs, entry.cue.fadeOutMs), 'cancelled')
    }
  }

  /** Ends the cues whose time is over and returns every event since the last call, in order. */
  update(nowMs: number): SchedulerEvent[] {
    for (const entry of [...this.active.values()]) {
      if (entry.cue.expiresAtMs !== undefined && entry.cue.expiresAtMs <= nowMs)
        this.stop(entry, entry.cue.expiresAtMs, 0, 'expired')
    }
    return this.outbox.splice(0)
  }

  private buildCue(intent: MotionIntent, entry: MotionCatalogEntry, nowMs: number) {
    const speechStart = intent.sessionId === undefined ? undefined : this.speechStarts.get(intent.sessionId)
    const startAtMs = Math.max(
      Math.round(nowMs),
      intent.offsetFromSpeechMs !== undefined && speechStart !== undefined ? speechStart + intent.offsetFromSpeechMs : 0,
    )
    const durationMs = intent.requestedDurationMs || entry.durationMs
    const halfDuration = Math.floor(durationMs / 2)
    const candidate = {
      id: `cue-${intent.id}`.slice(0, 128),
      ...(entry.clipId !== undefined ? { clipId: entry.clipId } : { generatorId: entry.generatorId }),
      ...(intent.sessionId !== undefined && { sessionId: intent.sessionId }),
      startAtMs,
      weight: Math.round(entry.maxWeight * (intent.intensity ?? 1) * 1000) / 1000,
      fadeInMs: Math.min(entry.fadeInMs, halfDuration),
      fadeOutMs: Math.min(entry.fadeOutMs, halfDuration),
      mode: entry.mode,
      channels: intent.requestedChannels ?? entry.channels,
      priority: intent.priority ?? entry.priority,
      expiresAtMs: startAtMs + durationMs,
    }
    // The cue passes the same 4096 byte and shape check as a cue from anywhere else.
    return parseMotionCue(candidate)
  }

  private conflictsOf(cue: MotionCue): ActiveCue[] {
    return [...this.active.values()].filter((other) => {
      if (!other.cue.channels.some(channel => cue.channels.includes(channel)))
        return false
      if (cue.mode === other.cue.mode)
        return true
      // An additive layer can sit on a normal cue, unless that cue cannot be interrupted, for example sitting down.
      return cue.mode === 'additive' && !other.interruptible
    })
  }

  private stop(entry: ActiveCue, atMs: number, fadeOutMs: number, reason: StopReason) {
    if (!this.active.delete(entry.cue.id))
      return
    this.outbox.push({ type: 'stop', cueId: entry.cue.id, atMs, fadeOutMs, reason })
  }

  private forgetOldIds(nowMs: number) {
    for (const [id, seenAt] of this.seenIds) {
      if (nowMs - seenAt < this.seenIdTtlMs && this.seenIds.size <= maxSeenIds)
        break
      this.seenIds.delete(id)
    }
  }
}
