import type {
  Extension,
  ExtensionKitConsumer,
  ExtensionKitRegistry,
  ExtensionModuleContext,
  ExtensionSetupContext,
  RegisterExtensionModuleInput,
} from '../extension/shared'
import type { KitAvailability, KitRef, KitUseResult } from '../kit'
import type { AnnounceBindingInput, UpdateBindingInput } from '../plugin/apis/client/bindings'
import type { ExtensionProviderTransaction, ExtensionRegistrationLease } from './hosted-kits'
import type { BindingRecord, HostSourceLease, KitCapabilityDescriptor, KitCapabilityDescriptorSnapshot, KitDescriptor, KitDescriptorSnapshot } from './shared'
import type {
  ExtensionHostContribution,
  ExtensionHostInstallContext,
  ExtensionHostOptions,
  ExtensionHostPermissionRequest,
  ExtensionManifestV2,
  ExtensionProvidedKitDeclaration,
  ExtensionStartOptions,
  HostDataRecord,
  HostDataValue,
  ModulePermissionDeclaration,
  ModulePermissionGrant,
  PluginRuntime,
} from './shared/types'

import semver from 'semver'

import { DisposableStore } from '../extension/disposable'
import { kitUseFailure } from '../kit'
import {
  getKitBindingResourceKey,
  pluginBindingApiActivateEventName,
  pluginBindingApiAnnounceEventName,
  pluginBindingApiUpdateEventName,
  pluginBindingApiWithdrawEventName,
} from '../plugin/apis/client/bindings'
import {
  protocolListProvidersEventName,
} from '../plugin/apis/protocol/resources/providers'
import { KitProviderRegistry } from './hosted-kits'
import { FileSystemLoader } from './runtimes/node/loaders'
import {
  DependencyService,
  ExtensionSessionService,
  KitApiBindingRegistryService,
  PermissionService,
  ResourceService,
} from './runtimes/shared'

/** Stable empty declaration set for Manifests that do not provide Kits. */
const emptyProvidedKitDeclarations: readonly ExtensionProvidedKitDeclaration[] = Object.freeze([])

/**
 * Extension host lifecycle overview.
 *
 * The host owns manifest validation, extension setup sessions, extension-level
 * permission grants, and module cleanup. Extension code uses `setup(ctx)` as
 * the common authoring entrypoint and requests host-installed kits through
 * `ctx.kits`. Explicit modules are optional lifecycle and attribution scopes
 * that can narrow kit usage through `module.kits`. Root setup can also provide
 * Kits declared in its Manifest. The Host publishes them only after setup succeeds.
 *
 * Permission checks are intentionally two-layered: the extension grant is the
 * package/session ceiling. Extension-scoped kit usage is checked against that
 * ceiling directly; module-scoped kit usage is checked against the module grant
 * derived from `extension grant intersection module request`.
 */

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
 * Describes the host-owned state for one extension setup session.
 */
export interface ExtensionSession {
  /** Unique host-generated session id. */
  id: string
  /** Extension identity and session metadata. */
  extension: {
    id: string
    version?: string
    sessionId: string
  }
  /** Manifest used to start this extension. */
  manifest: ExtensionManifestV2
  /** Working directory used to resolve relative manifest entrypoints. */
  cwd?: string
  /** Runtime used to choose manifest entrypoints. */
  runtime?: PluginRuntime
  /** Loaded extension definition. */
  entrypoint: Extension
  /** Current extension setup phase. */
  phase: 'setting-up' | 'ready' | 'failed' | 'stopped'
  /** Modules registered by this extension setup. */
  modules: Map<string, ExtensionModuleContext>
  /** Requested and granted permissions for the extension session. */
  permissions: {
    requested: ModulePermissionDeclaration
    granted: ModulePermissionGrant
    revision: number
  }
  /** Extension-session cleanup callbacks. */
  subscriptions: DisposableStore
}

/**
 * Host-private ownership for one session's Provider registrations.
 * Stop releases pending reservations or the committed lease before cleanup starts.
 * Released sessions retain one cleanup promise so concurrent callers share its outcome.
 */
