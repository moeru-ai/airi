import { getSpeechBusContext, voiceCaptureLease } from '../../services/speech/bus'

/** A lease lasts this long after each renewal. */
export const CAPTURE_LEASE_MS = 3000
/** The holder renews its lease this often, so two renewals can fail before the lease ends. */
export const CAPTURE_LEASE_RENEW_MS = 1000

/**
 * Holds a capture lease on the speech bus until `signal` aborts, then releases it.
 *
 * The voice host pauses its own capture while the lease holds. Without a connected host, the lease has no effect.
 */
export function holdCaptureLease(signal: AbortSignal): void {
  if (signal.aborted)
    return

  const bus = getSpeechBusContext()
  const id = crypto.randomUUID()
  const renew = () => bus.emit(voiceCaptureLease, { id, until: Date.now() + CAPTURE_LEASE_MS })
  renew()
  const timer = setInterval(renew, CAPTURE_LEASE_RENEW_MS)
  signal.addEventListener('abort', () => {
    clearInterval(timer)
    bus.emit(voiceCaptureLease, { id, until: 0 })
  }, { once: true })
}

/**
 * Tracks the capture leases that the voice host receives, and reports when the first one starts or the last one ends.
 */
export class CaptureLeases {
  private readonly leases = new Map<string, number>()
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly onChange: (held: boolean) => void) {}

  get held(): boolean {
    return this.leases.size > 0
  }

  /** Renews the lease `id` until `until`. A time in the past releases it. */
  update(id: string, until: number): void {
    const before = this.held
    if (until > Date.now())
      this.leases.set(id, until)
    else
      this.leases.delete(id)
    this.settle(before)
  }

  dispose(): void {
    clearTimeout(this.timer)
    this.leases.clear()
  }

  /** Removes the ended leases, schedules the next end, and reports a change of `held`. */
  private settle(before: boolean) {
    const now = Date.now()
    for (const [id, until] of this.leases) {
      if (until <= now)
        this.leases.delete(id)
    }
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.held) {
      const next = Math.min(...this.leases.values())
      this.timer = setTimeout(() => this.settle(this.held), next - now)
    }
    if (this.held !== before)
      this.onChange(this.held)
  }
}
