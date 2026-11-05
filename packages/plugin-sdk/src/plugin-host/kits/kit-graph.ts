import type { Container, FallbackDependency, OwnerRecord, ProvideOptionObject, ProvideOptionWithKeys, Registration } from 'injeca'

import type { KitRef } from '../../kit'
import type { NormalizedKitUse } from '../../kit/references'
import type { KitDescriptorSnapshot } from '../shared/kits'
import type { HostKitSource, KitRegistration, PluginRuntime } from '../shared/types'
import type { KitCaller, KitProviderValue } from './values'

import semver from 'semver'

import { defineKey, firstAvailable, listen, optional, provide, where } from 'injeca'

import { DisposableStore } from '../../extension/disposable'
import { captureHostClientFactory, captureHostDescriptor, KitProviderRegistrationError } from '../kit-capture'
import {
  createKitProviderValue,
  hostProviderId,
  kitProviderKey,
  kitSelectionKey,
  SelectedKit,
  selectionProvidersOf,
} from './values'

/** Decides whether a consumer can use a provider. It throws `KitUnavailableError` when it cannot. */
export type KitAccessCheck = (consumer: OwnerRecord | undefined, kitId: string, provider: KitProviderValue) => Promise<void>

interface HostKitRecord {
  readonly registration: Registration<string, KitProviderValue, undefined>
  readonly version: string
  descriptor?: KitDescriptorSnapshot
  api?: KitRef<unknown>
}

interface SelectionRecord {
  registration: Registration<string, SelectedKit, undefined>
  readonly providers: { id: string, version: string }[]
}

/** Reads the caller identity from the owner record of a consumer container. */
export function callerOf(owner: OwnerRecord | undefined): KitCaller {
  if (owner?.kind === 'plugin' || owner?.kind === 'module') {
    return Object.freeze({
      extensionId: String(owner.pluginId),
      sessionId: String(owner.sessionId),
      ...(owner.kind === 'module' ? { moduleId: String(owner.moduleId) } : {}),
    })
  }
  return Object.freeze({ extensionId: hostProviderId, sessionId: hostProviderId })
}

function satisfies(version: string, range: string): boolean {
  return semver.satisfies(version, range, { includePrerelease: true })
}

/**
 * Owns the Kit services of the plugin host container: the Host Kit providers and the selection service of each Kit.
 *
 * - A Host Kit is a `perConsumer` service on `kit:<id>@host`. Its build creates the client with the caller identity.
 * - Each provider of a Kit has its own key, so two providers of one Kit do not conflict.
 * - The selection service `kit:<id>` uses `firstAvailable` over the providers in the configured order.
 *   It is `perConsumer`, so its build checks the permissions and the version range of each consumer.
 */
export class KitGraph {
  private readonly hostKits = new Map<string, HostKitRecord>()
  private readonly selections = new Map<string, SelectionRecord>()
  private readonly providerOrder = new Map<string, readonly string[]>()

  constructor(
    private readonly container: Container,
    private readonly checkAccess: KitAccessCheck,
    providerOrder: Readonly<Record<string, readonly string[]>> = {},
  ) {
    for (const [kitId, order] of Object.entries(providerOrder))
      this.providerOrder.set(kitId, order)
  }

  /**
   * Registers one Host Kit. The descriptor and the API must have the same id and version.
   * A second registration of one Kit id fails with `provider-slot-conflict`.
   */
  provideHostKit(source: HostKitSource): KitRegistration {
    const descriptor = source.descriptor === undefined ? undefined : captureHostDescriptor(source.descriptor)
    const api = source.api === undefined ? undefined : captureHostClientFactory(source.api)
    if (!descriptor && !api)
      throw new KitProviderRegistrationError('invalid-host-source', '')
    const kitId = descriptor?.kitId ?? api!.id
    const version = descriptor?.version ?? api!.version
    if (descriptor && api && (descriptor.kitId !== api.id || descriptor.version !== api.version))
      throw new KitProviderRegistrationError('invalid-host-source', kitId, undefined, undefined, { sourceKind: 'client-factory' })
    if (this.hostKits.has(kitId))
      throw new KitProviderRegistrationError('provider-slot-conflict', kitId, undefined, undefined, { sourceKind: descriptor ? 'descriptor' : 'client-factory' })

    const registration = provide(this.container, defineKey<KitProviderValue>(kitProviderKey(kitId, hostProviderId)), this.hostKitOption(kitId, version, descriptor, api))
    const record: HostKitRecord = { registration, version, descriptor, api }
    this.hostKits.set(kitId, record)
    this.ensureSelection(kitId, hostProviderId, version)

    return Object.freeze({
      kitId,
      version,
      descriptor,
      withdraw: async () => {
        if (this.hostKits.get(kitId) !== record)
          return false
        this.hostKits.delete(kitId)
        return await registration.withdraw()
      },
      replace: async (next: HostKitSource) => {
        if (this.hostKits.get(kitId) !== record)
          return false
        const nextDescriptor = next.descriptor === undefined ? record.descriptor : captureHostDescriptor(next.descriptor)
        const nextApi = next.api === undefined ? record.api : captureHostClientFactory(next.api)
        const nextVersion = nextDescriptor?.version ?? nextApi?.version ?? version
        if (nextVersion !== version)
          throw new KitProviderRegistrationError('kit-version-mismatch', kitId)
        record.descriptor = nextDescriptor
        record.api = nextApi
        return await registration.replace(this.hostKitOption(kitId, version, nextDescriptor, nextApi))
      },
    })
  }

