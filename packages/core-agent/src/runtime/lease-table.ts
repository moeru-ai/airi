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

/**
 * Result of a lease request. `previous` names the holder that lost it to higher salience.
 * A refused request names the current holder, or the waiting candidate that ranks first.
 */
export type LeaseGrant
  = | { granted: true, lease: Lease, previous?: Lease }
    | { granted: false, current?: Lease, ahead?: string }

/** Ordering facts of a request that waits for a resource. */
export interface LeaseCandidate {
  salience: number
  /** Earlier deadlines go first within one salience tier. */
  deadlineAt?: number
  /** Longer waits go first after salience and deadline. Waiting time prevents starvation and grants nothing else. */
  waitingSince: number
}

/**
 * A waiting candidate that has not asked again for this long leaves the line.
 * Requesters withdraw explicitly. This limit only keeps a requester that never withdraws from blocking a line.
 */
export const LEASE_CANDIDATE_TTL_MS = 300_000

/** Salience tiers from the interruption, normal, deferrable, and droppable ranges. */
function salienceTier(salience: number) {
  return salience >= 0.85 ? 3 : salience >= 0.6 ? 2 : salience >= 0.3 ? 1 : 0
}

/**
 * Orders candidates for one resource: higher salience tier first, then the earlier deadline, then the longer wait.
 *
 * Returns:
 * - A negative number when `a` goes first.
 */
export function compareLeaseCandidates(a: LeaseCandidate, b: LeaseCandidate) {
  return salienceTier(b.salience) - salienceTier(a.salience)
    || (a.deadlineAt ?? Number.POSITIVE_INFINITY) - (b.deadlineAt ?? Number.POSITIVE_INFINITY)
    || a.waitingSince - b.waitingSince
}

/**
 * Grants exclusive resources to runs: the voice, the expression baseline, or module control.
 *
 * Use when:
 * - Two runs must never drive one resource at the same time.
 *
 * Expects:
 * - Holders release their leases when they end. Expiry frees a lease whose holder never released it.
 * - Only the host grants leases. Classifier or model output never grants one.
 * - A waiting requester asks again, or withdraws when it stops waiting. Only requests for the same resource compete.
 *
 * Returns:
 * - Cloned leases. Subscribers hear every grant and release.
 */
export class LeaseTable {
  private readonly leases = new Map<string, Lease>()
  private readonly listeners = new Set<() => void>()
  private readonly candidates = new Map<string, Map<string, LeaseCandidate & { seenAt: number }>>()

  constructor(private readonly options: { now?: () => number } = {}) {}

  /**
   * Grants a free resource to the first waiting candidate, renews the holder's own lease, or takes it over with `preempt` and strictly higher salience.
   * A refused requester waits in the resource's line until it asks again within {@link LEASE_CANDIDATE_TTL_MS}, withdraws, or gets the lease.
   */
  acquire(resource: string, holder: string, options: { salience: number, ttlMs?: number, preempt?: boolean, deadlineAt?: number, waitingSince?: number }): LeaseGrant {
    const now = this.now()
    const current = this.holder(resource)
    const takesOver = Boolean(current && current.holder !== holder && options.preempt && options.salience > current.salience)
    if (current?.holder !== holder && !takesOver) {
      const line = this.line(resource, now)
      const waiting = line.get(holder)
      line.set(holder, { salience: options.salience, deadlineAt: options.deadlineAt, waitingSince: waiting?.waitingSince ?? options.waitingSince ?? now, seenAt: now })
      if (current)
        return { granted: false, current }
      const [first] = [...line].sort(([, a], [, b]) => compareLeaseCandidates(a, b))
      if (first?.[0] !== holder)
        return { granted: false, ahead: first?.[0] }
    }
    this.candidates.get(resource)?.delete(holder)

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

  /** Leaves the line for a resource without holding it. */
  withdraw(resource: string, holder: string) {
    if (this.candidates.get(resource)?.delete(holder))
      this.notify()
  }

  /** Releases every lease of a holder and leaves every line, for example when its run reaches a final state. */
  releaseAll(holder: string) {
    for (const line of this.candidates.values())
      line.delete(holder)
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

  /** Returns the live line for a resource. Candidates that stopped asking or passed their deadline leave it. */
  private line(resource: string, now: number) {
    let line = this.candidates.get(resource)
    if (!line) {
      line = new Map()
      this.candidates.set(resource, line)
    }
    for (const [holder, candidate] of line) {
      if (now - candidate.seenAt >= LEASE_CANDIDATE_TTL_MS || (candidate.deadlineAt !== undefined && candidate.deadlineAt <= now))
        line.delete(holder)
    }
    return line
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
