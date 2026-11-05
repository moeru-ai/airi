import type { KitProviderInfo, KitStatus } from '../../kit/references'
import type { KitSnapshot } from '../bridge/ports'

/** Graph key names of the plugin host. A plugin never sees them. */
export const pluginNodeKeys = Object.freeze({
  package: 'package',
  compat: 'compat',
  runtime: 'runtime',
  session: 'session',
})

/** The provider id of a Host Kit in a provider key. */
export const hostProviderId = 'host'

/** The selection service of a Kit. Consumers depend on it. */
export function kitSelectionKey(kitId: string): string {
  return `kit:${kitId}`
}

/** The key of one provider of a Kit, for example `kit:airi.memory-backend@host`. */
export function kitProviderKey(kitId: string, providerId: string): string {
  return `kit:${kitId}@${providerId}`
}

/** The key of one dynamic module of a plugin. */
export function moduleNodeKey(moduleId: string): string {
  return `module:${moduleId}`
}

/** The key of one Host capability. */
export function capabilityKey(key: string): string {
  return `capability:${key}`
}

/** The identity of the scope that uses a Kit. The Host injects it into each call. */
export interface KitCaller {
  readonly extensionId: string
  readonly sessionId: string
  readonly moduleId?: string
}

declare const providerValueBrand: unique symbol

/**
 * The value of one Kit provider service.
 *
 * A Host Kit is a `perConsumer` service, so its value already has a client for the consumer.
 * A plugin Kit is one proxy service, so its value connects a client for each caller.
 */
export interface KitProviderValue {
  readonly [providerValueBrand]?: true
  readonly kitId: string
  readonly version: string
  readonly provider: KitProviderInfo
  readonly instanceId: string
  /** The client of a Host Kit for the consumer. `undefined` for a descriptor-only Host Kit. */
  readonly client?: unknown
  /** Creates a client of a plugin Kit for one caller. */
  readonly connect?: (caller: KitCaller) => unknown
}

/** Creates the value of a Kit provider service. */
export function createKitProviderValue(value: Omit<KitProviderValue, typeof providerValueBrand>): KitProviderValue {
  return Object.freeze({ ...value })
}

function clientFor(value: KitProviderValue, caller: KitCaller): unknown {
  return value.connect ? value.connect(caller) : value.client
}

/**
 * The value of one selection service instance: the Kit that one consumer scope uses now.
 *
 * The selection moves to another provider in place when its provider changes, so the consumer keeps one stable client.
 * `client` forwards each property read to the client of the current provider.
 */
export class SelectedKit {
  private current: KitProviderValue
  private currentClient: unknown
  private disposed = false
  private readonly listeners = new Set<() => void>()

  /** The stable client of the consumer. It forwards to the current provider. */
  readonly client: unknown

  constructor(value: KitProviderValue, private readonly caller: KitCaller) {
    this.current = value
    this.currentClient = clientFor(value, caller)
    this.client = new Proxy(Object.freeze({}), {
      get: (_target, property) => {
        if (property === 'then' || this.disposed)
          return undefined
        const target = this.currentClient
        if (target === null || (typeof target !== 'object' && typeof target !== 'function'))
          return undefined
        const member: unknown = Reflect.get(target, property)
        return typeof member === 'function' ? member.bind(target) : member
      },
      has: (_target, property) => {
        const target = this.currentClient
        return target !== null && (typeof target === 'object' || typeof target === 'function') && Reflect.has(target, property)
      },
    })
  }

  get kitId(): string {
    return this.current.kitId
  }

  get version(): string {
    return this.current.version
  }

  get provider(): KitProviderInfo {
    return this.current.provider
  }

  get instanceId(): string {
    return this.current.instanceId
  }

  /** The client of the current provider, without forwarding. */
  get target(): unknown {
    return this.currentClient
  }

  /** Moves the selection to another provider instance. */
  move(next: KitProviderValue): void {
    this.current = next
    this.currentClient = clientFor(next, this.caller)
    this.notify()
  }

  /** Calls each listener after a status change of the provider. */
  notify(): void {
    for (const listener of [...this.listeners])
      listener()
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
  }

  /** The snapshot that the plugin side gets. A direct runner gets the client value too. */
  snapshot(status: KitStatus, passValue: boolean): KitSnapshot {
    return Object.freeze({
      id: this.kitId,
      version: this.version,
      provider: this.provider,
      status,
      instanceId: this.instanceId,
      ...(passValue ? { value: this.client } : {}),
    })
  }
}

/** Reads the provider list from the metadata of a selection service. */
export function selectionProvidersOf(metadata: Readonly<Record<string, unknown>>): readonly { id: string, version: string }[] {
  const providers = metadata.providers
  return Array.isArray(providers) ? providers as readonly { id: string, version: string }[] : []
}
