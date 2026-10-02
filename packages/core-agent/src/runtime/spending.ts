/** One counted request cost. */
export interface SpendingEntry {
  at: number
  amount: number
  currency: string
  runId?: string
}

/** A user spending limit over a rolling window. */
export interface SpendingLimit {
  amount: number
  currency: string
  windowMs: number
}

/** State of the limit at one moment. */
export interface SpendingState {
  spent: number
  /** Requests in the window whose cost is unknown, or priced in another currency. The limit cannot count them. */
  uncounted: number
  over: boolean
  /** When spending falls back under the limit, if it is over. */
  underAt?: number
}

/** The ledger keeps entries for this long, so any window up to one day can be read. */
const LEDGER_RETENTION_MS = 24 * 60 * 60 * 1000

/**
 * Counts the estimated cost of model requests for an optional user spending limit.
 *
 * Use when:
 * - The host admits background work under a spending limit that the user set.
 *
 * Expects:
 * - The limit is one admission constraint. It never selects a cheaper model, and it never sets how often a persona speaks.
 *
 * Returns:
 * - Spending within a rolling window. Subscribers hear every record.
 */
export class SpendingLedger {
  private entries: SpendingEntry[] = []
  private unknown: Array<{ at: number, runId?: string }> = []
  private readonly listeners = new Set<() => void>()

  constructor(private readonly options: { now?: () => number } = {}) {}

  /** Counts one request. An unknown cost still counts as an uncounted request. */
  record(cost: { amount: number, currency: string } | undefined, runId?: string) {
    const at = this.now()
    if (cost)
      this.entries.push({ at, amount: cost.amount, currency: cost.currency, runId })
    else
      this.unknown.push({ at, runId })
    this.prune(at)
    for (const listener of this.listeners) {
      try {
        listener()
      }
      catch (error) {
        console.error('Spending observer failed:', error)
      }
    }
  }

  /** Reads the limit now. Without a limit, nothing is over. */
  check(limit: SpendingLimit | undefined): SpendingState {
    const now = this.now()
    this.prune(now)
    if (!limit)
      return { spent: 0, uncounted: 0, over: false }
    const since = now - limit.windowMs
    const counted = this.entries.filter(entry => entry.at > since && entry.currency === limit.currency)
    const spent = counted.reduce((sum, entry) => sum + entry.amount, 0)
    const uncounted = this.unknown.filter(entry => entry.at > since).length
      + this.entries.filter(entry => entry.at > since && entry.currency !== limit.currency).length
    if (spent < limit.amount)
      return { spent, uncounted, over: false }

    // Spending falls under the limit when enough of the oldest entries leave the window.
    let remaining = spent
    let underAt = now
    for (const entry of counted) {
      remaining -= entry.amount
      underAt = entry.at + limit.windowMs
      if (remaining < limit.amount)
        break
    }
    return { spent, uncounted, over: true, underAt }
  }

  /** Calls the listener after every record. Returns the unsubscribe function. */
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private prune(now: number) {
    const since = now - LEDGER_RETENTION_MS
    if (this.entries[0] && this.entries[0].at <= since)
      this.entries = this.entries.filter(entry => entry.at > since)
    if (this.unknown[0] && this.unknown[0].at <= since)
      this.unknown = this.unknown.filter(entry => entry.at > since)
  }

  private now() {
    return this.options.now?.() ?? Date.now()
  }
}
