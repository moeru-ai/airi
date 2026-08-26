import type {
  Extension,
  ExtensionKitRegistry,
  ExtensionModuleContext,
  ExtensionSetupContext,
  RegisterExtensionModuleInput,
} from '../extension/shared'
import type { KitAvailability, KitRef, KitUseResult } from '../kit'
import type { AnnounceBindingInput, UpdateBindingInput } from '../plugin/apis/client/bindings'
import type { BindingRecord, KitCapabilityDescriptor, KitDescriptor } from './shared'
import type {
  ExtensionHostContribution,
  ExtensionHostInstallContext,
  ExtensionHostOptions,
  ExtensionHostPermissionRequest,
  ExtensionManifestV1,
  ExtensionStartOptions,
  HostDataRecord,
  HostDataValue,
  ModulePermissionDeclaration,
  ModulePermissionGrant,
  PluginRuntime,
} from './shared/types'

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
import { FileSystemLoader } from './runtimes/node/loaders'
import {
  DependencyService,
  ExtensionSessionService,
  KitApiBindingRegistryService,
  KitRegistryService,
  PermissionService,
  ResourceService,
} from './runtimes/shared'

/**
 * Extension host lifecycle overview.
 *
 * The host owns manifest validation, extension setup sessions, extension-level
 * permission grants, and module cleanup. Extension code uses `setup(ctx)` as
 * the common authoring entrypoint and requests host-installed kits through
 * `ctx.kits`. Explicit modules are optional lifecycle and attribution scopes
 * that can narrow kit usage through `module.kits`.
 *
 * Permission checks are intentionally two-layered: the extension grant is the
 * package/session ceiling. Extension-scoped kit usage is checked against that
 * ceiling directly; module-scoped kit usage is checked against the module grant
 * derived from `extension grant intersection module request`.
 */

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
  /** Limit results to bindings declared against one kit. */
  kitId?: string
  /** Limit results to bindings owned by one extension session. */
  ownerSessionId?: string
}

/**
 * Describes the host-owned state for one extension setup session.
 */
export interface ExtensionSession {
  /** Working directory used to resolve relative manifest entrypoints. */
  cwd?: string
  /** Loaded extension definition. */
  entrypoint: Extension
  /** Extension identity and session metadata. */
  extension: {
    id: string
    sessionId: string
    version?: string
  }
  /** Unique host-generated session id. */
  id: string
  /** Manifest used to start this extension. */
  manifest: ExtensionManifestV1
  /** Modules registered by this extension setup. */
  modules: Map<string, ExtensionModuleContext>
  /** Requested and granted permissions for the extension session. */
  permissions: {
    granted: ModulePermissionGrant
    requested: ModulePermissionDeclaration
    revision: number
  }
  /** Current extension setup phase. */
  phase: 'failed' | 'ready' | 'setting-up' | 'stopped'
  /** Runtime used to choose manifest entrypoints. */
  runtime?: PluginRuntime
  /** Extension-session cleanup callbacks. */
  subscriptions: DisposableStore
}

type BoundAnnounceBindingInput<C extends HostDataRecord = HostDataRecord> = AnnounceBindingInput<C>

type BoundUpdateBindingInput<C extends HostDataRecord = HostDataRecord> = UpdateBindingInput<C>
interface ExtensionModuleResourceTracker {
  bindingIds: Set<string>
}

class PermissionDeniedError extends Error {
  readonly details: {
    action: string
    area: 'apis' | 'capabilities' | 'pipelines' | 'processors' | 'resources'
    key: string
  }