type SessionRegistration
  = | { phase: 'pending', transaction: ExtensionProviderTransaction }
    | { phase: 'ready', lease: ExtensionRegistrationLease }
    | { phase: 'released', cleanup: Promise<void> }

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

type BoundAnnounceBindingInput<C extends HostDataRecord = HostDataRecord> = AnnounceBindingInput<C>
type BoundUpdateBindingInput<C extends HostDataRecord = HostDataRecord> = UpdateBindingInput<C>

interface ExtensionModuleResourceTracker {
  bindingIds: Set<string>
}

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

/**
 * Orchestrates extension loading, setup sessions, bindings, resources, and permissions.
 *
 * Use when:
 * - Running extension entrypoints inside the in-memory host implementation
 * - Tests or applications need one place to start, stop, reload, and query extension sessions
 *
 * Expects:
 * - Extensions are loaded from manifest entrypoints through {@link FileSystemLoader}
 * - Each session gets its own permission scope, module registry, and cleanup store
 *
 * Returns:
 * - A host instance that exposes extension sessions plus access to kits, bindings, resources, and capabilities
 *
 * Call stack:
 *
 * caller
 *   -> {@link ExtensionHost.start}
 *     -> {@link FileSystemLoader.resolveEntrypointFor}
 *     -> {@link FileSystemLoader.loadExtensionFor}
 *     -> {@link ExtensionHost.startExtension}
 */
export class ExtensionHost {
  private readonly loader: FileSystemLoader
  private readonly extensionSessionService = new ExtensionSessionService<ExtensionSession>()
  private readonly runtime: PluginRuntime
  private readonly dependencies = new DependencyService()
  private readonly providers = new KitProviderRegistry()
  private readonly sessionRegistrations = new WeakMap<ExtensionSession, SessionRegistration>()
  private cleanupContext?: Promise<typeof import('./runtimes/node/cleanup-context')>
  private readonly kitApiWatchers = new Map<string, Set<() => Promise<void>>>()
  private readonly modules = new KitApiBindingRegistryService()
  private readonly extensionModuleResources = new Map<string, ExtensionModuleResourceTracker>()
  private readonly permissions = new PermissionService()
  private readonly airiVersion?: string
  private readonly permissionResolver?: ExtensionHostOptions['permissionResolver']
  private readonly persistedPermissionGrants = new Map<string, ModulePermissionGrant>()
  private readonly resources = new ResourceService()

  private readonly installContext: ExtensionHostInstallContext

  constructor(options: ExtensionHostOptions = {}) {
    this.loader = new FileSystemLoader()
    this.runtime = options.runtime ?? 'electron'
    if (options.airiVersion && !semver.valid(options.airiVersion)) {
      throw new Error(`AIRI version must be a valid semantic version: ${options.airiVersion}`)
    }
    this.airiVersion = options.airiVersion
    this.permissionResolver = options.permissionResolver
    this.resources.setValue(protocolListProvidersEventName, [] as Array<{ name: string }>)
    this.markCapabilityReady(protocolListProvidersEventName, { source: 'plugin-host' })
    this.installContext = this.createInstallContext()

    for (const contribution of options.contributions ?? []) {
      this.installContribution(contribution)
    }
  }

  private assertManifestCompatibility(manifest: ExtensionManifestV2, runtime: PluginRuntime) {
    if (!manifest.engines.runtimes.includes(runtime)) {
      throw new Error(`Extension \`${manifest.id}\` does not support runtime \`${runtime}\`.`)
    }
    if (this.airiVersion && !semver.satisfies(this.airiVersion, manifest.engines.airi, { includePrerelease: true })) {
      throw new Error(
        `Extension \`${manifest.id}\` requires AIRI \`${manifest.engines.airi}\`, but the running version is \`${this.airiVersion}\`.`,
      )
    }
  }

