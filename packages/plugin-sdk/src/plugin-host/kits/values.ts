import type { Container } from 'injeca'

import type { KitProviderInfo, KitStatus } from '../../kit/references'
import type { KitSnapshot } from '../bridge/ports'

import { DisposableStore } from '../../extension/disposable'

/** Graph key names of the plugin host. A plugin never sees them. */
export const pluginNodeKeys = Object.freeze({
  package: 'package',
  compat: 'compat',
  runtime: 'runtime',
  session: 'session',
})

/** The provider id of a Host Kit in a provider key. */
export const hostProviderId = 'host'

/**
 * The selection service of a Kit for one version range. Consumers depend on it.
 *
 * @example
 * kitSelectionKey('airi.memory-backend', '^1') // => 'kit:airi.memory-backend#^1'
 */
export function kitSelectionKey(kitId: string, range: string): string {
  return `kit:${kitId}#${range}`
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

/** The consumer scope that a provider connects a client for. */
export interface KitConnectScope {
  /** The consumer container. Host Kit listeners register in it. */
  readonly container: Container
  /** The subscriptions of the client. They end when the client moves to another provider or the consumer scope ends. */
  readonly subscriptions: DisposableStore
}

declare const providerValueBrand: unique symbol

/**
 * The value of one Kit provider service.
 *
 * A provider is one service for all consumers. The `perConsumer` selection service connects a client for each caller.
 */
export interface KitProviderValue {
  readonly [providerValueBrand]?: true
  readonly kitId: string
  readonly version: string
  readonly provider: KitProviderInfo
  readonly instanceId: string
  /** Creates a client for one caller. A descriptor-only Host Kit gives `undefined`. */
  readonly connect: (caller: KitCaller, scope: KitConnectScope) => unknown
}

/** Creates the value of a Kit provider service. */
export function createKitProviderValue(value: Omit<KitProviderValue, typeof providerValueBrand>): KitProviderValue {
  return Object.freeze({ ...value })
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
  private subscriptions = new DisposableStore()
  private readonly listeners = new Set<() => void>()

  /** The stable client of the consumer. It forwards to the current provider. */
  readonly client: unknown

  /** `key` is the selection key that the consumer depends on, and `container` is the consumer container. */
  constructor(readonly key: string, value: KitProviderValue, private readonly caller: KitCaller, private readonly container: Container) {
    this.current = value
    this.currentClient = value.connect(caller, { container, subscriptions: this.subscriptions })
    this.client = new Proxy(Object.freeze({}), {
      get: (_target, property) => {
        // A disposed selection keeps its last target, so cleanup code that runs after the scope can still close its resources.
        if (property === 'then')
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

  /** Moves the selection to another provider instance. The subscriptions of the old client end. */
  move(next: KitProviderValue): void {
    const previous = this.subscriptions
    this.subscriptions = new DisposableStore()
    this.current = next
    this.currentClient = next.connect(this.caller, { container: this.container, subscriptions: this.subscriptions })
    this.notify()
    // A subscription of the old client that fails to end does not undo the move.
    void previous.dispose().catch(() => undefined)
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

  /** Ends the listeners and the subscriptions of the current client. */
  async dispose(): Promise<void> {
    this.listeners.clear()
    await this.subscriptions.dispose()
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