  private hostKitOption(kitId: string, version: string, descriptor: KitDescriptorSnapshot | undefined, api: KitRef<unknown> | undefined): ProvideOptionObject<KitProviderValue, undefined> {
    return {
      perConsumer: true,
      metadata: Object.freeze({
        kind: 'kit',
        kitId,
        version,
        provider: Object.freeze({ kind: 'host', id: hostProviderId }),
        ...(descriptor ? { descriptor } : {}),
      }),
      build: ({ consumer, container, effect, instanceId }) => {
        const caller = callerOf(consumer)
        const subscriptions = new DisposableStore()
        effect(() => () => subscriptions.dispose())
        const client: unknown = api
          ? Reflect.apply(api.createClient, undefined, [{
              extensionId: caller.extensionId,
              sessionId: caller.sessionId,
              moduleId: caller.moduleId,
              subscriptions,
              listen: <THandler extends (...args: never[]) => unknown>(event: { readonly id: string }, handler: THandler, metadata?: Readonly<Record<string, unknown>>) => listen(container, event, handler, metadata),
            }])
          : undefined
        return createKitProviderValue({ kitId, version, provider: { kind: 'host', id: hostProviderId }, instanceId, client })
      },
    }
  }

  /**
   * Adds one provider to the selection service of a Kit. It creates the selection service on the first provider.
   * A new provider replaces the selection service, so its consumers move with `dependency-change`.
   */
  ensureSelection(kitId: string, providerId: string, version: string): void {
    const existing = this.selections.get(kitId)
    if (existing) {
      const known = existing.providers.find(provider => provider.id === providerId)
      if (known?.version === version)
        return
      if (known)
        known.version = version
      else
        existing.providers.push({ id: providerId, version })
      void existing.registration.replace(this.selectionOption(kitId, existing.providers)).catch(() => undefined)
      return
    }

    const providers = [{ id: providerId, version }]
    const registration = provide(this.container, defineKey<SelectedKit>(kitSelectionKey(kitId)), this.selectionOption(kitId, providers))
    this.selections.set(kitId, { registration, providers })
  }

  /** Sets the provider order of a Kit. The first available provider in the order serves. Providers not in the order follow. */
  setProviderOrder(kitId: string, order: readonly string[]): void {
    this.providerOrder.set(kitId, [...order])
    const existing = this.selections.get(kitId)
    if (existing)
      void existing.registration.replace(this.selectionOption(kitId, existing.providers)).catch(() => undefined)
  }

  /** The provider ids of a Kit in selection order. */
  orderedProviders(kitId: string, known?: readonly { id: string }[]): readonly string[] {
    const providers = (known ?? this.selections.get(kitId)?.providers ?? []).map(provider => provider.id)
    const order = this.providerOrder.get(kitId) ?? []
    const ordered = order.filter(id => providers.includes(id))
    // The Host Kit comes first by default. The configured order can put a plugin first.
    const rest = providers.filter(id => !ordered.includes(id)).sort((left, right) => Number(right === hostProviderId) - Number(left === hostProviderId))
    return [...ordered, ...rest]
  }

  private selectionOption(kitId: string, providers: readonly { id: string, version: string }[]): ProvideOptionWithKeys<SelectedKit, { provider: FallbackDependency<KitProviderValue> }> {
    const keys = this.orderedProviders(kitId, providers).map(providerId => defineKey<KitProviderValue>(kitProviderKey(kitId, providerId)))
    return {
      perConsumer: true,
      metadata: Object.freeze({
        kind: 'kit-selection',
        kitId,
        providers: Object.freeze(providers.map(provider => Object.freeze({ ...provider }))),
      }),
      dependsOn: { provider: firstAvailable(...keys) },
      build: async ({ dependsOn, consumer, on, effect }) => {
        await this.checkAccess(consumer, kitId, dependsOn.provider)
        const selected = new SelectedKit(dependsOn.provider, callerOf(consumer))
        on('dependency-change', async ({ dependsOn: current, decide }) => {
          const next = current.provider.value
          try {
            await this.checkAccess(consumer, kitId, next)
          }
          catch (error) {
            return decide.fail(error)
          }
          selected.move(next)
          return decide.handled()
        })
        on('dependency-status-change', ({ decide }) => {
          selected.notify()
          return decide.handled()
        })
        effect(() => () => selected.dispose())
        return selected
      },
    }
  }

  /**
   * The `dependsOn` entry of one Kit use.
   * The condition keeps a selection service only when one of its providers has a version in the range.
   * The selection build checks the version of the selected provider again.
   */
  dependencyOf(use: NormalizedKitUse) {
    const condition = ({ metadata }: { metadata: Readonly<Record<string, unknown>> }) => selectionProvidersOf(metadata).some(provider => satisfies(provider.version, use.range))
    const conditional = where(kitSelectionKey(use.id), condition)
    return use.optional ? optional(conditional) : conditional
  }

  hasSelection(kitId: string): boolean {
    return this.selections.has(kitId)
  }

  getHostDescriptor(kitId: string): KitDescriptorSnapshot | undefined {
    return this.hostKits.get(kitId)?.descriptor
  }

  listHostDescriptors(runtime?: PluginRuntime): readonly KitDescriptorSnapshot[] {
    return [...this.hostKits.values()].flatMap(record => record.descriptor && (!runtime || record.descriptor.runtimes.includes(runtime)) ? [record.descriptor] : [])
  }

  /** The Host Kits as `{ id, version }`. */
  listHostKits(): readonly { id: string, version: string }[] {
    return [...this.hostKits.entries()].map(([id, record]) => ({ id, version: record.version }))
  }
}
