import type { Container, GraphService, ObserveRecord, OwnerRecord } from 'injeca'

import type { Extension } from '../extension/shared'
import type { KitClientOf, KitReference } from '../kit/references'
import type { AnnounceBindingInput, UpdateBindingInput } from '../plugin/apis/client/bindings'
import type { CatalogSnapshot } from './bridge/ports'
import type { KitDependencyStore, KitGrantPolicy, KitGrantStore } from './kits/access'
import type { PluginRunner } from './runners/types'
import type { ExtensionSession, SessionHost } from './session'
import type { BindingRecord, KitCapabilityDescriptor, KitCapabilityDescriptorSnapshot, KitDescriptor, KitDescriptorSnapshot } from './shared'
import type {
  ExtensionHostContribution,
  ExtensionHostInstallContext,
  ExtensionHostOptions,
  ExtensionHostPermissionRequest,
  ExtensionManifestV2,
  ExtensionStartOptions,
  HostDataRecord,
  HostDataValue,
  HostKitSource,
  KitRegistration,
  ModulePermissionDeclaration,
  ModulePermissionGrant,
  PluginRuntime,
} from './shared/types'

import semver from 'semver'

import { errorMessageFrom } from '@moeru/std'
import { createContainer, createDefaultLogger, createNoopLogger, dispose, graph, observe, resolve, start, timeout } from 'injeca'
import { nanoid } from 'nanoid/non-secure'

import {
  getKitBindingResourceKey,
  pluginBindingApiActivateEventName,
  pluginBindingApiAnnounceEventName,
  pluginBindingApiUpdateEventName,
  pluginBindingApiWithdrawEventName,
} from '../plugin/apis/client/bindings'
import { protocolListProvidersEventName } from '../plugin/apis/protocol/resources/providers'
import { CapabilityRegistry } from './capabilities'
import { createMemoryKitDependencyStore, createMemoryKitGrantStore, denyAllKitGrants } from './kits/access'
import { KitGraph } from './kits/kit-graph'
import { hostProviderId, SelectedKit } from './kits/values'
import { createDirectRunner } from './runners/direct'
import { KitApiBindingRegistryService, PermissionService } from './runtimes/shared'
import { PluginSessionController } from './session'

export type { ExtensionModuleScope, ExtensionSession, ExtensionSessionPhase } from './session'

/** The number of observe records that `inspect()` keeps. */
const inspectEventLimit = 200

class PermissionDeniedError extends Error {
  readonly details: {
    area: 'apis' | 'resources' | 'capabilities' | 'processors' | 'pipelines'
    action: string
    key: string
  }

  constructor(details: PermissionDeniedError['details']) {
    super(`Permission denied: ${details.area}.${details.action} "${details.key}"`)
    this.name = 'PermissionDeniedError'
    this.details = details
  }
}

/**
 * Filters the binding list returned by `ExtensionHost.listBindings(...)`.
 *
 * Use when:
 * - Narrowing the host binding snapshot by owner session or kit
 *
 * Expects:
 * - Omitted fields mean "do not filter by this dimension"
 *
 * Returns:
 * - Optional filter criteria for the in-memory binding registry
 */
export interface ExtensionHostBindingListOptions {
  /** Limit results to bindings owned by one extension session. */
  ownerSessionId?: string
  /** Limit results to bindings declared against one kit. */
  kitId?: string
}

/** Options of `ExtensionHost.reload()`. */
/** The options of `stop()`. */
export interface ExtensionStopOptions {
  /**
   * The signal of the caller. Host code in an injeca cleanup of the session passes the signal of that cleanup.
   * injeca then warns and resolves the call at once, and the stop continues. Without it, such a call waits until the stop timeout.
   * When the signal aborts for another caller, the call stops waiting, and the stop continues.
   */
  signal?: AbortSignal
}

export interface ExtensionReloadOptions extends ExtensionStartOptions {
  /**
   * Starts the new session before the old session stops, so the consumers of its Kits move without a gap.
   * Use it only for a plugin whose setup has no outside effects that collide, for example fixed binding ids.
   * @default false
   */
  atomic?: boolean
}

