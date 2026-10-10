import type { NotificationWaveContext, NotificationWaveIntent } from '@proj-airi/stage-ui-three/companion'
import type { MotionController, MotionPlayOptions } from '@proj-airi/stage-ui-three/motions'

import type { MotionIntentName } from '../../companion-games/motion-adapter'

import { NotificationWaveQueue } from '@proj-airi/stage-ui-three/companion'

/** All producers share one loaded-model owner. Nothing here changes focus, native surfaces, or notification delivery. */
export interface MotionAttentionState {
  manipulationActive: boolean
  paused: boolean
  doNotDisturb: boolean
  reducedMotion: boolean
  enabled: boolean
}

interface Operation {
  id: string
  kind: 'user' | 'game' | 'notification' | 'conversation'
  signal: AbortController
  started: boolean
  deadline: number
  complete: (accepted: boolean) => void
  finished: Promise<boolean>
}

/** A game reservation outlives individual gestures, but expires when its owning renderer stops sending heartbeats. */
export interface GameReservation {
  ownerId: string
  sessionId: number
  expiresAt: number
}

const gameMotions: Partial<Record<MotionIntentName, string>> = {
  wave: 'wave',
  point: 'present',
  bow: 'bow',
  celebrate: 'celebrate',
  think: 'nod',
  throw: 'present',
  catch: 'celebrate',
}

/**
 * Arbitrates the only write path to one avatar's controller. A replacement cancels the old load before starting the next.
 * Each async completion and cancellation checks its operation identity. A stale lease cannot stop a newer user's motion.
 * Call tick while mounted, including idle frames. Dispose before replacing the controller or loaded-model instance.
 */
export class MotionOwnership {
  private queue: NotificationWaveQueue
  private operation: Operation | undefined
  private game: GameReservation | undefined
  private disposed = false
  private revision = 0
  private state: MotionAttentionState = { manipulationActive: false, paused: false, doNotDisturb: false, reducedMotion: false, enabled: false }

  constructor(
    readonly modelId: string,
    private readonly controller: MotionController,
    private readonly onGameRevoked?: (reservation: GameReservation) => void,
  ) {
    this.queue = new NotificationWaveQueue(modelId)
  }

  get motionRevision() { return this.revision }
  get gameActive() { return !!this.game }

  setState(state: MotionAttentionState, now = Date.now()) {
    const interrupted = state.manipulationActive || state.paused
    this.state = { ...state }
    if (interrupted) {
      this.revokeGame()
      this.cancel(this.operation)
    }
    this.tick(now)
  }

  /** The adapter preserves source identity and expiry. Persisted inbox records never enter this queue. */
  notify(intent: Omit<NotificationWaveIntent, 'modelId'>, now = Date.now()) {
    if (this.disposed)
      return 'suppressed'
    const accepted = this.queue.enqueue({ ...intent, modelId: this.modelId }, this.context(), now)
    this.tick(now)
    return accepted
  }

  /** Read or removed inbox groups withdraw only their unstarted attention. An active wave retains its finite deadline. */
  acknowledgeNotifications(ids: readonly string[]) {
    for (const id of ids.slice(0, 100))
      this.queue.withdraw(id)
  }

  /** Explicit stop clears pending attention, game reservations, queued motion, and in-flight loads. */
  stop() {
    if (this.disposed)
      return
    this.revokeGame()
    this.cancel(this.operation)
    this.controller.stop()
    // Suppression clears pending work while retaining bounded replay protection for already-seen events.
    this.queue.next({ ...this.context(), enabled: false }, Date.now())
    this.revision++
  }

  async playUser(id: string, options: MotionPlayOptions = {}) {
    if (this.blocked())
      return false
    this.revokeGame()
    if (options.mode === 'queue' && this.operation?.kind === 'user') {
      this.operation.deadline = Date.now() + 65_000 * Math.min(17, this.controller.snapshot.queuedIds.length + 2)
      this.revision++
      return this.controller.play(id, options)
    }
    return this.begin('user', crypto.randomUUID(), id, options).started
  }

  async playConversation(id: string) {
    if (this.blocked() || this.game || (this.operation && this.operation.kind !== 'conversation'))
      return false
    if (id === 'stop') {
      if (this.operation?.kind === 'conversation')
        this.cancel(this.operation)
      return true
    }
    if (this.operation) {
      this.operation.deadline = Date.now() + 65_000 * Math.min(17, this.controller.snapshot.queuedIds.length + 2)
      return this.controller.play(id, { mode: 'queue' })
    }
    return this.begin('conversation', crypto.randomUUID(), id, { mode: 'queue' }).started
  }

  /** Reserving a new user-started game replaces lower-priority playback. Heartbeats cannot recreate an expired reservation. */
  reserveGame(ownerId: string, sessionId: number, now = Date.now()) {
    if (this.blocked() || !Number.isSafeInteger(sessionId) || sessionId < 0)
      return false
    this.cancel(this.operation)
    this.revokeGame()
    this.game = { ownerId, sessionId, expiresAt: now + 4000 }
    return true
  }

