import type { Container, Registration, ServiceStatus, SetStatusOptions } from 'injeca'

import type { CapabilityDescriptor } from '../plugin/apis/protocol'

import { provide, waitFor } from 'injeca'

import { capabilityKey } from './kits/values'

interface CapabilityRecord {
  registration?: Registration<string, string, undefined>
  setStatus?: (status: ServiceStatus, reasonOrOptions?: string | SetStatusOptions) => void
  descriptor: CapabilityDescriptor
}

const statusOfState: Readonly<Record<'announced' | 'ready' | 'degraded', ServiceStatus>> = {
  announced: 'unavailable',
  ready: 'ready',
  degraded: 'degraded',
}

/**
 * Keeps each Host capability as one service in the plugin host container.
 *
 * - `announced` is a running service with the status `unavailable`.
 * - `ready` and `degraded` are statuses of that service.
 * - `withdrawn` withdraws the service.
 *
 * injeca freezes registration metadata, so this class keeps the latest metadata of each capability.
 */
export class CapabilityRegistry {
  private readonly records = new Map<string, CapabilityRecord>()

  constructor(private readonly container: Container) {}

  private transition(key: string, state: CapabilityDescriptor['state'], metadata?: Record<string, unknown>): CapabilityDescriptor {
    const current = this.records.get(key)
    const descriptor: CapabilityDescriptor = {
      key,
      state,
      metadata: metadata ?? current?.descriptor.metadata,
      updatedAt: Date.now(),
    }

    if (state === 'withdrawn') {
      if (current) {
        void current.registration?.withdraw()
        this.records.set(key, { descriptor })
      }
      else {
        this.records.set(key, { descriptor })
      }
      return descriptor
    }

    const status = statusOfState[state]
    if (current?.registration && current.setStatus) {
      current.descriptor = descriptor
      current.setStatus(status, { reason: state })
      return descriptor
    }

    const record: CapabilityRecord = { descriptor }
    this.records.set(key, record)
    record.registration = provide(this.container, capabilityKey(key), {
      metadata: { kind: 'capability', key },
      build: ({ setStatus }) => {
        record.setStatus = setStatus
        setStatus(statusOfState[record.descriptor.state as keyof typeof statusOfState] ?? status, { reason: record.descriptor.state })
        return key
      },
    })
    return descriptor
  }

  announce(key: string, metadata?: Record<string, unknown>): CapabilityDescriptor {
    return this.transition(key, 'announced', metadata)
  }

  markReady(key: string, metadata?: Record<string, unknown>): CapabilityDescriptor {
    return this.transition(key, 'ready', metadata)
  }

  markDegraded(key: string, metadata?: Record<string, unknown>): CapabilityDescriptor {
    return this.transition(key, 'degraded', metadata)
  }

  withdraw(key: string, metadata?: Record<string, unknown>): CapabilityDescriptor {
    return this.transition(key, 'withdrawn', metadata)
  }

  list(): CapabilityDescriptor[] {
    return [...this.records.values()].map(record => record.descriptor)
  }

  isReady(key: string): boolean {
    return this.records.get(key)?.descriptor.state === 'ready'
  }

  async waitFor(key: string, timeoutMs: number): Promise<CapabilityDescriptor> {
    try {
      await waitFor(this.container, capabilityKey(key), { status: 'ready', timeoutMs })
    }
    catch (error) {
      throw new Error(`Capability \`${key}\` is not ready after ${timeoutMs}ms.`, { cause: error })
    }
    return this.records.get(key)!.descriptor
  }
}