/** A point-in-time view of one Kit provider. */
export interface ReadyKitProviderSnapshot {
  readonly id: string
  readonly version: string
  readonly exposure?: string
  /** The instance of the provider. A new instance means a restart of the provider. Host Kits build one client for each consumer, so they have none. */
  readonly instanceId?: string
  readonly owner: { readonly kind: 'host' } | { readonly kind: 'extension', readonly extensionId: string, readonly sessionId: string }
}

/** One record of the Host observe stream, with plain values only. */
export interface PluginHostEventRecord {
  readonly type: ObserveRecord['type']
  readonly key: string
  readonly owner: OwnerRecord
  readonly instanceId?: string
  readonly from?: string
  readonly to?: string
  readonly decision?: string
  readonly hook?: string
  /** The `stop()`, `dispose()`, or `withdraw()` call of a `wait-aborted` or `reentrant-call` record. */
  readonly call?: Extract<ObserveRecord, { type: 'reentrant-call' }>['call']
  /** The phase of the service when the wait of a `wait-aborted` record ended. */
  readonly phase?: string
  readonly reason?: string
  readonly error?: string
  readonly at: number
}

/** A read-only view of the plugin host graph. */
export interface PluginHostGraphSnapshot {
  readonly services: readonly GraphService[]
  readonly explanations: readonly { readonly sessionId: string, readonly extensionId: string, readonly lines: readonly string[] }[]
  readonly cycles: readonly (readonly string[])[]
  readonly events: readonly PluginHostEventRecord[]
}

type BoundAnnounceBindingInput<C extends HostDataRecord = HostDataRecord> = AnnounceBindingInput<C>
type BoundUpdateBindingInput<C extends HostDataRecord = HostDataRecord> = UpdateBindingInput<C>

function omitModuleId<C extends HostDataRecord>(input: BoundUpdateBindingInput<C>) {
  return {
    state: input.state,
    config: input.config,
  }
}

function cloneHostDataValue<T extends HostDataValue>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneHostDataValue(item)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneHostDataValue(item as HostDataValue)]),
    ) as T
  }

  return value
}

function cloneHostDataRecord<T extends HostDataRecord>(record: T): T {
  return cloneHostDataValue(record)
}

function cloneKitCapabilities(capabilities: readonly KitCapabilityDescriptorSnapshot[]): KitCapabilityDescriptor[] {
  return capabilities.map(capability => ({
    key: capability.key,
    actions: [...capability.actions],
  }))
}

function cloneKitDescriptor(kit: KitDescriptorSnapshot): KitDescriptor {
  return {
    kitId: kit.kitId,
    version: kit.version,
    runtimes: [...kit.runtimes],
    capabilities: cloneKitCapabilities(kit.capabilities),
  }
}

function cloneBindingRecord<C extends HostDataRecord>(module: BindingRecord<C>): BindingRecord<C> {
  return {
    ...module,
    config: cloneHostDataRecord(module.config),
  }
}

/** Removes the Kit permissions, which the protocol permission model does not have. */
function protocolPermissionsOf(manifest: ExtensionManifestV2): ModulePermissionDeclaration {
  const { kits: _kits, ...permissions } = manifest.permissions
  return permissions
}

/**
 * Tells whether a Kit provider service counts as a provider in the lists.
 * A Host Kit counts from its registration. A plugin Kit counts while it runs.
 */
function isListedProvider(service: GraphService): boolean {
  return (service.metadata.provider as { kind?: unknown } | undefined)?.kind === 'host' ? service.phase !== 'withdrawn' : service.phase === 'running'
}

function plainEvent(record: ObserveRecord): PluginHostEventRecord {
  const base = { type: record.type, key: record.key, owner: record.owner, instanceId: record.instanceId, reason: record.reason, at: Date.now() }
  switch (record.type) {
    case 'phase':
      return { ...base, from: record.from, to: record.to, decision: record.decision }
    case 'status':
      return { ...base, from: record.from, to: record.to }
    case 'decision':
      return { ...base, hook: record.hook, decision: record.decision }
    case 'timeout':
      return { ...base, hook: record.hook }
    case 'error':
      return { ...base, error: errorMessageFrom(record.error) ?? 'unknown error' }
    case 'wait-aborted':
      return { ...base, call: record.call, phase: record.phase, error: errorMessageFrom(record.abortReason) ?? 'unknown reason' }
    case 'reentrant-call':
      return { ...base, call: record.call }
    default:
      return base
  }
}

