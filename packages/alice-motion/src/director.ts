import type { MotionIntent, MotionSource, MotionState } from './contracts'

import { MotionCatalog } from './catalog'
import { parseMotionIntent } from './contracts'
import { createSeededRandom, randomBetween } from './random'

/**
 * Motion director, sprint S03 (Plan 01, section 6 and phase P1).
 *
 * It owns the behavior state (idle, listening, thinking, speaking, walking, acting,
 * interrupted) and turns time and conversation events into `MotionIntent`s.
 * It has no renderer, no Three.js, and no Vue. It never reads a clock and never calls
 * an LLM: the caller passes the time of each event and of each `update`.
 * The timing of idle, listening, thinking, and speaking follows the xiaoke.ai
 * PerformanceDirector (Apache-2.0), the same source as the VRM renderer.
 */

export interface MotionDirectorOptions {
  /** Seed of the random source. The same seed and the same events give the same intents. */
  seed?: number
  /** Random source in `[0, 1)`. Overrides `seed`. */
  random?: () => number
  catalog?: MotionCatalog
  /** Prefix of the intent IDs. Use one prefix per director, so the scheduler sees unique IDs. */
  idPrefix?: string
}

export interface DirectorOutput {
  intents: MotionIntent[]
  /** Sessions whose cues the scheduler must stop now, for example after an interruption. */
  cancelledSessions: string[]
}

/** Intervals in milliseconds, as `[min, max)`. */
const timing = {
  idleWeightShift: [4000, 9000],
  idleGlance: [2500, 6000],
  idlePostureShift: [8000, 16_000],
  listenNod: [2500, 5500],
  thinkGlance: [4000, 7000],
  thinkGlanceDuration: [1800, 4200],
  speakBeatFirst: [1200, 2000],
  speakBeat: [3400, 6200],
  speakNod: [2000, 4000],
  walkGlance: [3000, 6000],
  /** The walk intent lasts 60 s. The director renews it before it ends. */
  walkRenew: [55_000, 55_001],
} as const

/** How long the character stays in `interrupted` before it returns to rest. */
const interruptedHoldMs = 600

type TimerName = 'weightShift' | 'glance' | 'postureShift' | 'nod' | 'thinkGlance' | 'beat' | 'speakNod' | 'walkRenew'

/** Bounded memory of finished speech sessions, so a repeated start does not replay gestures. */
const endedSessionMemory = 64

export class MotionDirector {
  private readonly random: () => number
  private readonly catalog: MotionCatalog
  private readonly idPrefix: string
  private readonly timers = new Map<TimerName, number>()
  private readonly outbox: MotionIntent[] = []
  private readonly cancelled: string[] = []
  private readonly endedSessions: string[] = []
  private current: MotionState = 'idle'
  /** `false` until the first state is planned, so a new director starts its idle timers on the first update. */
  private planned = false
  private sequence = 0
  private speechSessionId: string | undefined
  private speechStartedAtMs = 0
  private walkSessionId: string | undefined
  private walkCount = 0
  private userSpeaking = false
  /** End of the `acting` or `interrupted` state. */
  private holdUntilMs = 0
  private restState: MotionState = 'idle'
  private emotion: string | undefined
  private intensity = 0.6

  constructor(options: MotionDirectorOptions = {}) {
    this.random = options.random ?? createSeededRandom(options.seed ?? 1)
    this.catalog = options.catalog ?? new MotionCatalog()
    this.idPrefix = options.idPrefix ?? 'director'
  }

  get state(): MotionState {
    return this.current
  }

  /** Mood from the companion service or the LLM. The director copies it into each intent. */
  setAffect(emotion: string | undefined, intensity?: number) {
    this.emotion = emotion?.slice(0, 32)
    if (intensity !== undefined && Number.isFinite(intensity))
      this.intensity = Math.min(1, Math.max(0, intensity))
  }

  /** The user started to talk, for example voice activity or a partial transcript. */
  userStartedSpeaking(nowMs: number) {
    this.userSpeaking = true
    if (this.current === 'speaking')
      this.interrupt(nowMs)
    else if (this.isRestState())
      this.enter('listening', nowMs)
  }

