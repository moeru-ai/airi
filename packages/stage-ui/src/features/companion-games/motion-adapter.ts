/** Game gestures that an optional model integration can translate into motions. */
export type MotionIntentName = 'wave' | 'point' | 'bow' | 'celebrate' | 'think' | 'rock' | 'paper' | 'scissors' | 'throw' | 'catch'

/** The host increases the session on restart and the revision for each gesture. */
export interface MotionIntent {
  readonly sessionId: number
  readonly revision: number
  readonly name: MotionIntentName
}

/** Ownership of one gesture on one model. Each acquisition returns a distinct lease. */
export interface MotionLease {
  /** The port aborts this signal for emergency stop, direct manipulation, or model changes. */
  readonly signal: AbortSignal
  /** Respect both signals before each model update. This method cannot enqueue motion beyond this lease. */
  play: (intent: MotionIntent, signal: AbortSignal) => void | Promise<void>
  /** Stop only this lease and release its ownership. Never clear another owner's motion. */
  release: () => void
}

/**
 * Optional boundary supplied by the model integration. Emergency stop and direct manipulation outrank games.
 * User games outrank notification gestures, conversation, and ambient motion. Unavailable models refuse acquisition.
 */
export interface MotionPort {
  /**
   * Reserve user-game priority for the whole active session, including gaps between gestures.
   * Null releases this port's reservation. Queue notification gestures while reserved, but deliver native notifications normally.
   */
  sessionChanged: (sessionId: number | null) => void
  /** Return undefined to refuse. Honor cancellation, and release a late lease only through its own release method. */
  acquire: (intent: MotionIntent, signal: AbortSignal) => MotionLease | undefined | Promise<MotionLease | undefined>
}

interface MotionRun {
  intent: MotionIntent
  controller: AbortController
  timeout: ReturnType<typeof setTimeout> | undefined
  lease: MotionLease | undefined
  detachRevocation: (() => void) | undefined
}

/** Each optional gesture gets at most five seconds of ownership, including acquisition. */
const motionTimeoutMs = 5000

/**
 * Isolates optional game motion from game state and other motion owners.
 *
 * State contains one active operation, one latest pending intent, and a monotonic intent watermark.
 * New intents cancel the active lease. Duplicate or older session/revision pairs cannot replace newer work.
 * Cancellation retains the watermark. Disposal permanently rejects new work.
 *
 * The adapter waits for a cancelled operation to settle before it starts another operation.
 * An unresponsive port therefore blocks new motion instead of creating unbounded promises or leases.
 * Port errors stop motion without affecting the game. No port means no motion.
 */
export class GameMotionAdapter {
  private active: MotionRun | undefined
  private pending: MotionIntent | undefined
  private latest: MotionIntent | undefined
  private disposed = false
  private sessionId: number | null = null
  private reservationReady = false

  constructor(private readonly port?: MotionPort) {}

  /** Signal whole-session ownership before play, and release it on pause, stop, model change, or unmount. */
  setSession(sessionId: number | null): void {
    if (this.disposed || sessionId === this.sessionId || (sessionId !== null && (!Number.isSafeInteger(sessionId) || sessionId < 0)))
      return
    this.cancel()
    this.sessionId = sessionId
    try {
      this.port?.sessionChanged(sessionId)
      this.reservationReady = true
    }
    catch {
      // A failed reservation cannot authorize optional avatar motion.
      this.reservationReady = false
    }
  }

  /** Snapshot the latest intent. Session and revision values must be nonnegative safe integers. */
  submit(intent: MotionIntent): void {
    if (this.disposed || !this.port || !this.isNewer(intent))
      return

    this.setSession(intent.sessionId)
    if (this.sessionId !== intent.sessionId || !this.reservationReady)
      return
    const snapshot = { ...intent }
    this.latest = snapshot
    this.pending = snapshot
    if (this.active)
      this.stop(this.active)
    this.start()
  }

  /** On pause, replay, restart, or model changes, discard pending motion and stop only the active lease. */
  cancel(): void {
    this.pending = undefined
    if (this.active)
      this.stop(this.active)
  }

  /** Release game ownership and prevent all future submissions. Repeated disposal has no additional effect. */
  dispose(): void {
    this.setSession(null)
    this.disposed = true
    this.cancel()
  }

  private isNewer(intent: MotionIntent): boolean {
    if (!Number.isSafeInteger(intent.sessionId) || intent.sessionId < 0
      || !Number.isSafeInteger(intent.revision) || intent.revision < 0) {
      return false
    }

    if (!this.latest)
      return true

    return intent.sessionId > this.latest.sessionId
      || (intent.sessionId === this.latest.sessionId && intent.revision > this.latest.revision)
  }

  private start(): void {
    if (this.disposed || !this.port || this.active || !this.pending)
      return

    const run: MotionRun = {
      intent: this.pending,
      controller: new AbortController(),
      timeout: undefined,
      lease: undefined,
      detachRevocation: undefined,
    }
    this.pending = undefined
    this.active = run
    run.timeout = setTimeout(() => {
      if (this.active === run)
        this.cancel()
    }, motionTimeoutMs)
    void this.play(run, this.port)
  }

  private async play(run: MotionRun, port: MotionPort): Promise<void> {
    try {
      run.lease = await port.acquire(run.intent, run.controller.signal)
      if (!run.lease || run.controller.signal.aborted || this.disposed)
        return

      const lease = run.lease
      if (lease.signal.aborted)
        return

      const revoke = () => this.cancel()
      lease.signal.addEventListener('abort', revoke, { once: true })
      run.detachRevocation = () => lease.signal.removeEventListener('abort', revoke)
      await lease.play(run.intent, run.controller.signal)
    }
    catch {
      // Motion is optional. A failed port cannot interrupt or change the game.
    }
    finally {
      this.stop(run)
      this.active = undefined
      this.start()
    }
  }

  private stop(run: MotionRun): void {
    if (run.timeout !== undefined) {
      clearTimeout(run.timeout)
      run.timeout = undefined
    }
    run.detachRevocation?.()
    run.detachRevocation = undefined
    // Abort before release so asynchronous model updates lose permission first.
    run.controller.abort()
    const lease = run.lease
    run.lease = undefined
    try {
      lease?.release()
    }
    catch {
      // The signal remains aborted. Retrying a failed release can affect a later owner.
    }
  }
}