/**
 * Orchestrates plugin sessions, Kits, bindings, and capabilities on one injeca container.
 *
 * Use when:
 * - An app hosts AIRI plugins, for example the Electron main process
 * - Tests need one place to start, stop, reload, and query plugin sessions
 *
 * Expects:
 * - Plugins come from Manifest entrypoints or from loaded `defineExtension(...)` values
 * - Host Kits register through {@link ExtensionHost.provideKit}
 *
 * Returns:
 * - A host whose state is one injeca graph: Host Kits, Kit selections, capabilities, and one child container for each plugin session
 *
 * Call stack:
 *
 * caller
 *   -> {@link ExtensionHost.start}
 *     -> {@link PluginSessionController.install} (package, compat, runtime, session)
 *     -> {@link PluginSessionController.settled}
 */
export class ExtensionHost {
  /** The plugin host container. Host code, for example the harness runner, reads it. Plugins never see it. */
  readonly container: Container
  private readonly runtime: PluginRuntime
  private readonly runner: PluginRunner
  private readonly kitGraph: KitGraph
  private readonly capabilities: CapabilityRegistry
  private readonly sessions = new Map<string, PluginSessionController>()
  private readonly modules = new KitApiBindingRegistryService()
  private readonly permissions = new PermissionService()
  private readonly persistedPermissionGrants = new Map<string, ModulePermissionGrant>()
  private readonly airiVersion?: string
  private readonly permissionResolver?: ExtensionHostOptions['permissionResolver']
  private readonly grantPolicy: KitGrantPolicy
  private readonly grantStore: KitGrantStore
  private readonly dependencyStore: KitDependencyStore
  private readonly rebuildLimit: number
  private readonly events: PluginHostEventRecord[] = []
  private readonly installContext: ExtensionHostInstallContext
  private readonly sessionHost: SessionHost
  private catalogTimer?: ReturnType<typeof setTimeout>

  constructor(options: ExtensionHostOptions = {}) {
    this.runtime = options.runtime ?? 'electron'
    if (options.airiVersion && !semver.valid(options.airiVersion)) {
      throw new Error(`AIRI version must be a valid semantic version: ${options.airiVersion}`)
    }
    this.airiVersion = options.airiVersion
    this.permissionResolver = options.permissionResolver
    this.runner = options.runner ?? createDirectRunner()
    this.grantPolicy = options.kitGrantPolicy ?? denyAllKitGrants
    this.grantStore = options.kitGrantStore ?? createMemoryKitGrantStore()
    this.dependencyStore = options.kitDependencyStore ?? createMemoryKitDependencyStore()
    this.rebuildLimit = options.rebuildLimit ?? 5
    // NOTICE:
    // The Host turns off the lifecycle logs of injeca, but keeps its warnings: stop timeouts, re-entrant calls, and late cleanup failures.
    // `enabled: false` gives a no-op logger, so it also drops `warn`. The warnings go to the logger of the parent container, or to the default logger.
    // Source: injeca `createContainer` in src/primitives/container.ts.
    // Remove when injeca can turn off the lifecycle logs without the warnings.
    const warnings = options.container?.logger ?? createDefaultLogger()
    this.container = createContainer({
      parent: options.container,
      owner: { kind: 'plugin-host' },
      logger: { ...createNoopLogger(), warn: message => warnings.warn(message) },
      timeouts: { start: options.timeouts?.start ?? 30_000, stop: options.timeouts?.stop ?? 10_000 },
    })
    this.kitGraph = new KitGraph(this.container, (consumer, kitId) => this.checkKitAccess(consumer, kitId), options.kitProviderOrder)
    this.capabilities = new CapabilityRegistry(this.container)
    this.sessionHost = {
      container: this.container,
      kits: this.kitGraph,
      permissions: this.permissions,
      bindings: this.modules,
      grantPolicy: this.grantPolicy,
      grantStore: this.grantStore,
      dependencyStore: this.dependencyStore,
      rebuildLimit: this.rebuildLimit,
      assertCompatible: (manifest, runtime) => this.assertManifestCompatibility(manifest, runtime),
      catalogFor: session => this.catalogFor(session),
      changed: () => this.scheduleCatalogPush(),
      stopSession: async (sessionId, signal) => {
        await this.stop(sessionId, { signal })
      },
    }
    observe(this.container, (record) => {
      this.events.push(plainEvent(record))
      if (this.events.length > inspectEventLimit)
        this.events.splice(0, this.events.length - inspectEventLimit)
      if (record.type === 'phase' || record.type === 'status')
        this.scheduleCatalogPush()
    })
    void start(this.container).catch(() => undefined)

    this.markCapabilityReady(protocolListProvidersEventName, { source: 'plugin-host' })
    this.installContext = this.createInstallContext()
    for (const contribution of options.contributions ?? []) {
      this.installContribution(contribution)
    }
  }

