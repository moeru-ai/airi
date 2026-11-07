import type { Container, FallbackDependency, OwnerRecord, ProvideOptionObject, ProvideOptionWithKeys, Registration } from 'injeca'

import type { KitRef } from '../../kit'
import type { NormalizedKitUse } from '../../kit/references'
import type { KitDescriptorSnapshot } from '../shared/kits'
import type { HostKitSource, KitRegistration, PluginRuntime } from '../shared/types'
import type { KitCaller, KitProviderValue } from './values'

import semver from 'semver'

import { defineKey, firstAvailable, listen, optional, provide, where } from 'injeca'

import { captureHostClientFactory, captureHostDescriptor, KitProviderRegistrationError } from '../kit-capture'
import {
  createKitProviderValue,
  hostProviderId,
  kitProviderKey,
  kitSelectionKey,
  SelectedKit,
} from './values'

/** Decides whether a consumer can use a Kit. It throws `KitUnavailableError` when it cannot. */
export type KitAccessCheck = (consumer: OwnerRecord | undefined, kitId: string) => Promise<void>

interface HostKitRecord {
  readonly registration: Registration<string, KitProviderValue, undefined>
  readonly version: string
  descriptor?: KitDescriptorSnapshot
  api?: KitRef<unknown>
}

interface ProviderRecord {
  readonly id: string
  version: string
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
 * Owns the Kit services of the plugin host container: the Host Kit providers and the selection services of each Kit.
 *
 * - A Host Kit is one service on `kit:<id>@host`. Its value connects a client for each caller.
 * - Each provider of a Kit has its own key, so two providers of one Kit do not conflict.
 * - The selection service `kit:<id>#<range>` uses `where(firstAvailable(...), range)` over the providers in the configured order.
 *   So the first available provider with a version in the range serves.
 * - A selection service is `perConsumer`. Its build checks the permissions of the consumer and connects the client with the caller identity.
 */
export class KitGraph {
  private readonly hostKits = new Map<string, HostKitRecord>()
  /** The providers of each Kit. */
  private readonly providers = new Map<string, ProviderRecord[]>()
  /** The selection service of each Kit and range. A range in use before the first provider has no service yet. */
  private readonly selections = new Map<string, Map<string, Registration<string, SelectedKit, undefined> | undefined>>()
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
    this.addProvider(kitId, hostProviderId, version)

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
      metadata: Object.freeze({
        kind: 'kit',
        kitId,
        version,
        provider: Object.freeze({ kind: 'host', id: hostProviderId }),
        ...(descriptor ? { descriptor } : {}),
      }),
      build: ({ instanceId }) => createKitProviderValue({
        kitId,
        version,
        provider: { kind: 'host', id: hostProviderId },
        instanceId,
        connect: (caller, { container, subscriptions }) => api
          ? Reflect.apply(api.createClient, undefined, [{
              extensionId: caller.extensionId,
              sessionId: caller.sessionId,
              moduleId: caller.moduleId,
              subscriptions,
              listen: <THandler extends (...args: never[]) => unknown>(event: { readonly id: string }, handler: THandler, metadata?: Readonly<Record<string, unknown>>) => listen(container, event, handler, metadata),
            }])
          : undefined,
      }),
    }
  }

  /**
   * Adds one provider of a Kit, or changes its version. It replaces each selection service of the Kit.
   * The consumers of a selection move to the new instance with `dependency-change`.
   */
  addProvider(kitId: string, providerId: string, version: string): void {
    const providers = this.providers.get(kitId) ?? []
    this.providers.set(kitId, providers)
    const known = providers.find(provider => provider.id === providerId)
    if (known?.version === version)
      return
    if (known)
      known.version = version
    else
      providers.push({ id: providerId, version })
    this.replaceSelections(kitId)
  }

  /** Sets the provider order of a Kit. The first available provider in the order serves. Providers not in the order follow. */
  setProviderOrder(kitId: string, order: readonly string[]): void {
    this.providerOrder.set(kitId, [...order])
    this.replaceSelections(kitId)
  }

  /** The provider ids of a Kit in selection order. */
  orderedProviders(kitId: string): readonly string[] {
    const providers = (this.providers.get(kitId) ?? []).map(provider => provider.id)
    const order = this.providerOrder.get(kitId) ?? []
    const ordered = order.filter(id => providers.includes(id))
    // The Host Kit comes first by default. The configured order can put a plugin first.
    const rest = providers.filter(id => !ordered.includes(id)).sort((left, right) => Number(right === hostProviderId) - Number(left === hostProviderId))
    return [...ordered, ...rest]
  }

  /**
   * The selection key of a Kit and a range. It registers the selection service on the first use of the range.
   * A Kit without providers gets the service with its first provider, so its consumers wait with a missing provider until then.
   */
  selectionOf(kitId: string, range: string): string {
    let byRange = this.selections.get(kitId)
    if (!byRange) {
      byRange = new Map()
      this.selections.set(kitId, byRange)
    }
    if (!byRange.has(range))
      byRange.set(range, undefined)
    if (byRange.get(range) === undefined && (this.providers.get(kitId)?.length ?? 0) > 0)
      byRange.set(range, provide(this.container, defineKey<SelectedKit>(kitSelectionKey(kitId, range)), this.selectionOption(kitId, range)))
    return kitSelectionKey(kitId, range)
  }

  /**
   * The provider versions of a Kit when none is in the range, for the `incompatible-version` detail.
   * It is `undefined` when the Kit has no provider, or when a provider is in the range.
   */
  incompatibleProviders(kitId: string, range: string): readonly { id: string, version: string }[] | undefined {
    const providers = this.providers.get(kitId) ?? []
    if (providers.length === 0 || providers.some(provider => satisfies(provider.version, range)))
      return undefined
    return providers.map(provider => ({ ...provider }))
  }

  /** The selection keys of a Kit, one for each range in use. */
  selectionKeysOf(kitId: string): readonly string[] {
    return [...this.selections.get(kitId)?.keys() ?? []].map(range => kitSelectionKey(kitId, range))
  }

  private replaceSelections(kitId: string): void {
    for (const [range, registration] of this.selections.get(kitId) ?? []) {
      if (registration)
        void registration.replace(this.selectionOption(kitId, range)).catch(() => undefined)
      else
        this.selectionOf(kitId, range)
    }
  }

  private selectionOption(kitId: string, range: string): ProvideOptionWithKeys<SelectedKit, { provider: FallbackDependency<KitProviderValue> }> {
    const key = kitSelectionKey(kitId, range)
    const candidates = this.orderedProviders(kitId).map(providerId => defineKey<KitProviderValue>(kitProviderKey(kitId, providerId)))
    return {
      perConsumer: true,
      metadata: Object.freeze({ kind: 'kit-selection', kitId, range }),
      dependsOn: { provider: where(firstAvailable(...candidates), ({ metadata }) => typeof metadata.version === 'string' && satisfies(metadata.version, range)) },
      build: async ({ dependsOn, consumer, container, on, effect }) => {
        await this.checkAccess(consumer, kitId)
        const selected = new SelectedKit(key, dependsOn.provider, callerOf(consumer), container)
        // The selection moves in place, so each holder of its stable client, for example `resolveKit()` or plugin code, follows the new provider.
        on('dependency-change', async ({ dependsOn: current, decide }) => {
          const next = current.provider.value
          try {
            await this.checkAccess(consumer, kitId)
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

  /** The `dependsOn` entry of one Kit use: the selection service of its range. */
  dependencyOf(use: NormalizedKitUse) {
    const key = this.selectionOf(use.id, use.range)
    return use.optional ? optional(key) : key
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