  /**
   * Runs setup and publishes its declared Providers only while the session remains pending.
   * Stop releases reservations immediately but does not abort Extension code.
   * If stop interrupts setup, this promise rejects when setup settles.
   */
  async startExtension(
    extension: Extension,
    options: { manifest: ExtensionManifestV2, cwd?: string, runtime?: PluginRuntime },
  ) {
    const runtime = options.runtime ?? this.runtime
    this.assertManifestCompatibility(options.manifest, runtime)

    if (extension.id !== options.manifest.id) {
      throw new Error(`Extension entrypoint id \`${extension.id}\` must match manifest id \`${options.manifest.id}\`.`)
    }

    const sessionIdentity = this.extensionSessionService.nextSessionIdentity()
    const extensionIdentity = {
      id: extension.id,
      version: options.manifest.version,
      sessionId: sessionIdentity.sessionId,
    }
    const persistedGrant = this.persistedPermissionGrants.get(extension.id)
    const resolvedGrant = await this.permissionResolver?.({
      identity: extensionIdentity,
      manifest: options.manifest,
      requested: options.manifest.permissions,
      persisted: persistedGrant,
    }) ?? options.manifest.permissions
    const providerTransaction = this.providers.beginExtensionSession({
      owner: { kind: 'extension', extensionId: extension.id, sessionId: sessionIdentity.sessionId },
      declarations: options.manifest.kits?.provides ?? emptyProvidedKitDeclarations,
    })
    let permissionSnapshot: ReturnType<PermissionService['initialize']>
    try {
      permissionSnapshot = this.permissions.initialize(sessionIdentity.sessionId, options.manifest.permissions, {
        grant: resolvedGrant,
        persisted: this.permissionResolver ? undefined : persistedGrant,
      })
    }
    catch (error) {
      providerTransaction.rollback()
      throw error
    }
    this.persistedPermissionGrants.set(extension.id, permissionSnapshot.granted)
    const subscriptions = new DisposableStore()
    const session: ExtensionSession = {
      id: sessionIdentity.sessionId,
      extension: extensionIdentity,
      manifest: options.manifest,
      cwd: options.cwd,
      runtime,
      entrypoint: extension,
      phase: 'setting-up',
      modules: new Map(),
      permissions: {
        requested: permissionSnapshot.requested,
        granted: permissionSnapshot.granted,
        revision: permissionSnapshot.revision,
      },
      subscriptions,
    }

    this.sessionRegistrations.set(session, { phase: 'pending', transaction: providerTransaction })
    this.extensionSessionService.register(session)

    const ctx: ExtensionSetupContext = {
      extension: session.extension,
      kits: this.createExtensionKitRegistry(session, providerTransaction),
      subscriptions,
      modules: {
        register: async (input: RegisterExtensionModuleInput) => {
          if (this.sessionRegistrations.get(session)?.phase === 'released') {
            throw new Error(`Extension session ${session.id} is stopped and cannot register modules.`)
          }
          if (session.modules.has(input.id)) {
            throw new Error(`Extension module \`${input.id}\` is already registered for session ${session.id}.`)
          }

          const moduleSubscriptions = new DisposableStore()
          const moduleCleanup = new DisposableStore()
          moduleCleanup.add(moduleSubscriptions)
          // Bindings must disappear before callbacks run. A binding failure cannot skip subscription disposal.
          moduleCleanup.add({ dispose: () => this.cleanupExtensionModuleResources(session, input.id) })
          const permissions = this.permissions.intersectGrant(
            session.permissions.granted,
            input.permissions ?? session.permissions.granted,
          )
          const module: ExtensionModuleContext = {
            id: input.id,
            identity: {
              id: input.id,
              extension: session.extension,
              labels: input.labels,
            },
            permissions,
            kits: this.createModuleKitRegistry(session, moduleSubscriptions, input.id),
            subscriptions: moduleSubscriptions,
            dispose: async () => {
              try {
                await moduleCleanup.dispose()
              }
              finally {
                session.modules.delete(input.id)
              }
            },
          }
          session.modules.set(module.id, module)
          return module
        },
      },
    }

    try {
      await extension.setup(ctx)
      const registration = this.sessionRegistrations.get(session)
      if (registration?.phase !== 'pending') {
        throw new Error(`Extension session ${session.id} stopped before setup completed.`)
      }
      const committed = registration.transaction.commit()
      this.sessionRegistrations.set(session, { phase: 'ready', lease: committed.lease })
      session.phase = 'ready'
      return session
    }
    catch (error) {
      if (this.sessionRegistrations.get(session)?.phase !== 'released') {
        session.phase = 'failed'
      }
      try {
        await this.cleanupExtensionSession(session)
      }
      catch (cleanupError) {
        throw new AggregateError([error, cleanupError], `Extension \`${extension.id}\` setup and cleanup both failed.`, { cause: error })
      }
      throw error
    }
  }