  private assertManifestCompatibility(manifest: ExtensionManifestV2, runtime: PluginRuntime) {
    if (manifest.id === hostProviderId) {
      throw new Error(`Extension id \`${hostProviderId}\` is reserved for Host Kits.`)
    }
    if (!manifest.engines.runtimes.includes(runtime)) {
      throw new Error(`Extension \`${manifest.id}\` does not support runtime \`${runtime}\`.`)
    }
    if (this.airiVersion && !semver.satisfies(this.airiVersion, manifest.engines.airi, { includePrerelease: true })) {
      throw new Error(
        `Extension \`${manifest.id}\` requires AIRI \`${manifest.engines.airi}\`, but the running version is \`${this.airiVersion}\`.`,
      )
    }
  }

  private async checkKitAccess(consumer: OwnerRecord | undefined, kitId: string): Promise<void> {
    if (consumer?.kind !== 'plugin' && consumer?.kind !== 'module')
      return
    const session = this.sessions.get(String(consumer.sessionId))
    if (!session)
      return
    await session.checkKitAccess(kitId, consumer.kind === 'module' ? String(consumer.moduleId) : undefined)
  }

  private catalogFor(session: PluginSessionController): CatalogSnapshot {
    const kits = graph(this.container).services().filter(service => service.metadata.kind === 'kit' && service.consumer === undefined).filter(isListedProvider).filter(service => session.canSeeKit(String(service.metadata.kitId))).map(service => ({
      id: String(service.metadata.kitId),
      version: String(service.metadata.version),
      provider: service.metadata.provider as { kind: 'host' | 'extension', id: string },
      status: service.status ?? 'ready',
    }))
    const extensions = [...this.sessions.values()].map(controller => ({
      id: controller.pluginId,
      version: controller.input.manifest.version,
      phase: controller.currentPhase(),
      provides: controller.provides.map(declaration => declaration.id),
    }))
    return { kits, extensions }
  }

  private scheduleCatalogPush(): void {
    if (this.catalogTimer)
      return
    this.catalogTimer = setTimeout(() => {
      this.catalogTimer = undefined
      for (const session of this.sessions.values())
        void session.pushCatalog()
    }, 0)
  }

  private createInstallContext(): ExtensionHostInstallContext {
    return {
      provideKit: source => this.provideKit(source),
      announceCapability: (key, metadata) => {
        this.announceCapability(key, metadata)
      },
      markCapabilityReady: (key, metadata) => {
        this.markCapabilityReady(key, metadata)
      },
      markCapabilityDegraded: (key, metadata) => {
        this.markCapabilityDegraded(key, metadata)
      },
      withdrawCapability: (key, metadata) => {
        this.withdrawCapability(key, metadata)
      },
    }
  }

  private installContribution(contribution: ExtensionHostContribution) {
    contribution.install(this.installContext)
  }

