export interface LeaseTableOptions {
  /** A key expires when no `touch` renews it for longer than this. */
  readonly ttlMs: number
}

export interface LeaseTable<K> {
  /** Adds the key, or renews its lease. */
  touch: (key: K, now: number) => void
  /** Removes and returns the keys whose last `touch` is more than `ttlMs` before `now`. */
  expired: (now: number) => K[]
  delete: (key: K) => void
  has: (key: K) => boolean
  keys: () => IterableIterator<K>
}

/**
 * Keys that stay alive while their owner renews them, for example a remote source with a heartbeat, or a tab that
 * repeats its announcement. The caller decides when to call `expired`, usually from a periodic tick.
 *
 * @example
 * const leases = createLeaseTable<string>({ ttlMs: 12_000 })
 * leases.touch('tab-1', now)
 * for (const tab of leases.expired(later))
 *   forgetTab(tab)
 */
export function createLeaseTable<K>(options: LeaseTableOptions): LeaseTable<K> {
  const touchedAt = new Map<K, number>()

  return {
    touch(key, now) {
      touchedAt.set(key, now)
    },
    expired(now) {
      const keys: K[] = []
      for (const [key, at] of touchedAt) {
        if (now - at > options.ttlMs)
          keys.push(key)
      }
      for (const key of keys)
        touchedAt.delete(key)
      return keys
    },
    delete(key) {
      touchedAt.delete(key)
    },
    has: key => touchedAt.has(key),
    keys: () => touchedAt.keys(),
  }
}
