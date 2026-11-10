export interface CooldownOptions {
  /** The shortest time between two successful acquires of one key. */
  readonly ms: number
}

export interface Cooldown {
  /** Returns true and starts a new window when the window of `key` has passed. Returns false inside the window. */
  tryAcquire: (key: string, now: number) => boolean
}

/**
 * Limits an action to once per window for each key, for example one flight recorder dump per source.
 *
 * The cooldown keeps one time for each key that it has seen.
 *
 * @example
 * const cooldown = createCooldown({ ms: 30_000 })
 * if (cooldown.tryAcquire(source, now))
 *   dump()
 */
export function createCooldown(options: CooldownOptions): Cooldown {
  const acquiredAt = new Map<string, number>()

  return {
    tryAcquire(key, now) {
      const last = acquiredAt.get(key)
      if (last !== undefined && now - last < options.ms)
        return false
      acquiredAt.set(key, now)
      return true
    },
  }
}