  /**
   * Starts one session for a loaded Extension in the Host thread.
   * The promise resolves when setup completes or when the session waits for Kits, and rejects when setup fails.
   */
  async startExtension(
    extension: Extension,
    options: { manifest: ExtensionManifestV2, cwd?: string, runtime?: PluginRuntime },
  ): Promise<ExtensionSession> {
    const runtime = options.runtime ?? this.runtime
    this.assertManifestCompatibility(options.manifest, runtime)
    if (extension.id !== options.manifest.id) {
      throw new Error(`Extension entrypoint id \`${extension.id}\` must match manifest id \`${options.manifest.id}\`.`)
    }
    return await this.startSession({ manifest: options.manifest, cwd: options.cwd, runtime, runner: createDirectRunner(), extension })
  }

  /**
   * Starts one session from a Manifest. The runner loads the entrypoint.
   * The promise resolves when setup completes or when the session waits for Kits, and rejects when setup or the runtime fails.
   */
  async start(manifest: ExtensionManifestV2, options: ExtensionStartOptions = {}): Promise<ExtensionSession> {
    const runtime = options.runtime ?? this.runtime
    this.assertManifestCompatibility(manifest, runtime)
    return await this.startSession({ manifest, cwd: options.cwd, runtime, runner: options.runner ?? this.runner })
  }

  private async startSession(input: { manifest: ExtensionManifestV2, cwd?: string, runtime: PluginRuntime, runner: PluginRunner, extension?: Extension }): Promise<ExtensionSession> {
    const { manifest } = input
    const sessionId = `extension-session-${nanoid()}`
    const identity = { id: manifest.id, version: manifest.version, sessionId }
    const requested = protocolPermissionsOf(manifest)
    const persistedGrant = this.persistedPermissionGrants.get(manifest.id)
    const resolvedGrant = await this.permissionResolver?.({
      identity,
      manifest,
      requested,
      persisted: persistedGrant,
    }) ?? requested
    const snapshot = this.permissions.initialize(sessionId, requested, {
      grant: resolvedGrant,
      persisted: this.permissionResolver ? undefined : persistedGrant,
    })
    this.persistedPermissionGrants.set(manifest.id, snapshot.granted)

    const controller = new PluginSessionController(this.sessionHost, {
      sessionId,
      manifest,
      cwd: input.cwd,
      runtime: input.runtime,
      runner: input.runner,
      extension: input.extension,
      permissions: { requested: snapshot.requested, granted: snapshot.granted, revision: snapshot.revision },
    })
    this.sessions.set(sessionId, controller)
    for (const declaration of manifest.kits?.provides ?? [])
      this.kitGraph.addProvider(declaration.id, manifest.id, declaration.version)
    controller.install()

    try {
      await controller.settled()
    }
    catch (error) {
      this.sessions.delete(sessionId)
      await controller.stop().catch(() => undefined)
      throw error
    }
    return controller.session
  }

  listSessions(): ExtensionSession[] {
    return [...this.sessions.values()].map(controller => controller.session)
  }

  getSession(sessionId: string): ExtensionSession | undefined {
    return this.sessions.get(sessionId)?.session
  }

  /** Lists the module scopes of all sessions. */
  listModules() {
    return [...this.sessions.values()].flatMap(controller => [...controller.session.modules.values()])
  }

  /**
   * Withdraws the Kits of the session, then disposes its container. Concurrent external callers share the outcome.
   * A cleanup of the session that passes its `signal` resolves at once. Without a signal, it waits for itself after an `await`, until the stop timeout ends that cleanup.
   */
  async stop(sessionId: string, options: ExtensionStopOptions = {}): Promise<ExtensionSession | undefined> {
    const controller = this.sessions.get(sessionId)
    if (!controller) {
      return undefined
    }

    try {
      await controller.stop(options.signal)
    }
    finally {
      if (controller.currentPhase() === 'stopped' && this.sessions.get(sessionId) === controller)
        this.sessions.delete(sessionId)
      this.scheduleCatalogPush()
    }
    return controller.session
  }