  /** The user finished, for example the final transcript. The character thinks until it speaks. */
  userFinishedSpeaking(nowMs: number) {
    this.userSpeaking = false
    if (this.current === 'listening' || this.current === 'idle')
      this.enter('thinking', nowMs)
  }

  /**
   * The speech of a turn started to play. `sessionId` owns the gestures of this speech.
   * A session that already ended is ignored, so a replayed start does not duplicate gestures.
   */
  speechStarted(sessionId: string, nowMs: number) {
    if (this.endedSessions.includes(sessionId) || this.speechSessionId === sessionId)
      return
    if (this.speechSessionId)
      this.finishSession(this.speechSessionId, true)
    this.speechSessionId = sessionId
    this.speechStartedAtMs = nowMs
    this.enter('speaking', nowMs)
  }

  /** The speech of a session ended normally. Its gestures finish on their own. */
  speechEnded(sessionId: string, nowMs: number) {
    if (this.speechSessionId !== sessionId)
      return
    this.finishSession(sessionId, false)
    this.speechSessionId = undefined
    this.enter(this.walkSessionId ? 'walking' : 'idle', nowMs)
  }

  /** The user interrupted the character. The gestures of the current speech stop now. */
  interrupt(nowMs: number) {
    if (this.speechSessionId) {
      this.finishSession(this.speechSessionId, true)
      this.speechSessionId = undefined
    }
    this.enter('interrupted', nowMs)
    this.holdUntilMs = nowMs + interruptedHoldMs
  }

  startWalking(nowMs: number) {
    if (this.walkSessionId)
      return
    this.walkCount++
    this.walkSessionId = `${this.idPrefix}-walk-${this.walkCount}`
    this.emit('walk', nowMs, { sessionId: this.walkSessionId, source: 'procedural', requestedDurationMs: 60_000 })
    if (this.isRestState())
      this.enter('walking', nowMs)
  }

  stopWalking(nowMs: number) {
    if (!this.walkSessionId)
      return
    this.cancelled.push(this.walkSessionId)
    this.walkSessionId = undefined
    if (this.current === 'walking')
      this.enter('idle', nowMs)
  }

  /**
   * Plays one catalog action as the whole performance, for example `sit` or `greeting`.
   * Returns `false` for an action that the catalog does not know.
   */
  act(semanticAction: string, nowMs: number, source: MotionSource = 'llm') {
    const entry = this.catalog.get(semanticAction)
    if (!entry)
      return false
    this.restState = this.walkSessionId ? 'walking' : 'idle'
    this.enter('acting', nowMs)
    this.holdUntilMs = nowMs + entry.durationMs
    this.emit(semanticAction, nowMs, { source })
    return true
  }

  /**
   * Advances the director to `nowMs` and returns the intents and the cancellations since the last call.
   * Call it once per frame or on a fixed tick. A late call emits each due action once, not once per missed interval.
   */
  update(nowMs: number): DirectorOutput {
    if (!this.planned)
      this.planState(nowMs)
    if ((this.current === 'acting' || this.current === 'interrupted') && nowMs >= this.holdUntilMs)
      this.enter(this.nextRestState(), nowMs)

    switch (this.current) {
      case 'idle':
        this.every('weightShift', nowMs, timing.idleWeightShift, () => this.emit('idle_weight_shift', nowMs))
        this.every('glance', nowMs, timing.idleGlance, () => this.emit('idle_glance', nowMs))
        this.every('postureShift', nowMs, timing.idlePostureShift, () => this.emit('idle_posture_shift', nowMs))
        break
      case 'listening':
        this.every('nod', nowMs, timing.listenNod, () => this.emit('listen_nod', nowMs))
        break
      case 'thinking':
        this.every('thinkGlance', nowMs, timing.thinkGlance, () => this.emit('think_glance_away', nowMs, {
          requestedDurationMs: Math.round(randomBetween(this.random, ...timing.thinkGlanceDuration)),
        }))
        break
      case 'speaking':
        this.every('beat', nowMs, timing.speakBeat, () => this.emitSpeech('speak_beat', nowMs))
        this.every('speakNod', nowMs, timing.speakNod, () => this.emitSpeech('speak_nod', nowMs))
        break
      case 'walking':
        this.every('glance', nowMs, timing.walkGlance, () => this.emit('idle_glance', nowMs))
        break
      default:
        break
    }
    if (this.walkSessionId) {
      this.every('walkRenew', nowMs, timing.walkRenew, () => this.emit('walk', nowMs, {
        sessionId: this.walkSessionId,
        source: 'procedural',
        requestedDurationMs: 60_000,
      }))
    }

    const output = { intents: this.outbox.splice(0), cancelledSessions: this.cancelled.splice(0) }
    return output
  }