  listModules() {
    return this.extensionSessionService
      .list()
      .flatMap(session => [...session.modules.values()])
  }

  /**
   * Registers one Host Client factory.
   *
   * The returned lease owns this exact registration. A duplicate current factory causes a conflict.
   * A current lease disposal notifies Kit watchers.
   *
   * @template TClient Client type that the factory creates.
   * @param kit Host Client factory to register.
   */
  registerKitApi<TClient>(kit: KitRef<TClient>): HostSourceLease<KitRef<TClient>> {
    const lease = this.providers.contributeHost({ kind: 'client-factory', factory: kit })
    void this.notifyKitApiWatchers(lease.kitId)
    return Object.freeze({
      accepted: lease.accepted,
      kitId: lease.kitId,
      sourceKind: lease.sourceKind,
      dispose: () => {
        const changed = lease.dispose()
        if (changed) {
          void this.notifyKitApiWatchers(lease.kitId)
        }
        return changed
      },
    })
  }

  private async cleanupExtensionSessionModules(session: ExtensionSession) {
    const cleanup = new DisposableStore()
    for (const module of session.modules.values()) {
      cleanup.add(module)
    }
    try {
      await cleanup.dispose()
    }
    finally {
      session.modules.clear()
    }
  }

  private getExtensionModuleResourceKey(sessionId: string, moduleId: string) {
    return `${sessionId}:${moduleId}`
  }

  private getOrCreateExtensionModuleResourceTracker(sessionId: string, moduleId: string) {
    const key = this.getExtensionModuleResourceKey(sessionId, moduleId)
    let resources = this.extensionModuleResources.get(key)
    if (!resources) {
      resources = {
        bindingIds: new Set(),
      }
      this.extensionModuleResources.set(key, resources)
    }

    return resources
  }

  private async cleanupExtensionModuleResources(session: ExtensionSession, moduleId: string) {
    const key = this.getExtensionModuleResourceKey(session.id, moduleId)
    const resources = this.extensionModuleResources.get(key)
    if (!resources) {
      return
    }

    for (const bindingId of resources.bindingIds) {
      const binding = this.modules.get(bindingId)
      if (!binding) {
        continue
      }

      if (binding.state !== 'withdrawn') {
        this.modules.withdraw(session.id, session.extension.id, bindingId)
      }
      this.modules.unbind(session.id, session.extension.id, bindingId)
    }

    this.extensionModuleResources.delete(key)
  }

  private async notifyKitApiWatchers(kitId: string) {
    const watchers = this.kitApiWatchers.get(kitId)
    if (!watchers?.size) {
      return
    }

    for (const watcher of watchers) {
      await watcher()
    }
  }

  private resolveKitApi<TClient>(
    session: ExtensionSession,
    kit: KitRef<TClient>,
    subscriptions: DisposableStore,
    moduleId?: string,
  ): KitUseResult<TClient> {
    const createClient = this.providers.getHostClientFactory<TClient>(kit.id)
    if (!createClient) {
      return kitUseFailure(kit, 'missing-kit')
    }

    const grant = moduleId
      ? session.modules.get(moduleId)?.permissions
      : session.permissions.granted

    if (!grant || !this.permissions.grantAllows(grant, 'apis', 'invoke', kit.id)) {
      return kitUseFailure(kit, 'permission-denied')
    }

    return {
      ok: true,
      client: Reflect.apply(createClient, undefined, [{
        extensionId: session.extension.id,
        sessionId: session.id,
        moduleId,
        subscriptions,
      }]),
    }
  }