  /**
   * Starts a new session from the Manifest of an old session.
   * By default, the old session stops first. With `atomic`, the new session starts first and the old one stops after it.
   */
  async reload(sessionId: string, options: ExtensionReloadOptions = {}): Promise<ExtensionSession> {
    const previous = this.sessions.get(sessionId)
    if (!previous) {
      throw new Error(`Unable to reload missing extension session: ${sessionId}`)
    }

    const startInput = {
      manifest: previous.input.manifest,
      cwd: options.cwd ?? previous.input.cwd,
      runtime: options.runtime ?? previous.input.runtime,
      runner: options.runner ?? previous.input.runner,
      // A session from `startExtension` keeps its loaded Extension.
      extension: previous.input.extension,
    }
    this.assertManifestCompatibility(startInput.manifest, startInput.runtime)
    if (options.atomic) {
      const next = await this.startSession(startInput)
      await this.stop(sessionId)
      return next
    }
    await this.stop(sessionId)
    return await this.startSession(startInput)
  }

  /** Stops each session, then disposes the plugin host container. */
  async dispose(): Promise<void> {
    const errors: unknown[] = []
    for (const [sessionId, controller] of [...this.sessions].reverse()) {
      try {
        await controller.stop()
      }
      catch (error) {
        errors.push(error)
      }
      finally {
        this.sessions.delete(sessionId)
      }
    }
    if (this.catalogTimer)
      clearTimeout(this.catalogTimer)
    try {
      await dispose(this.container)
    }
    catch (error) {
      errors.push(error)
    }
    if (errors.length === 1)
      throw errors[0]
    if (errors.length > 1)
      throw new AggregateError(errors, 'Plugin host disposal failed.')
  }

  /**
   * Registers one Host Kit as a service on `kit:<id>@host`. The selection service connects a client for each caller.
   * A Kit with a descriptor and an API registers both in one call.
   */
  provideKit(source: HostKitSource): KitRegistration {
    return this.kitGraph.provideHostKit(source)
  }

  /**
   * Resolves a Kit for Host code, for example a harness or a test. The Host is the caller, so no plugin permission applies.
   * The client follows the selected provider: it moves to another provider without a new call.
   */
  async resolveKit<R extends KitReference>(kit: R, options: { timeoutMs?: number } = {}): Promise<KitClientOf<R>> {
    const { selected } = await resolve(this.container, { selected: this.kitGraph.selectionOf(kit.id, '*') }, { signal: timeout(this.container, options.timeoutMs ?? 5_000) })
    if (!(selected instanceof SelectedKit))
      throw new Error(`Kit \`${kit.id}\` did not resolve to a selection.`)
    return selected.client as KitClientOf<R>
  }

  /** Sets the provider order of a Kit, by provider id. The Host Kit has the id `host`. */
  setKitProviderOrder(kitId: string, order: readonly string[]): void {
    this.kitGraph.setProviderOrder(kitId, order)
  }

  /** Returns the provider that a consumer with no other condition selects now, without its endpoint. */
  getKitProvider(kitId: string): ReadyKitProviderSnapshot | undefined {
    const providers = this.listKitProviders().filter(provider => provider.id === kitId)
    const order = this.kitGraph.orderedProviders(kitId)
    return order
      .map(providerId => providers.find(provider => (provider.owner.kind === 'host' ? hostProviderId : provider.owner.extensionId) === providerId))
      .find(provider => provider !== undefined)
  }

  /** Returns a point-in-time list of the running Kit providers, without endpoints. */
  listKitProviders(): readonly ReadyKitProviderSnapshot[] {
    return Object.freeze(graph(this.container).services()
      .filter(service => service.metadata.kind === 'kit' && service.consumer === undefined)
      .filter(isListedProvider)
      .map((service): ReadyKitProviderSnapshot => {
        const provider = service.metadata.provider as { kind: 'host' | 'extension', id: string }
        return Object.freeze({
          id: String(service.metadata.kitId),
          version: String(service.metadata.version),
          exposure: service.metadata.exposure === undefined ? undefined : String(service.metadata.exposure),
          instanceId: service.instanceId,
          owner: provider.kind === 'host'
            ? Object.freeze({ kind: 'host' as const })
            : Object.freeze({ kind: 'extension' as const, extensionId: provider.id, sessionId: String(service.metadata.sessionId) }),
        })
      })
      .sort((left, right) => left.id.localeCompare(right.id)))
  }

