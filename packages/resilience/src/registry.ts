import type { IPolicy } from 'cockatiel'

/**
 * BreakerRegistry holds every policy by string key so multiple call sites
 * can share the same open/closed state. Pass the default instance to
 * `resilientFetch` / `withRetryAndTimeout` to keep breakers across the
 * app in sync.
 */
export class BreakerRegistry {
  private readonly policies = new Map<string, IPolicy>()

  get<T extends IPolicy = IPolicy>(key: string): T | undefined {
    return this.policies.get(key) as T | undefined
  }

  has(key: string): boolean {
    return this.policies.has(key)
  }

  set<T extends IPolicy>(key: string, policy: T): T {
    this.policies.set(key, policy)
    return policy
  }

  delete(key: string): boolean {
    return this.policies.delete(key)
  }

  async shutdownAll(): Promise<void> {
    for (const policy of this.policies.values()) {
      if ('shutdown' in policy && typeof policy.shutdown === 'function')
        await (policy as { shutdown: () => Promise<void> | void }).shutdown()
    }
    this.policies.clear()
  }
}

/** Single app-wide registry — breakers created from `resilientFetch` use it. */
export const sharedBreakerRegistry = new BreakerRegistry()