  private createKitRegistry(session: ExtensionSession, subscriptions: DisposableStore, moduleId?: string): ExtensionKitConsumer {
    return {
      use: async <TClient>(kit: KitRef<TClient>) => {
        const result = this.resolveKitApi(session, kit, subscriptions, moduleId)
        if (result.ok) {
          return result.client
        }
        const failure = result as Extract<KitUseResult<TClient>, { ok: false }>
        throw failure.error
      },
      tryUse: async <TClient>(kit: KitRef<TClient>) => {
        return this.resolveKitApi(session, kit, subscriptions, moduleId)
      },
      watch: <TClient>(kit: KitRef<TClient>, callback: (availability: KitAvailability<TClient>) => void | Promise<void>) => {
        const watchers = this.kitApiWatchers.get(kit.id) ?? new Set()
        let disposed = false
        const watcher = async () => {
          if (disposed) {
            return
          }

          const result = this.resolveKitApi(session, kit, subscriptions, moduleId)
          if (result.ok) {
            await callback({ available: true, kit, client: result.client })
            return
          }

          const failure = result as Extract<KitUseResult<TClient>, { ok: false }>
          await callback({ available: false, kit, reason: failure.reason, error: failure.error })
        }
        watchers.add(watcher)
        this.kitApiWatchers.set(kit.id, watchers)
        void watcher()
        return subscriptions.add({
          dispose: () => {
            if (disposed) {
              return
            }

            disposed = true
            watchers.delete(watcher)
            if (watchers.size === 0) {
              this.kitApiWatchers.delete(kit.id)
            }
          },
        })
      },
    }
  }

  private createExtensionKitRegistry(session: ExtensionSession, transaction: ExtensionProviderTransaction): ExtensionKitRegistry {
    return {
      ...this.createKitRegistry(session, session.subscriptions),
      provide: (contract, provider) => {
        if (session.phase !== 'setting-up') {
          throw new Error(`Extension session ${session.id} cannot provide Kits after setup.`)
        }
        return transaction.provide(contract, provider)
      },
    }
  }

  private createModuleKitRegistry(session: ExtensionSession, subscriptions: DisposableStore, moduleId: string): ExtensionModuleContext['kits'] {
    return this.createKitRegistry(session, subscriptions, moduleId)
  }

  private assertExtensionPermission(
    session: ExtensionSession,
    input: ExtensionHostPermissionRequest,
    moduleId?: string,
  ) {
    const grant = moduleId
      ? session.modules.get(moduleId)?.permissions
      : session.permissions.granted

    if (grant && this.permissions.grantAllows(grant, input.area, input.action, input.key)) {
      return
    }

    throw new PermissionDeniedError({
      area: input.area,
      action: input.action,
      key: input.key,
    })
  }

  private getExtensionSessionOrThrow(sessionId: string) {
    const session = this.extensionSessionService.get(sessionId)
    if (!session) {
      throw new Error(`Unknown extension session: ${sessionId}`)
    }

    return session
  }