  constructor(details: PermissionDeniedError['details']) {
    super(`Permission denied: ${details.area}.${details.action} "${details.key}"`)
    this.name = 'PermissionDeniedError'
    this.details = details
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
  private readonly dependencies = new DependencyService()
  private readonly extensionModuleResources = new Map<string, ExtensionModuleResourceTracker>()
  private readonly extensionSessionService = new ExtensionSessionService<ExtensionSession>()
  private readonly installContext: ExtensionHostInstallContext
  private readonly kitApis = new Map<string, KitRef<unknown>>()
  private readonly kitApiWatchers = new Map<string, Set<() => Promise<void>>>()
  private readonly kits = new KitRegistryService()
  private readonly loader: FileSystemLoader
  private readonly modules = new KitApiBindingRegistryService()
  private readonly permissionResolver?: ExtensionHostOptions['permissionResolver']
  private readonly permissions = new PermissionService()
  private readonly persistedPermissionGrants = new Map<string, ModulePermissionGrant>()
  private readonly resources = new ResourceService()

  private readonly runtime: PluginRuntime

  constructor(options: ExtensionHostOptions = {}) {
    this.loader = new FileSystemLoader()
    this.runtime = options.runtime ?? 'electron'
    this.permissionResolver = options.permissionResolver
    this.resources.setValue(protocolListProvidersEventName, [] as Array<{ name: string }>)
    this.markCapabilityReady(protocolListProvidersEventName, { source: 'plugin-host' })
    this.installContext = this.createInstallContext()

    for (const contribution of options.contributions ?? []) {
      this.installContribution(contribution)
    }
  }

  activateBinding(sessionId: string, moduleId: string) {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)

    this.assertExtensionPermission(session, {
      action: 'invoke',
      area: 'apis',
      key: pluginBindingApiActivateEventName,
    })
    this.assertExtensionPermission(session, {
      action: 'write',
      area: 'resources',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module activation requires write access to kit \`${module.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.activate(session.id, session.extension.id, moduleId))
  }

  announceBinding<C extends HostDataRecord = HostDataRecord>(
    sessionId: string,
    input: BoundAnnounceBindingInput<C>,
  ): BindingRecord<C> {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const kit = this.assertKitAvailableForRuntime(input.kitId, session.runtime ?? this.runtime)

    this.assertExtensionPermission(session, {
      action: 'invoke',
      area: 'apis',
      key: pluginBindingApiAnnounceEventName,
    })
    this.assertExtensionPermission(session, {
      action: 'write',
      area: 'resources',
      key: getKitBindingResourceKey(kit.kitId),
      reason: `Module announce requires write access to kit \`${kit.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.bind({
      ...input,
      ownerExtensionId: session.extension.id,
      ownerSessionId: session.id,
      runtime: session.runtime ?? this.runtime,
    }) as BindingRecord<C>)
  }

  announceCapability(key: string, metadata?: Record<string, unknown>) {
    return this.dependencies.announce(key, metadata)
  }

  bindExtensionKitModule<C extends HostDataRecord = HostDataRecord>(
    sessionId: string,
    input: BoundAnnounceBindingInput<C>,
    permissionModuleId?: string,
  ): BindingRecord<C> {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const kit = this.assertKitAvailableForRuntime(input.kitId, this.runtime)

    this.assertExtensionPermission(session, {
      action: 'write',
      area: 'resources',
      key: getKitBindingResourceKey(kit.kitId),
      reason: `Module announce requires write access to kit \`${kit.kitId}\`.`,
    }, permissionModuleId)

    const binding = cloneBindingRecord(this.modules.bind({
      ...input,
      ownerExtensionId: session.extension.id,
      ownerSessionId: session.id,
      runtime: this.runtime,
    }) as BindingRecord<C>)

    if (permissionModuleId) {
      this.getOrCreateExtensionModuleResourceTracker(session.id, permissionModuleId).bindingIds.add(binding.moduleId)
    }

    return binding
  }