  /** Returns a mutable descriptor copy from the current registration. Re-query after registration changes. */
  getKit(kitId: string): KitDescriptor | undefined {
    const kit = this.kitGraph.getHostDescriptor(kitId)
    return kit ? cloneKitDescriptor(kit) : undefined
  }

  /** Returns mutable descriptor copies from the current registrations. Re-query after registration changes. */
  listKits(runtime?: PluginRuntime): KitDescriptor[] {
    return this.kitGraph.listHostDescriptors(runtime).map(cloneKitDescriptor)
  }

  /** Returns a mutable capability copy from the current registration. Re-query after registration changes. */
  getKitCapabilities(kitId: string): KitCapabilityDescriptor[] {
    const capabilities = this.kitGraph.getHostDescriptor(kitId)?.capabilities
    return capabilities ? cloneKitCapabilities(capabilities) : []
  }

  /**
   * Returns a read-only view of the graph: the services, why each session is not ready, the cycles, and the last observe records.
   * The view leaves out the templates of `perConsumer` services, because they never build.
   */
  inspect(): PluginHostGraphSnapshot {
    const queries = graph(this.container)
    const services = queries.services().filter(service => !service.perConsumer || service.consumer !== undefined)
    const explanations = [...this.sessions.values()].flatMap((controller) => {
      if (controller.currentPhase() === 'ready')
        return []
      const lines = controller.explanationLines() ?? []
      return [{ sessionId: controller.sessionId, extensionId: controller.pluginId, lines }]
    })
    return Object.freeze({
      services,
      explanations,
      cycles: queries.cycles().map(cycle => cycle.map(service => service.key)),
      events: [...this.events],
    })
  }