  private createInstallContext(): ExtensionHostInstallContext {
    return {
      registerKit: kit => this.registerKit(kit),
      setResourceResolver: (key, resolver) => this.setResourceResolver(key, resolver),
      setResourceValue: (key, value) => this.setResourceValue(key, value),
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

  private cleanupExtensionSession(session: ExtensionSession): Promise<void> {
    const registration = this.sessionRegistrations.get(session)
    if (!registration) {
      throw new Error(`Unknown registration lifecycle for Extension session ${session.id}.`)
    }
    if (registration.phase === 'released') {
      return this.waitForSessionCleanup(session, registration.cleanup)
    }
    if (this.runtime !== 'web') {
      // Keep Node async hooks behind the runtime boundary. Web cleanup retains the shared outcome without self-wait detection.
      this.cleanupContext ??= import('./runtimes/node/cleanup-context')
    }

    // Store the shared outcome before any cleanup callback can call stop again.
    const cleanup = Promise.resolve().then(async () => {
      const resources = new DisposableStore()
      resources.add(session.subscriptions)
      resources.add({ dispose: () => this.cleanupExtensionSessionModules(session) })
      // Reverse disposal preserves binding, module, then root cleanup order without stopping at the first failure.
      resources.add({ dispose: () => {
        for (const module of this.modules.listByOwner(session.id)) {
          this.modules.withdraw(session.id, session.extension.id, module.moduleId)
          this.modules.unbind(session.id, session.extension.id, module.moduleId)
        }
      } })
      try {
        const context = await this.cleanupContext
        if (context) {
          await context.runCleanup(session, () => resources.dispose())
        }
        else {
          await resources.dispose()
        }
      }
      finally {
        this.extensionSessionService.remove(session.id)
      }
    })
    this.sessionRegistrations.set(session, { phase: 'released', cleanup })
    session.phase = 'stopped'
    // Release ownership synchronously. Late setup cannot publish, and cleanup callbacks cannot observe a ready Provider.
    if (registration.phase === 'pending') {
      registration.transaction.rollback()
    }
    else {
      registration.lease.dispose()
    }
    return cleanup
  }

  private async waitForSessionCleanup(session: ExtensionSession, cleanup: Promise<void>): Promise<void> {
    const context = await this.cleanupContext
    if (context?.isCleanupActive(session)) {
      // Joining an ancestor waits for the callback that made this call. External callers have no matching cleanup frame.
      throw new Error(`Cannot await Extension session ${session.id} from its own cleanup or a descendant cleanup.`)
    }
    await cleanup
  }

  private getModuleOrThrow(moduleId: string) {
    const module = this.modules.get(moduleId)
    if (!module) {
      throw new Error(`Module \`${moduleId}\` was not found.`)
    }

    return module
  }

  private assertKitAvailableForRuntime(kitId: string, runtime: PluginRuntime) {
    const kit = this.providers.getHostDescriptor(kitId)
    if (!kit) {
      throw new Error(`Kit \`${kitId}\` is not registered.`)
    }

    if (!kit.runtimes.includes(runtime)) {
      throw new Error(`Kit \`${kitId}\` is not available for runtime \`${runtime}\`.`)
    }

    return kit
  }

  listSessions() {
    return this.extensionSessionService.list()
  }

  getSession(sessionId: string) {
    return this.extensionSessionService.get(sessionId)
  }

  /**
   * Registers one Host descriptor.
   *
   * The returned lease owns this exact registration. A duplicate current descriptor causes a conflict.
   */
  registerKit(kit: KitDescriptor): HostSourceLease<KitDescriptorSnapshot> {
    return this.providers.contributeHost({ kind: 'descriptor', descriptor: kit })
  }

  /** Returns a point-in-time Provider snapshot without its endpoint. Re-query after stop or reload. */
  getKitProvider(kitId: string) {
    return this.providers.getReady(kitId)
  }

  /** Returns a point-in-time Provider list without endpoints. Re-query after stop or reload. */
  listKitProviders() {
    return this.providers.listReady()
  }

  /** Returns a mutable descriptor copy from the current registration. Re-query after registration changes. */
  getKit(kitId: string): KitDescriptor | undefined {
    const kit = this.providers.getHostDescriptor(kitId)
    return kit ? cloneKitDescriptor(kit) : undefined
  }

  /** Returns mutable descriptor copies from the current registrations. Re-query after registration changes. */
  listKits(runtime?: PluginRuntime): KitDescriptor[] {
    return this.providers.listHostDescriptors(runtime).map(cloneKitDescriptor)
  }

  /** Returns a mutable capability copy from the current registration. Re-query after registration changes. */
  getKitCapabilities(kitId: string): KitCapabilityDescriptor[] {
    const capabilities = this.providers.getHostDescriptor(kitId)?.capabilities
    if (!capabilities) {
      return []
    }

    return cloneKitCapabilities(capabilities)
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
    const kit = this.assertKitAvailableForRuntime(input.kitId, session.runtime ?? this.runtime)

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
      ownerSessionId: session.id,
      ownerExtensionId: session.extension.id,
      runtime: session.runtime ?? this.runtime,
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

    return cloneBindingRecord(this.modules.activate(session.id, session.extension.id, moduleId))
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
    return cloneBindingRecord(this.modules.update(session.id, session.extension.id, moduleId, normalizedPatch))
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

    return cloneBindingRecord(this.modules.degrade(session.id, session.extension.id, moduleId))
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

    return cloneBindingRecord(this.modules.withdraw(session.id, session.extension.id, moduleId))
  }

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
      ownerSessionId: session.id,
      ownerExtensionId: session.extension.id,
      runtime: this.runtime,
    }) as BindingRecord<C>)

    if (permissionModuleId) {
      this.getOrCreateExtensionModuleResourceTracker(session.id, permissionModuleId).bindingIds.add(binding.moduleId)
    }

    return binding
  }

  async start(manifest: ExtensionManifestV2, options: ExtensionStartOptions = {}): Promise<ExtensionSession> {
    const runtime = options.runtime ?? this.runtime
    this.assertManifestCompatibility(manifest, runtime)
    const extension = await this.loader.loadExtensionFor(manifest, {
      cwd: options.cwd,
      runtime,
    })

    const session = await this.startExtension(extension, {
      manifest,
      cwd: options.cwd,
      runtime,
    })

    return session
  }

  setResourceResolver<T>(key: string, resolver: () => Promise<T> | T) {
    this.resources.setResolver(key, resolver)
  }

  setResourceValue<T>(key: string, value: T) {
    this.resources.setValue(key, value)
  }

  announceCapability(key: string, metadata?: Record<string, unknown>) {
    return this.dependencies.announce(key, metadata)
  }

  markCapabilityReady(key: string, metadata?: Record<string, unknown>) {
    return this.dependencies.markReady(key, metadata)
  }

  markCapabilityDegraded(key: string, metadata?: Record<string, unknown>) {
    return this.dependencies.markDegraded(key, metadata)
  }

  withdrawCapability(key: string, metadata?: Record<string, unknown>) {
    return this.dependencies.withdraw(key, metadata)
  }

  listCapabilities() {
    return this.dependencies.list()
  }

  isCapabilityReady(key: string) {
    return this.dependencies.isReady(key)
  }

  async waitForCapabilities(keys: string[], timeoutMs: number = 15000) {
    await this.dependencies.waitForMany(keys, timeoutMs)
  }

  async waitForCapability(key: string, timeoutMs: number = 15000) {
    return await this.dependencies.waitFor(key, timeoutMs)
  }

  /**
   * Releases the session and awaits every cleanup attempt. Concurrent external callers share the completed outcome.
   * Node/Electron cleanup cannot stop or reload an active cleanup ancestor, including its own session.
   */
  async stop(sessionId: string): Promise<ExtensionSession | undefined> {
    const extensionSession = this.extensionSessionService.get(sessionId)
    if (!extensionSession) {
      return undefined
    }

    await this.cleanupExtensionSession(extensionSession)
    return extensionSession
  }

  /** Starts a fresh session only after cleanup succeeds. Node/Electron cleanup cannot reload an active cleanup ancestor. */
  async reload(sessionId: string, options: ExtensionStartOptions = {}): Promise<ExtensionSession> {
    // Reload preserves manifest/runtime intent, then performs stop + fresh start.
    // This intentionally creates a new session identity for deterministic re-bootstrap.
    const previousExtension = this.extensionSessionService.get(sessionId)
    if (!previousExtension) {
      throw new Error(`Unable to reload missing extension session: ${sessionId}`)
    }

    const manifest = previousExtension.manifest
    await this.cleanupExtensionSession(previousExtension)
    return this.start(manifest, {
      ...options,
      cwd: options.cwd ?? previousExtension.cwd,
      runtime: options.runtime ?? previousExtension.runtime,
    })
  }
}
