import type { MotionIntent, MotionLease, MotionPort } from '../../companion-games/motion-adapter'
import type { GameMotionRequest, GameMotionResult } from './game-protocol'

import { watch } from 'vue'

import * as v from 'valibot'

import { getMotionBus } from './bus'
import { gameMotionRequest, gameMotionRequestSchema, gameMotionResult, gameMotionResultSchema, gameMotionRevoked, gameMotionRevokedSchema } from './game-protocol'

interface Reservation {
  modelId: string
  ownerId: string
  sessionId: number
  instanceId: string | undefined
  controller: AbortController
  ready: Promise<boolean>
  heartbeat: ReturnType<typeof setTimeout> | undefined
}

interface Lease {
  id: string
  intent: MotionIntent
  reservation: Reservation
  controller: AbortController
  detach: () => void
  timeout: ReturnType<typeof setTimeout> | undefined
  used: boolean
}

interface PendingRequest {
  request: GameMotionRequest
  finish: (result?: GameMotionResult) => void
}

/**
 * Owns one reservation, one acquisition, and one lease. At most three requests remain pending: reserve, heartbeat, and play.
 * Session changes abort local work before releasing its remote identity. Late reserve acknowledgements release only their returned instance.
 * Owner IDs contain this port's UUID and a monotonic generation. This bounds late-result cleanup without retaining old sessions.
 */
class GameMotionPort implements MotionPort {
  private readonly portId = crypto.randomUUID()
  private readonly bus = getMotionBus()
  private readonly pending = new Map<string, PendingRequest>()
  private readonly removeResult: () => void
  private readonly removeRevoked: () => void
  private readonly stopModelWatch: () => void
  private reservation: Reservation | undefined
  private lease: Lease | undefined
  private acquisition: object | undefined
  private generation = 0
  private disposed = false

  constructor(private readonly selectedModelId: () => string | undefined) {
    this.removeResult = this.bus.on(gameMotionResult, ({ body }) => this.receiveResult(body))
    this.removeRevoked = this.bus.on(gameMotionRevoked, ({ body }) => {
      const parsed = v.safeParse(gameMotionRevokedSchema, body)
      const reservation = this.reservation
      if (!parsed.success || !reservation)
        return
      const revoked = parsed.output
      if (revoked.modelId === reservation.modelId && revoked.instanceId === reservation.instanceId
        && revoked.ownerId === reservation.ownerId && revoked.sessionId === reservation.sessionId) {
        this.releaseReservation(reservation)
      }
    })
    this.stopModelWatch = watch(selectedModelId, () => this.checkModel(), { flush: 'sync' })
  }

  sessionChanged(sessionId: number | null): void {
    if (this.disposed)
      return
    this.checkModel()
    if (sessionId !== null && (!Number.isSafeInteger(sessionId) || sessionId < 0))
      return
    if (this.reservation?.sessionId === sessionId)
      return
    if (this.reservation)
      this.releaseReservation(this.reservation)
    if (sessionId === null)
      return

    const modelId = this.selectedModelId()
    const ownerId = `${this.portId}/${++this.generation}`
    const parsed = v.safeParse(gameMotionRequestSchema, { modelId, ownerId, sessionId, requestId: `${ownerId}/reserve`, type: 'reserve' })
    if (!parsed.success)
      return

    const reservation: Reservation = {
      modelId: parsed.output.modelId,
      ownerId,
      sessionId,
      instanceId: undefined,
      controller: new AbortController(),
      ready: Promise.resolve(false),
      heartbeat: undefined,
    }
    this.reservation = reservation
    reservation.ready = this.request(parsed.output, reservation.controller.signal, 3000).then((result) => {
      if (!result?.accepted || !this.isCurrent(reservation)) {
        this.releaseReservation(reservation)
        return false
      }
      reservation.instanceId = result.instanceId
      this.scheduleHeartbeat(reservation)
      return true
    })
  }