  heartbeatGame(ownerId: string, sessionId: number, now = Date.now()) {
    if (!this.ownsGame(ownerId, sessionId) || this.blocked())
      return false
    if (now >= this.game!.expiresAt) {
      this.releaseGame(ownerId, sessionId)
      return false
    }
    this.game!.expiresAt = now + 4000
    return true
  }

  releaseGame(ownerId: string, sessionId: number) {
    if (!this.ownsGame(ownerId, sessionId))
      return
    this.revokeGame()
    if (this.operation?.kind === 'game')
      this.cancel(this.operation)
  }

  /** Unsupported hand shapes remain text-only. No misleading rock/paper/scissors pose is substituted. */
  async playGame(ownerId: string, sessionId: number, leaseId: string, name: MotionIntentName) {
    const id = gameMotions[name]
    if (!id || !this.ownsGame(ownerId, sessionId) || this.blocked() || this.state.reducedMotion)
      return false
    if (Date.now() >= this.game!.expiresAt) {
      this.releaseGame(ownerId, sessionId)
      return false
    }
    const operation = this.begin('game', leaseId, id, { loop: false, duration: 3.5 })
    if (!await operation.started)
      return false
    return operation.finished
  }

  /** A remote cancellation targets its own lease. It cannot cancel another lease with the same motion ID. */
  releaseGameMotion(ownerId: string, sessionId: number, leaseId: string) {
    if (this.ownsGame(ownerId, sessionId) && this.operation?.kind === 'game' && this.operation.id === leaseId)
      this.cancel(this.operation)
  }

  tick(now = Date.now()) {
    if (this.disposed)
      return
    if (this.game && now >= this.game.expiresAt)
      this.releaseGame(this.game.ownerId, this.game.sessionId)
    const operation = this.operation
    const snapshot = this.controller.snapshot
    if (operation && (now >= operation.deadline || (operation.started && !snapshot.loadingId && snapshot.queuedIds.length === 0 && snapshot.activeId === snapshot.idleId))) {
      if (now >= operation.deadline)
        this.cancel(operation)
      else
        this.finish(operation, true, now)
    }
    const decision = this.queue.next(this.context(), now)
    if (decision.kind === 'cancel') {
      if (this.operation?.kind === 'notification' && this.operation.id === decision.leaseId)
        this.cancel(this.operation)
    }
    else if (decision.kind === 'start') {
      void this.begin('notification', decision.lease.leaseId, 'wave', { loop: false, duration: decision.lease.duration }).started
    }
  }

  dispose() {
    if (this.disposed)
      return
    this.revokeGame()
    this.cancel(this.operation)
    this.queue.dispose()
    this.disposed = true
  }

  private revokeGame() {
    const previous = this.game
    this.game = undefined
    if (previous)
      this.onGameRevoked?.(previous)
  }

  private blocked() { return this.disposed || this.state.paused || this.state.manipulationActive }
  private ownsGame(ownerId: string, sessionId: number) { return this.game?.ownerId === ownerId && this.game.sessionId === sessionId }

  private context(): NotificationWaveContext {
    return {
      ...this.state,
      modelId: this.modelId,
      snapshot: this.controller.snapshot,
      gameActive: !!this.game,
      userMotionActive: this.operation?.kind === 'user',
      conversationMotionActive: this.operation?.kind === 'conversation',
      waveAvailable: !!this.controller.catalog.get('wave'),
    }
  }

  private begin(kind: Operation['kind'], id: string, motionId: string, options: MotionPlayOptions) {
    this.cancel(this.operation)
    let complete!: Operation['complete']
    const finished = new Promise<boolean>((resolve) => {
      complete = resolve
    })
    const operation: Operation = { id, kind, signal: new AbortController(), started: false, deadline: Date.now() + (kind === 'game' ? 4000 : kind === 'notification' ? 5000 : 65_000), complete, finished }
    this.operation = operation
    this.revision++
    const started = this.controller.play(motionId, options).then((accepted) => {
      if (this.operation !== operation || operation.signal.signal.aborted)
        return false
      operation.started = accepted
      if (!accepted)
        this.finish(operation, false)
      return accepted
    }).catch(() => {
      if (this.operation === operation)
        this.finish(operation, false)
      return false
    })
    return { started, finished }
  }

  private finish(operation: Operation, accepted: boolean, now = Date.now()) {
    if (this.operation !== operation)
      return
    this.operation = undefined
    operation.signal.abort()
    operation.complete(accepted)
    if (operation.kind === 'notification')
      this.queue.finish(this.modelId, operation.id, now)
  }

  private cancel(operation: Operation | undefined) {
    if (!operation || this.operation !== operation)
      return
    this.controller.stop()
    this.finish(operation, false)
  }
}
