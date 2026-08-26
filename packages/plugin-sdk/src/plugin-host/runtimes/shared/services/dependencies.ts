import type { CapabilityDescriptor } from '../../../../plugin/apis/protocol'

/**
 * Tracks capability lifecycle state and waits for readiness across extension sessions.
 *
 * Use when:
 * - The host needs to announce, ready, degrade, or withdraw named capabilities
 * - Plugins need to wait for another capability before continuing startup
 *
 * Expects:
 * - Capability keys are stable across lifecycle transitions
 *
 * Returns:
 * - An in-memory dependency registry with snapshot and wait primitives
 */
export class DependencyService {
  private readonly capabilities = new Map<string, CapabilityDescriptor>()
  private readonly capabilityWaiters = new Map<string, Set<(descriptor: CapabilityDescriptor) => void>>()

  announce(key: string, metadata?: Record<string, unknown>) {
    const current = this.capabilities.get(key)
    const descriptor: CapabilityDescriptor = {
      key,
      metadata: metadata ?? current?.metadata,
      state: 'announced',
      updatedAt: Date.now(),
    }

    this.capabilities.set(key, descriptor)
    return descriptor
  }

  isReady(key: string) {
    return this.capabilities.get(key)?.state === 'ready'
  }

  list() {
    return [...this.capabilities.values()]
  }

  markDegraded(key: string, metadata?: Record<string, unknown>) {
    const current = this.capabilities.get(key)
    const descriptor: CapabilityDescriptor = {
      key,
      metadata: metadata ?? current?.metadata,
      state: 'degraded',
      updatedAt: Date.now(),
    }

    this.capabilities.set(key, descriptor)
    return descriptor
  }

  markReady(key: string, metadata?: Record<string, unknown>) {
    const current = this.capabilities.get(key)
    const descriptor: CapabilityDescriptor = {
      key,
      metadata: metadata ?? current?.metadata,
      state: 'ready',
      updatedAt: Date.now(),
    }

    this.capabilities.set(key, descriptor)
    const waiters = this.capabilityWaiters.get(key)
    if (waiters) {
      for (const resolve of waiters) {
        resolve(descriptor)
      }
      this.capabilityWaiters.delete(key)
    }

    return descriptor
  }

  async waitFor(key: string, timeoutMs: number = 15000) {
    const existing = this.capabilities.get(key)
    if (existing?.state === 'ready') {
      return existing
    }

    return await new Promise<CapabilityDescriptor>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      const onReady = (descriptor: CapabilityDescriptor) => {
        if (timeout) {
          clearTimeout(timeout)
        }
        resolve(descriptor)
      }

      const waiters = this.capabilityWaiters.get(key) ?? new Set()
      waiters.add(onReady)
      this.capabilityWaiters.set(key, waiters)

      timeout = setTimeout(() => {
        const currentWaiters = this.capabilityWaiters.get(key)
        currentWaiters?.delete(onReady)
        if (currentWaiters && currentWaiters.size === 0) {
          this.capabilityWaiters.delete(key)
        }
        reject(new Error(`Capability \`${key}\` is not ready after ${timeoutMs}ms.`))
      }, timeoutMs)
    })
  }

  async waitForMany(keys: string[], timeoutMs: number = 15000) {
    await Promise.all(keys.map(async key => await this.waitFor(key, timeoutMs)))
  }

  withdraw(key: string, metadata?: Record<string, unknown>) {
    const current = this.capabilities.get(key)
    const descriptor: CapabilityDescriptor = {
      key,
      metadata: metadata ?? current?.metadata,
      state: 'withdrawn',
      updatedAt: Date.now(),
    }

    this.capabilities.set(key, descriptor)
    return descriptor
  }
}