  private isRestState() {
    return this.current === 'idle' || this.current === 'walking'
  }

  private nextRestState(): MotionState {
    if (this.current === 'acting')
      return this.walkSessionId ? 'walking' : this.restState
    return this.userSpeaking ? 'listening' : this.walkSessionId ? 'walking' : 'idle'
  }

  /** Changes state and plans the first action of the new state. Timers of other states are dropped. */
  private enter(state: MotionState, nowMs: number) {
    if (this.current === state && this.planned)
      return
    this.current = state
    this.planState(nowMs)
  }

  private planState(nowMs: number) {
    this.planned = true
    const state = this.current
    const walkRenew = this.timers.get('walkRenew')
    this.timers.clear()
    if (walkRenew !== undefined)
      this.timers.set('walkRenew', walkRenew)
    else if (this.walkSessionId)
      this.timers.set('walkRenew', nowMs + timing.walkRenew[0])

    switch (state) {
      case 'idle':
        this.plan('weightShift', nowMs, timing.idleWeightShift)
        this.plan('glance', nowMs, timing.idleGlance)
        this.plan('postureShift', nowMs, timing.idlePostureShift)
        break
      case 'listening':
        this.emit('listen_head_tilt', nowMs)
        this.plan('nod', nowMs, timing.listenNod)
        break
      case 'thinking':
        this.timers.set('thinkGlance', nowMs + 200)
        break
      case 'speaking':
        this.plan('beat', nowMs, timing.speakBeatFirst)
        this.plan('speakNod', nowMs, timing.speakNod)
        break
      case 'walking':
        this.plan('glance', nowMs, timing.walkGlance)
        break
      default:
        break
    }
  }

  private plan(name: TimerName, nowMs: number, range: readonly [number, number]) {
    this.timers.set(name, nowMs + randomBetween(this.random, range[0], range[1]))
  }

  /** Runs `action` when the timer is due and plans the next one from `nowMs`. */
  private every(name: TimerName, nowMs: number, range: readonly [number, number], action: () => void) {
    const dueAt = this.timers.get(name)
    if (dueAt === undefined || nowMs < dueAt)
      return
    action()
    this.plan(name, nowMs, range)
  }

  private emitSpeech(semanticAction: string, nowMs: number) {
    if (!this.speechSessionId)
      return
    this.emit(semanticAction, nowMs, {
      sessionId: this.speechSessionId,
      offsetFromSpeechMs: Math.min(60_000, Math.max(0, Math.round(nowMs - this.speechStartedAtMs))),
    })
  }

  private emit(semanticAction: string, nowMs: number, extra: Partial<MotionIntent> = {}) {
    this.sequence++
    const candidate: MotionIntent = {
      schemaVersion: 1,
      id: `${this.idPrefix}-${this.sequence}`,
      timestampMs: Math.max(0, Math.round(nowMs)),
      source: 'procedural',
      state: this.current,
      semanticAction,
      ...(this.emotion !== undefined && { emotion: this.emotion }),
      intensity: this.intensity,
      ...extra,
    }
    // The director checks its own output with the same parser as any other source.
    const parsed = parseMotionIntent(candidate, { allowedActions: this.catalog.actions })
    if (parsed.ok)
      this.outbox.push(parsed.value)
  }

  private finishSession(sessionId: string, cancel: boolean) {
    if (cancel)
      this.cancelled.push(sessionId)
    this.endedSessions.push(sessionId)
    if (this.endedSessions.length > endedSessionMemory)
      this.endedSessions.shift()
  }
}