  degradeBinding(sessionId: string, moduleId: string) {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)
    this.assertExtensionPermission(session, {
      action: 'write',
      area: 'resources',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module degradation requires write access to kit \`${module.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.degrade(session.id, session.extension.id, moduleId))
  }

  getBinding(moduleId: string): BindingRecord<HostDataRecord> | undefined {
    const module = this.modules.get(moduleId)
    if (!module) {
      return undefined
    }

    return cloneBindingRecord(module)
  }

  getKit(kitId: string) {
    const kit = this.kits.get(kitId)
    if (!kit) {
      return undefined
    }

    return cloneKitDescriptor(kit)
  }

  getKitCapabilities(kitId: string): KitCapabilityDescriptor[] {
    const capabilities = this.kits.get(kitId)?.capabilities
    if (!capabilities) {
      return []
    }

    return cloneKitCapabilities(capabilities)
  }

  getSession(sessionId: string) {
    return this.extensionSessionService.get(sessionId)
  }

  isCapabilityReady(key: string) {
    return this.dependencies.isReady(key)
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

  listCapabilities() {
    return this.dependencies.list()
  }

  listKits(runtime?: PluginRuntime) {
    const kits = runtime
      ? this.kits.listByRuntime(runtime)
      : this.kits.list()

    return kits.map(kit => cloneKitDescriptor(kit))
  }

  listModules() {
    return this.extensionSessionService
      .list()
      .flatMap(session => [...session.modules.values()])
  }

  listSessions() {
    return this.extensionSessionService.list()
  }

  markCapabilityDegraded(key: string, metadata?: Record<string, unknown>) {
    return this.dependencies.markDegraded(key, metadata)
  }

  markCapabilityReady(key: string, metadata?: Record<string, unknown>) {
    return this.dependencies.markReady(key, metadata)
  }

  registerKit(kit: KitDescriptor) {
    return this.kits.register(kit)
  }

  registerKitApi<TClient>(kit: KitRef<TClient>) {
    this.kitApis.set(kit.id, kit as KitRef<unknown>)
    void this.notifyKitApiWatchers(kit.id)
    return kit
  }

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

  setResourceResolver<T>(key: string, resolver: () => Promise<T> | T) {
    this.resources.setResolver(key, resolver)
  }

  setResourceValue<T>(key: string, value: T) {
    this.resources.setValue(key, value)
  }

  async start(manifest: ExtensionManifestV1, options: ExtensionStartOptions = {}): Promise<ExtensionSession> {
    const extension = await this.loader.loadExtensionFor(manifest, {
      cwd: options.cwd,
      runtime: options.runtime,
    })

    const session = await this.startExtension(extension, {
      cwd: options.cwd,
      manifest,
      runtime: options.runtime,
    })

    return session
  }

  async startExtension(
    extension: Extension,
    options: { cwd?: string, manifest: ExtensionManifestV1, runtime?: PluginRuntime },
  ) {
    if (extension.id !== options.manifest.id) {
      throw new Error(`Extension entrypoint id \`${extension.id}\` must match manifest id \`${options.manifest.id}\`.`)
    }

    const sessionIdentity = this.extensionSessionService.nextSessionIdentity()
    const extensionIdentity = {
      id: extension.id,
      sessionId: sessionIdentity.sessionId,
      version: extension.version,
    }
    const persistedGrant = this.persistedPermissionGrants.get(extension.id)
    const resolvedGrant = await this.permissionResolver?.({
      identity: extensionIdentity,
      manifest: options.manifest,
      persisted: persistedGrant,
      requested: options.manifest.permissions,
    }) ?? options.manifest.permissions
    const permissionSnapshot = this.permissions.initialize(sessionIdentity.sessionId, options.manifest.permissions, {
      grant: resolvedGrant,
      persisted: this.permissionResolver ? undefined : persistedGrant,
    })
    this.persistedPermissionGrants.set(extension.id, permissionSnapshot.granted)
    const subscriptions = new DisposableStore()
    const session: ExtensionSession = {
      cwd: options.cwd,
      entrypoint: extension,
      extension: extensionIdentity,
      id: sessionIdentity.sessionId,
      manifest: options.manifest,
      modules: new Map(),
      permissions: {
        granted: permissionSnapshot.granted,
        requested: permissionSnapshot.requested,
        revision: permissionSnapshot.revision,
      },
      phase: 'setting-up',
      runtime: options.runtime,
      subscriptions,
    }

    this.extensionSessionService.register(session)

    const ctx: ExtensionSetupContext = {
      extension: session.extension,
      kits: this.createExtensionKitRegistry(session),
      modules: {
        register: async (input: RegisterExtensionModuleInput) => {
          if (session.modules.has(input.id)) {
            throw new Error(`Extension module \`${input.id}\` is already registered for session ${session.id}.`)
          }

          const moduleSubscriptions = new DisposableStore()
          const permissions = this.permissions.intersectGrant(
            session.permissions.granted,
            input.permissions ?? session.permissions.granted,
          )
          const module: ExtensionModuleContext = {
            dispose: async () => {
              await this.cleanupExtensionModuleResources(session, input.id)
              await moduleSubscriptions.dispose()
              session.modules.delete(input.id)
            },
            id: input.id,
            identity: {
              extension: session.extension,
              id: input.id,
              labels: input.labels,
            },
            kits: this.createModuleKitRegistry(session, moduleSubscriptions, input.id),
            permissions,
            subscriptions: moduleSubscriptions,
          }
          session.modules.set(module.id, module)
          return module
        },
      },
      subscriptions,
    }