  private getExtensionSessionOrThrow(sessionId: string): PluginSessionController {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Unknown extension session: ${sessionId}`)
    }
    return session
  }

  private assertExtensionPermission(
    session: PluginSessionController,
    input: ExtensionHostPermissionRequest,
    moduleId?: string,
  ) {
    const grant = session.grantOf(moduleId)
    if (grant && this.permissions.grantAllows(grant, input.area, input.action, input.key)) {
      return
    }

    throw new PermissionDeniedError({
      area: input.area,
      action: input.action,
      key: input.key,
    })
  }

  private getModuleOrThrow(moduleId: string) {
    const module = this.modules.get(moduleId)
    if (!module) {
      throw new Error(`Module \`${moduleId}\` was not found.`)
    }

    return module
  }

  private assertKitAvailableForRuntime(kitId: string, runtime: PluginRuntime) {
    const kit = this.kitGraph.getHostDescriptor(kitId)
    if (!kit) {
      throw new Error(`Kit \`${kitId}\` is not registered.`)
    }

    if (!kit.runtimes.includes(runtime)) {
      throw new Error(`Kit \`${kitId}\` is not available for runtime \`${runtime}\`.`)
    }

    return kit
  }

  getBinding(moduleId: string): BindingRecord<HostDataRecord> | undefined {
    const module = this.modules.get(moduleId)
    if (!module) {
      return undefined
    }

    return cloneBindingRecord(module)
  }

  listBindings(options: ExtensionHostBindingListOptions = {}) {
    return this.modules.list().filter((module) => {
      if (options.ownerSessionId && module.ownerSessionId !== options.ownerSessionId) {
        return false
      }

      if (options.kitId && module.kitId !== options.kitId) {
        return false
      }

      return true
    }).map(module => cloneBindingRecord(module))
  }

  announceBinding<C extends HostDataRecord = HostDataRecord>(
    sessionId: string,
    input: BoundAnnounceBindingInput<C>,
  ): BindingRecord<C> {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const runtime = session.input.runtime
    const kit = this.assertKitAvailableForRuntime(input.kitId, runtime)

    this.assertExtensionPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginBindingApiAnnounceEventName,
    })
    this.assertExtensionPermission(session, {
      area: 'resources',
      action: 'write',
      key: getKitBindingResourceKey(kit.kitId),
      reason: `Module announce requires write access to kit \`${kit.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.bind({
      ...input,
      ownerSessionId: session.sessionId,
      ownerExtensionId: session.pluginId,
      runtime,
    }) as BindingRecord<C>)
  }

  activateBinding(sessionId: string, moduleId: string) {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)

    this.assertExtensionPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginBindingApiActivateEventName,
    })
    this.assertExtensionPermission(session, {
      area: 'resources',
      action: 'write',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module activation requires write access to kit \`${module.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.activate(session.sessionId, session.pluginId, moduleId))
  }

  updateBinding<C extends HostDataRecord = HostDataRecord>(
    sessionId: string,
    moduleId: string,
    patch: UpdateBindingInput<C> | Omit<UpdateBindingInput<C>, 'moduleId'>,
  ) {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)

    this.assertExtensionPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginBindingApiUpdateEventName,
    })
    this.assertExtensionPermission(session, {
      area: 'resources',
      action: 'write',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module update requires write access to kit \`${module.kitId}\`.`,
    })

    const normalizedPatch = 'moduleId' in patch ? omitModuleId(patch) : patch
    return cloneBindingRecord(this.modules.update(session.sessionId, session.pluginId, moduleId, normalizedPatch))
  }

  degradeBinding(sessionId: string, moduleId: string) {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)
    this.assertExtensionPermission(session, {
      area: 'resources',
      action: 'write',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module degradation requires write access to kit \`${module.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.degrade(session.sessionId, session.pluginId, moduleId))
  }

  withdrawBinding(sessionId: string, moduleId: string) {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)

    this.assertExtensionPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginBindingApiWithdrawEventName,
    })
    this.assertExtensionPermission(session, {
      area: 'resources',
      action: 'write',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module withdrawal requires write access to kit \`${module.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.withdraw(session.sessionId, session.pluginId, moduleId))
  }

  /**
   * Binds one module for a Host Kit client. A binding from a module scope disposes with that scope.
   * `permissionModuleId` is the module scope whose grant applies, and that owns the binding.
   */
  bindExtensionKitModule<C extends HostDataRecord = HostDataRecord>(
    sessionId: string,
    input: BoundAnnounceBindingInput<C>,
    permissionModuleId?: string,
  ): BindingRecord<C> {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const kit = this.assertKitAvailableForRuntime(input.kitId, this.runtime)

    this.assertExtensionPermission(session, {
      area: 'resources',
      action: 'write',
      key: getKitBindingResourceKey(kit.kitId),
      reason: `Module announce requires write access to kit \`${kit.kitId}\`.`,
    }, permissionModuleId)

    const binding = cloneBindingRecord(this.modules.bind({
      ...input,
      ownerSessionId: session.sessionId,
      ownerExtensionId: session.pluginId,
      runtime: this.runtime,
    }) as BindingRecord<C>)

    if (permissionModuleId) {
      session.bindToScope(permissionModuleId, binding.moduleId)
    }

    return binding
  }

  announceCapability(key: string, metadata?: Record<string, unknown>) {
    return this.capabilities.announce(key, metadata)
  }

  markCapabilityReady(key: string, metadata?: Record<string, unknown>) {
    return this.capabilities.markReady(key, metadata)
  }

  markCapabilityDegraded(key: string, metadata?: Record<string, unknown>) {
    return this.capabilities.markDegraded(key, metadata)
  }

  withdrawCapability(key: string, metadata?: Record<string, unknown>) {
    return this.capabilities.withdraw(key, metadata)
  }

  listCapabilities() {
    return this.capabilities.list()
  }

  isCapabilityReady(key: string) {
    return this.capabilities.isReady(key)
  }

  async waitForCapabilities(keys: string[], timeoutMs: number = 15000) {
    await Promise.all(keys.map(key => this.capabilities.waitFor(key, timeoutMs)))
  }

  async waitForCapability(key: string, timeoutMs: number = 15000) {
    return await this.capabilities.waitFor(key, timeoutMs)
  }
}
