import type { CapabilityDescriptor } from '../../../../plugin/apis/protocol'

export class DependencyService {
  private readonly capabilities = new Map<string, CapabilityDescriptor>()
  private readonly capabilityWaiters = new Map<string, Set<(descriptor: CapabilityDescriptor) => void>>()

  announce(key: string, metadata?: Record<string, unknown>) {
    const current = this.capabilities.get(key)
    const descriptor: CapabilityDescriptor = {
      key,
      state: 'announced',
      metadata: metadata ?? current?.metadata,
      updatedAt: Date.now(),
    }

    this.capabilities.set(key, descriptor)
    return descriptor
  }

  markReady(key: string, metadata?: Record<string, unknown>) {
    const current = this.capabilities.get(key)
    const descriptor: CapabilityDescriptor = {
      key,
      state: 'ready',
      metadata: metadata ?? current?.metadata,
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

  markDegraded(key: string, metadata?: Record<string, unknown>) {
    const current = this.capabilities.get(key)
    const descriptor: CapabilityDescriptor = {
      key,
      state: 'degraded',
      metadata: metadata ?? current?.metadata,
      updatedAt: Date.now(),
    }

    this.capabilities.set(key, descriptor)
    return descriptor
  }

  withdraw(key: string, metadata?: Record<string, unknown>) {
    const current = this.capabilities.get(key)
    const descriptor: CapabilityDescriptor = {
      key,
      state: 'withdrawn',
      metadata: metadata ?? current?.metadata,
      updatedAt: Date.now(),
    }

    this.capabilities.set(key, descriptor)
    return descriptor
  }

  list() {
    return [...this.capabilities.values()]
  }

  isReady(key: string) {
    return this.capabilities.get(key)?.state === 'ready'
  }

  async waitForMany(keys: string[], timeoutMs: number = 15000) {
    await Promise.all(keys.map(async key => await this.waitFor(key, timeoutMs)))
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
}
