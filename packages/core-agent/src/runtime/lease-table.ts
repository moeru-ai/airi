/** One exclusive resource with one holder. */
export interface Lease {
  /** For example `voice` or `module:minecraft`. */
  resource: string
  /** A run id for the voice, which ends with its run. A session id for module control, which spans the session's runs. */
  holder: string
  grantedAt: number
  /** An expired lease is free. Without it, the lease lasts until release. */
  expiresAt?: number
  /** Salience of the work that holds it. Only higher salience can take it over. */
  salience: number
}

/** Result of a lease request. `previous` names the holder that lost it to higher salience. */
export type LeaseGrant
  = | { granted: true, lease: Lease, previous?: Lease }
    | { granted: false, current: Lease }

/**
 * Grants exclusive resources to runs: the voice, the expression baseline, or module control.
 *
 * Use when:
 * - Two runs must never drive one resource at the same time.
 *
 * Expects:
 * - Holders release their leases when they end. Expiry frees a lease whose holder never released it.
 * - Only the host grants leases. Classifier or model output never grants one.
 *
 * Returns:
 * - Cloned leases. Subscribers hear every grant and release.
 */
export class LeaseTable {
  private readonly leases = new Map<string, Lease>()
  private readonly listeners = new Set<() => void>()

  constructor(private readonly options: { now?: () => number } = {}) {}

  /**
   * Grants a free or expired resource, renews the holder's own lease, or takes it over with `preempt` and strictly higher salience.
   */
  acquire(resource: string, holder: string, options: { salience: number, ttlMs?: number, preempt?: boolean }): LeaseGrant {
    const current = this.holder(resource)
    if (current && current.holder !== holder && (!options.preempt || !(options.salience > current.salience)))
      return { granted: false, current }

    const now = this.now()
    const lease: Lease = {
      resource,
      holder,
      grantedAt: current?.holder === holder ? current.grantedAt : now,
      expiresAt: options.ttlMs === undefined ? undefined : now + options.ttlMs,
      salience: options.salience,
    }
    this.leases.set(resource, lease)
    this.notify()
    const previous = current && current.holder !== holder ? current : undefined
    return { granted: true, lease: structuredClone(lease), previous }
  }

  /** Releases one lease. A release by a run that no longer holds it does nothing. */
  release(resource: string, holder: string) {
    if (this.leases.get(resource)?.holder !== holder)
      return
    this.leases.delete(resource)
    this.notify()
  }

  /** Releases every lease of a holder, for example when its run reaches a final state. */
  releaseAll(holder: string) {
    let changed = false
    for (const [resource, lease] of this.leases) {
      if (lease.holder === holder) {
        this.leases.delete(resource)
        changed = true
      }
    }
    if (changed)
      this.notify()
  }

  /** Returns the live holder of a resource. An expired lease counts as free. */
  holder(resource: string): Lease | undefined {
    const lease = this.leases.get(resource)
    if (!lease)
      return undefined
    if (lease.expiresAt !== undefined && lease.expiresAt <= this.now()) {
      this.leases.delete(resource)
      return undefined
    }
    return structuredClone(lease)
  }

  /** Returns every live lease. */
  snapshot(): Lease[] {
    return Array.from(this.leases.keys()).flatMap(resource => this.holder(resource) ?? [])
  }

  /** Calls the listener after every grant and release. Returns the unsubscribe function. */
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private now() {
    return this.options.now?.() ?? Date.now()
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener()
      }
      catch (error) {
        console.error('Lease observer failed:', error)
      }
    }
  }
}