  async acquire(intent: MotionIntent, signal: AbortSignal): Promise<MotionLease | undefined> {
    this.checkModel()
    const reservation = this.reservation
    if (!reservation || this.disposed || signal.aborted || this.acquisition || this.lease
      || intent.sessionId !== reservation.sessionId || !Number.isSafeInteger(intent.revision) || intent.revision < 0) {
      return undefined
    }
    const acquisition = {}
    this.acquisition = acquisition
    try {
      const ready = await this.waitForReservation(reservation, signal)
      if (!ready || signal.aborted || !this.isCurrent(reservation))
        return undefined
      const controller = new AbortController()
      const lease: Lease = { id: crypto.randomUUID(), intent: { ...intent }, reservation, controller, detach: () => {}, timeout: undefined, used: false }
      const abort = () => this.releaseLease(lease)
      signal.addEventListener('abort', abort, { once: true })
      lease.detach = () => signal.removeEventListener('abort', abort)
      this.lease = lease
      lease.timeout = setTimeout(() => this.releaseLease(lease), 5000)
      return {
        signal: controller.signal,
        play: (next, playbackSignal) => this.play(lease, next, playbackSignal),
        release: () => this.releaseLease(lease),
      }
    }
    finally {
      if (this.acquisition === acquisition)
        this.acquisition = undefined
    }
  }

  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    this.stopModelWatch()
    this.removeRevoked()
    if (this.reservation)
      this.releaseReservation(this.reservation)
    // Keep only late reserve cleanup alive for one request deadline. Lost acknowledgements expire on the host after four seconds.
    setTimeout(this.removeResult, 3000)
  }

  private checkModel(): void {
    if (this.reservation && this.reservation.modelId !== this.selectedModelId())
      this.releaseReservation(this.reservation)
  }

  private isCurrent(reservation: Reservation): boolean {
    this.checkModel()
    return !this.disposed && this.reservation === reservation && !reservation.controller.signal.aborted
  }

  private waitForReservation(reservation: Reservation, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      const abort = () => finish(false)
      function finish(accepted: boolean) {
        signal.removeEventListener('abort', abort)
        resolve(accepted)
      }
      signal.addEventListener('abort', abort, { once: true })
      void reservation.ready.then(finish)
      if (signal.aborted)
        finish(false)
    })
  }

  private scheduleHeartbeat(reservation: Reservation): void {
    reservation.heartbeat = setTimeout(async () => {
      reservation.heartbeat = undefined
      if (!this.isCurrent(reservation) || !reservation.instanceId)
        return
      const result = await this.request({ ...this.correlation(reservation), type: 'heartbeat' }, reservation.controller.signal, 2500)
      if (!result?.accepted || !this.isCurrent(reservation)) {
        this.releaseReservation(reservation)
        return
      }
      this.scheduleHeartbeat(reservation)
    }, 1000)
  }

  private async play(lease: Lease, intent: MotionIntent, signal: AbortSignal): Promise<void> {
    if (lease.used || this.lease !== lease || signal.aborted || !this.isCurrent(lease.reservation)
      || intent.sessionId !== lease.intent.sessionId || intent.revision !== lease.intent.revision || intent.name !== lease.intent.name) {
      this.releaseLease(lease)
      return
    }
    lease.used = true
    const request = { ...this.correlation(lease.reservation), type: 'play' as const, leaseId: lease.id, intentName: intent.name }
    const parsed = v.safeParse(gameMotionRequestSchema, request)
    if (!parsed.success) {
      this.releaseLease(lease)
      return
    }
    const abort = () => this.releaseLease(lease)
    signal.addEventListener('abort', abort, { once: true })
    try {
      await this.request(parsed.output, lease.controller.signal, 5000)
    }
    finally {
      signal.removeEventListener('abort', abort)
      this.releaseLease(lease)
    }
  }

  private correlation(reservation: Reservation) {
    return {
      modelId: reservation.modelId,
      ownerId: reservation.ownerId,
      sessionId: reservation.sessionId,
      instanceId: reservation.instanceId!,
      requestId: crypto.randomUUID(),
    }
  }

  private releaseLease(lease: Lease): void {
    if (this.lease !== lease)
      return
    this.lease = undefined
    if (lease.timeout !== undefined)
      clearTimeout(lease.timeout)
    lease.detach()
    lease.controller.abort()
    this.publish({ ...this.correlation(lease.reservation), type: 'release-lease', leaseId: lease.id })
  }

  private releaseReservation(reservation: Reservation): void {
    if (this.reservation !== reservation)
      return
    this.reservation = undefined
    if (reservation.heartbeat !== undefined)
      clearTimeout(reservation.heartbeat)
    reservation.controller.abort()
    if (this.lease?.reservation === reservation)
      this.releaseLease(this.lease)
    if (reservation.instanceId)
      this.publish({ ...this.correlation(reservation), type: 'release-session' })
  }

  private request(request: GameMotionRequest, signal: AbortSignal, timeout: number): Promise<GameMotionResult | undefined> {
    if (signal.aborted || this.pending.size >= 3)
      return Promise.resolve(undefined)
    return new Promise((resolve) => {
      const abort = () => this.pending.get(request.requestId)?.finish()
      const timer = setTimeout(abort, timeout)
      const pending: PendingRequest = {
        request,
        finish: (result) => {
          if (this.pending.get(request.requestId) !== pending)
            return
          this.pending.delete(request.requestId)
          clearTimeout(timer)
          signal.removeEventListener('abort', abort)
          resolve(result)
        },
      }
      this.pending.set(request.requestId, pending)
      signal.addEventListener('abort', abort, { once: true })
      void this.bus.emit(gameMotionRequest, request).catch(abort)
    })
  }

  private publish(request: GameMotionRequest): void {
    // Releases are best effort. A disconnected renderer cannot extend the host's four-second reservation deadline.
    void this.bus.emit(gameMotionRequest, request).catch(() => {})
  }

  private receiveResult(body: unknown): void {
    const parsed = v.safeParse(gameMotionResultSchema, body)
    if (!parsed.success)
      return
    const result = parsed.output
    const pending = this.pending.get(result.requestId)
    const request = pending?.request
    if (request && request.type === result.type && request.modelId === result.modelId
      && request.ownerId === result.ownerId && request.sessionId === result.sessionId
      && (request.type === 'reserve' || request.instanceId === result.instanceId)) {
      if (result.type === 'reserve' && result.accepted && this.reservation?.ownerId === result.ownerId)
        this.reservation.instanceId = result.instanceId
      pending.finish(result)
      return
    }
    if (result.type !== 'reserve' || !result.accepted || !this.issuedReserve(result))
      return
    const reservation = this.reservation
    if (reservation?.ownerId === result.ownerId && reservation.instanceId === result.instanceId)
      return
    // A cancelled or superseded reserve can finish after its local request disappears. Release that exact remote instance.
    this.publish({
      modelId: result.modelId,
      instanceId: result.instanceId,
      ownerId: result.ownerId,
      sessionId: result.sessionId,
      requestId: crypto.randomUUID(),
      type: 'release-session',
    })
  }

  private issuedReserve(result: GameMotionResult): boolean {
    if (!result.ownerId.startsWith(`${this.portId}/`) || result.requestId !== `${result.ownerId}/reserve`)
      return false
    const generation = Number(result.ownerId.slice(this.portId.length + 1))
    return Number.isSafeInteger(generation) && generation > 0 && generation <= this.generation
  }
}

/**
 * Connects game sessions to the active avatar host through Eventa. Call dispose when the game surface unmounts.
 * Reactive selected-model changes revoke motion immediately. Every operation also checks nonreactive model getters.
 */
export function createGameMotionPort(selectedModelId: () => string | undefined): MotionPort & { dispose: () => void } {
  return new GameMotionPort(selectedModelId)
}