    try {
      await extension.setup(ctx)
      session.phase = 'ready'
      return session
    }
    catch (error) {
      session.phase = 'failed'
      await this.cleanupExtensionSession(session)
      throw error
    }
  }

  async stop(sessionId: string): Promise<ExtensionSession | undefined> {
    const extensionSession = this.extensionSessionService.get(sessionId)
    if (!extensionSession) {
      return undefined
    }

    await this.cleanupExtensionSession(extensionSession)
    return extensionSession
  }

  unregisterKit(kitId: string) {
    return this.kits.remove(kitId)
  }

  unregisterKitApi(kitId: string) {
    const deleted = this.kitApis.delete(kitId)
    void this.notifyKitApiWatchers(kitId)
    return deleted
  }

  updateBinding<C extends HostDataRecord = HostDataRecord>(
    sessionId: string,
    moduleId: string,
    patch: Omit<UpdateBindingInput<C>, 'moduleId'> | UpdateBindingInput<C>,
  ) {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)

    this.assertExtensionPermission(session, {
      action: 'invoke',
      area: 'apis',
      key: pluginBindingApiUpdateEventName,
    })
    this.assertExtensionPermission(session, {
      action: 'write',
      area: 'resources',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module update requires write access to kit \`${module.kitId}\`.`,
    })

    const normalizedPatch = 'moduleId' in patch ? omitModuleId(patch) : patch
    return cloneBindingRecord(this.modules.update(session.id, session.extension.id, moduleId, normalizedPatch))
  }

  async waitForCapabilities(keys: string[], timeoutMs: number = 15000) {
    await this.dependencies.waitForMany(keys, timeoutMs)
  }

  async waitForCapability(key: string, timeoutMs: number = 15000) {
    return await this.dependencies.waitFor(key, timeoutMs)
  }

  withdrawBinding(sessionId: string, moduleId: string) {
    const session = this.getExtensionSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)

    this.assertExtensionPermission(session, {
      action: 'invoke',
      area: 'apis',
      key: pluginBindingApiWithdrawEventName,
    })
    this.assertExtensionPermission(session, {
      action: 'write',
      area: 'resources',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module withdrawal requires write access to kit \`${module.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.withdraw(session.id, session.extension.id, moduleId))
  }

  withdrawCapability(key: string, metadata?: Record<string, unknown>) {
    return this.dependencies.withdraw(key, metadata)
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
      action: input.action,
      area: input.area,
      key: input.key,
    })
  }

  private assertKitAvailableForRuntime(kitId: string, runtime: PluginRuntime) {
    const kit = this.kits.get(kitId)
    if (!kit) {
      throw new Error(`Kit \`${kitId}\` is not registered.`)
    }

    if (!kit.runtimes.includes(runtime)) {
      throw new Error(`Kit \`${kitId}\` is not available for runtime \`${runtime}\`.`)
    }

    return kit
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

  private async cleanupExtensionSession(session: ExtensionSession) {
    session.phase = 'stopped'

    for (const module of this.modules.listByOwner(session.id)) {
      this.modules.withdraw(session.id, session.extension.id, module.moduleId)
      this.modules.unbind(session.id, session.extension.id, module.moduleId)
    }
    await this.cleanupExtensionSessionModules(session)
    await session.subscriptions.dispose()
    this.extensionSessionService.remove(session.id)
  }

  private async cleanupExtensionSessionModules(session: ExtensionSession) {
    for (const module of [...session.modules.values()].reverse()) {
      await module.dispose()
    }
    session.modules.clear()
  }

  private createExtensionKitRegistry(session: ExtensionSession): ExtensionKitRegistry {
    return this.createKitRegistry(session, session.subscriptions)
  }

  private createInstallContext(): ExtensionHostInstallContext {
    return {
      announceCapability: (key, metadata) => {
        this.announceCapability(key, metadata)
      },
      markCapabilityDegraded: (key, metadata) => {
        this.markCapabilityDegraded(key, metadata)
      },
      markCapabilityReady: (key, metadata) => {
        this.markCapabilityReady(key, metadata)
      },
      registerKit: kit => this.registerKit(kit),
      setResourceResolver: (key, resolver) => this.setResourceResolver(key, resolver),
      setResourceValue: (key, value) => this.setResourceValue(key, value),
      unregisterKit: kitId => this.unregisterKit(kitId),
      withdrawCapability: (key, metadata) => {
        this.withdrawCapability(key, metadata)
      },
    }
  }

  private createKitRegistry(session: ExtensionSession, subscriptions: DisposableStore, moduleId?: string): ExtensionKitRegistry {
    return {
      tryUse: async <TClient>(kit: KitRef<TClient>) => {
        return this.resolveKitApi(session, kit, subscriptions, moduleId)
      },
      use: async <TClient>(kit: KitRef<TClient>) => {
        const result = this.resolveKitApi(session, kit, subscriptions, moduleId)
        if (result.ok) {
          return result.client
        }
        const failure = result as Extract<KitUseResult<TClient>, { ok: false }>
        throw failure.error
      },
      watch: <TClient>(kit: KitRef<TClient>, callback: (availability: KitAvailability<TClient>) => Promise<void> | void) => {
        const watchers = this.kitApiWatchers.get(kit.id) ?? new Set()
        let disposed = false
        const watcher = async () => {
          if (disposed) {
            return
          }

          const result = this.resolveKitApi(session, kit, subscriptions, moduleId)
          if (result.ok) {
            await callback({ available: true, client: result.client, kit })
            return
          }

          const failure = result as Extract<KitUseResult<TClient>, { ok: false }>
          await callback({ available: false, error: failure.error, kit, reason: failure.reason })
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

  private createModuleKitRegistry(session: ExtensionSession, subscriptions: DisposableStore, moduleId: string): ExtensionModuleContext['kits'] {
    return this.createKitRegistry(session, subscriptions, moduleId)
  }

  private getExtensionModuleResourceKey(sessionId: string, moduleId: string) {
    return `${sessionId}:${moduleId}`
  }

  private getExtensionSessionOrThrow(sessionId: string) {
    const session = this.extensionSessionService.get(sessionId)
    if (!session) {
      throw new Error(`Unknown extension session: ${sessionId}`)
    }

    return session
  }

  private getModuleOrThrow(moduleId: string) {
    const module = this.modules.get(moduleId)
    if (!module) {
      throw new Error(`Module \`${moduleId}\` was not found.`)
    }

    return module
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

  private installContribution(contribution: ExtensionHostContribution) {
    contribution.install(this.installContext)
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
    const registered = this.kitApis.get(kit.id) as KitRef<TClient> | undefined
    if (!registered) {
      return kitUseFailure(kit, 'missing-kit')
    }

    const grant = moduleId
      ? session.modules.get(moduleId)?.permissions
      : session.permissions.granted

    if (!grant || !this.permissions.grantAllows(grant, 'apis', 'invoke', kit.id)) {
      return kitUseFailure(kit, 'permission-denied')
    }

    return {
      client: registered.createClient({
        extensionId: session.extension.id,
        moduleId,
        sessionId: session.id,
        subscriptions,
      }),
      ok: true,
    }
  }
}

function cloneBindingRecord<C extends HostDataRecord>(module: BindingRecord<C>): BindingRecord<C> {
  return {
    ...module,
    config: cloneHostDataRecord(module.config),
  }
}

function cloneHostDataRecord<T extends HostDataRecord>(record: T): T {
  return cloneHostDataValue(record)
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

function cloneKitCapabilities(capabilities: KitCapabilityDescriptor[]): KitCapabilityDescriptor[] {
  return capabilities.map(capability => ({
    actions: [...capability.actions],
    key: capability.key,
  }))
}

function cloneKitDescriptor<TKit extends KitDescriptor>(kit: TKit): TKit {
  return {
    ...kit,
    capabilities: cloneKitCapabilities(kit.capabilities),
    runtimes: [...kit.runtimes],
  }
}

function omitModuleId<C extends HostDataRecord>(input: BoundUpdateBindingInput<C>) {
  return {
    config: input.config,
    state: input.state,
  }
}
