import type {
  Extension,
  ExtensionKitConsumer,
  ExtensionKitRegistry,
  ExtensionModuleContext,
  ExtensionSetupContext,
  RegisterExtensionModuleInput,
} from '../extension/shared'
import type {
  ConsumableKit,
  KitAvailability,
  KitCallContext,
  KitClientOf,
  KitContract,
  KitContractClient,
  KitProvider,
  KitProviderHandle,
  KitRef,
  KitUseResult,
  KitValue,
} from '../kit'
import type { AnnounceBindingInput, UpdateBindingInput } from '../plugin/apis/client/bindings'
import type { BindingRecord, KitCapabilityDescriptor, KitDescriptor } from './shared'
import type {
  ExtensionHostContribution,
  ExtensionHostInstallContext,
  ExtensionHostOptions,
  ExtensionHostPermissionRequest,
  ExtensionManifestV2,
  ExtensionStartOptions,
  HostDataRecord,
  HostDataValue,
  ModulePermissionDeclaration,
  ModulePermissionGrant,
  PluginRuntime,
} from './shared/types'

import semver from 'semver'

import { safeParse } from 'valibot'

import { DisposableStore } from '../extension/disposable'
import { defineKitContract, kitUseFailure } from '../kit'
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
import { errorMessageFromValue } from '../utils/error-message'
import { FileSystemLoader } from './runtimes/node/loaders'
import {
  DependencyService,
  ExtensionSessionService,
  KitApiBindingRegistryService,
  KitRegistryService,
  PermissionService,
  ResourceService,
} from './runtimes/shared'
import { hostDataValueSchema } from './shared/types'

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

type RegisteredKitKind = 'extension-hosted' | 'host-provided'

type RegisteredKitMethodHandler = (
  input: unknown,
  context: KitCallContext,
) => unknown | Promise<unknown>

interface RegisteredKitApi {
  kind: RegisteredKitKind
  kit: ConsumableKit
  clientRevokers: Set<KitClientRevoker>
  providerMethods?: ReadonlyMap<string, RegisteredKitMethodHandler>
  eventSubscribers: Map<string, Set<RegisteredKitEventSubscriber>>
  ownerSessionId?: string
  ownerExtensionId?: string
}

interface RegisteredKitEventSubscriber {
  consumerSessionId: string
  disposed: boolean
  deliveryQueue: Promise<void>
  listener: (payload: KitValue) => void | Promise<void>
}

type KitClientRevoker = () => Promise<void>

type ResolvedKitApiResult<TKit extends ConsumableKit> = Extract<KitUseResult<TKit>, { ok: false }> | {
  ok: true
  client: KitClientOf<TKit>
  registration: RegisteredKitApi
  release?: KitClientRevoker
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

/** Copies one validated Kit payload so neither Extension shares object identity. */
function cloneKitValue(value: unknown, source: string): KitValue {
  const result = safeParse(hostDataValueSchema, value)
  if (!result.success) {
    throw new TypeError(`${source} must be a KitValue.`)
  }

  return cloneHostDataValue(result.output)
}

function isKitContract(kit: ConsumableKit): kit is KitContract {
  return 'methods' in kit && 'events' in kit
}

/** Captures a stable Host-owned handler table without retaining Provider accessors. */
function captureKitProviderMethods<TContract extends KitContract>(
  kit: TContract,
  provider: KitProvider<TContract>,
): ReadonlyMap<string, RegisteredKitMethodHandler> {
  if (!provider) {
    throw new TypeError(`Kit \`${kit.id}\` Provider methods must be an object.`)
  }

  let methods: unknown
  try {
    methods = provider.methods
  }
  catch (error) {
    throw new TypeError(
      `Kit \`${kit.id}\` Provider methods could not be read: ${errorMessageFromValue(error)}`,
    )
  }
  if (!methods || typeof methods !== 'object' || Array.isArray(methods)) {
    throw new TypeError(`Kit \`${kit.id}\` Provider methods must be an object.`)
  }

  let enumerableMethodNames: string[]
  try {
    enumerableMethodNames = Object.keys(methods)
  }
  catch (error) {
    throw new TypeError(
      `Kit \`${kit.id}\` Provider methods could not be inspected: ${errorMessageFromValue(error)}`,
    )
  }

  const declaredMethodNames = Object.keys(kit.methods)
  const handlers = new Map<string, RegisteredKitMethodHandler>()
  for (const methodName of declaredMethodNames) {
    let ownsMethod: boolean
    let handler: unknown
    try {
      ownsMethod = Object.hasOwn(methods, methodName)
      handler = ownsMethod ? Reflect.get(methods, methodName, methods) : undefined
    }
    catch (error) {
      throw new TypeError(
        `Kit \`${kit.id}\` Provider method \`${methodName}\` could not be read: ${errorMessageFromValue(error)}`,
      )
    }

    if (!ownsMethod || typeof handler !== 'function') {
      throw new TypeError(`Kit \`${kit.id}\` Provider does not implement method \`${methodName}\`.`)
    }
    handlers.set(methodName, handler as RegisteredKitMethodHandler)
  }

  for (const methodName of enumerableMethodNames) {
    if (!Object.hasOwn(kit.methods, methodName)) {
      throw new TypeError(`Kit \`${kit.id}\` Provider implements undeclared method \`${methodName}\`.`)
    }
  }

  return handlers
}

function hasSameKitContractSurface(consumer: KitContract, provider: KitContract) {
  const consumerMethods = Object.keys(consumer.methods).sort()
  const providerMethods = Object.keys(provider.methods).sort()
  const consumerEvents = Object.keys(consumer.events).sort()
  const providerEvents = Object.keys(provider.events).sort()

  return consumerMethods.length === providerMethods.length
    && consumerMethods.every((name, index) => name === providerMethods[index])
    && consumerEvents.length === providerEvents.length
    && consumerEvents.every((name, index) => name === providerEvents[index])
}

function cloneHostDataRecord<T extends HostDataRecord>(record: T): T {
  return cloneHostDataValue(record)
}

function cloneKitCapabilities(capabilities: KitCapabilityDescriptor[]): KitCapabilityDescriptor[] {
  return capabilities.map(capability => ({
    key: capability.key,
    actions: [...capability.actions],
  }))
}

function cloneKitDescriptor<TKit extends KitDescriptor>(kit: TKit): TKit {
  return {
    ...kit,
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

function createTrackedClientRevoker(
  revokers: Set<KitClientRevoker>,
  releaseClient: () => void | Promise<void>,
): KitClientRevoker {
  let release: (() => void | Promise<void>) | undefined = releaseClient
  let pendingRelease: Promise<void> | undefined
  const revoke = async () => {
    revokers.delete(revoke)
    if (!pendingRelease && release) {
      const releaseOnce = release
      release = undefined
      try {
        pendingRelease = Promise.resolve(releaseOnce())
      }
      catch (error) {
        pendingRelease = Promise.reject(error)
      }
    }

    const currentRelease = pendingRelease
    if (!currentRelease) {
      return
    }
    try {
      await currentRelease
    }
    finally {
      if (pendingRelease === currentRelease) {
        pendingRelease = undefined
      }
    }
  }
  return revoke
}

async function disposeKitClients(revokers: Set<KitClientRevoker>) {
  const clientDisposables = new DisposableStore()
  for (const revoke of revokers) {
    clientDisposables.add({ dispose: revoke })
  }
  revokers.clear()
  await clientDisposables.dispose()
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
  private readonly kits = new KitRegistryService()
  private readonly kitApis = new Map<string, RegisteredKitApi>()
  private readonly pendingExtensionKitApis = new Map<string, RegisteredKitApi>()
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

  private assertRequiredKitsAvailable(manifest: ExtensionManifestV2) {
    for (const declaration of manifest.kits?.uses ?? []) {
      if (declaration.optional) {
        continue
      }

      const registration = this.kitApis.get(declaration.id)
      if (!registration || !this.isKitRegistrationCurrent(declaration.id, registration)) {
        throw new Error(
          `Extension \`${manifest.id}\` requires Kit \`${declaration.id}\` at version \`${declaration.version}\`, but no active Provider is available.`,
        )
      }
      if (registration.kit.version !== declaration.version) {
        throw new Error(
          `Extension \`${manifest.id}\` requires Kit \`${declaration.id}\` at version \`${declaration.version}\`, but the active Provider implements \`${registration.kit.version}\`.`,
        )
      }
    }
  }

  private assertProvidedKitSlotsAvailable(manifest: ExtensionManifestV2) {
    for (const declaration of manifest.kits?.provides ?? []) {
      if (this.kitApis.has(declaration.id) || this.pendingExtensionKitApis.has(declaration.id) || this.kits.has(declaration.id)) {
        throw new Error(`Kit API \`${declaration.id}\` already has an active Provider.`)
      }
    }
  }

  async startExtension(
    extension: Extension,
    options: { manifest: ExtensionManifestV2, cwd?: string, runtime?: PluginRuntime },
  ) {
    const runtime = options.runtime ?? this.runtime
    this.assertManifestCompatibility(options.manifest, runtime)
    this.assertProvidedKitSlotsAvailable(options.manifest)

    if (extension.id !== options.manifest.id) {
      throw new Error(`Extension entrypoint id \`${extension.id}\` must match manifest id \`${options.manifest.id}\`.`)
    }
    this.assertRequiredKitsAvailable(options.manifest)

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
    const permissionSnapshot = this.permissions.initialize(sessionIdentity.sessionId, options.manifest.permissions, {
      grant: resolvedGrant,
      persisted: this.permissionResolver ? undefined : persistedGrant,
    })
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

    this.extensionSessionService.register(session)

    const ctx: ExtensionSetupContext = {
      extension: session.extension,
      kits: this.createExtensionKitRegistry(session),
      subscriptions,
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
              await this.cleanupExtensionModuleResources(session, input.id)
              await moduleSubscriptions.dispose()
              session.modules.delete(input.id)
            },
          }
          session.modules.set(module.id, module)
          return module
        },
      },
    }

    try {
      await extension.setup(ctx)
      this.assertDeclaredKitsProvided(session)
      session.phase = 'ready'
      await this.publishExtensionKits(session)
      return session
    }
    catch (error) {
      session.phase = 'failed'
      await this.cleanupExtensionSession(session)
      throw error
    }
  }

  listModules() {
    return this.extensionSessionService
      .list()
      .flatMap(session => [...session.modules.values()])
  }

  registerKitApi<TClient>(kit: KitRef<TClient>) {
    if (this.kitApis.has(kit.id) || this.pendingExtensionKitApis.has(kit.id)) {
      throw new Error(`Kit API \`${kit.id}\` already has an active Provider.`)
    }

    this.kitApis.set(kit.id, {
      kind: 'host-provided',
      kit: kit as KitRef<unknown>,
      clientRevokers: new Set(),
      eventSubscribers: new Map(),
    })
    this.notifyKitApiWatchers(kit.id)
    return kit
  }

  async unregisterKitApi(kitId: string) {
    const registration = this.kitApis.get(kitId)
    const deleted = this.kitApis.delete(kitId)
    try {
      if (registration) {
        await disposeKitClients(registration.clientRevokers)
      }
    }
    finally {
      this.notifyKitApiWatchers(kitId)
    }
    return deleted
  }

  private provideExtensionKit<TContract extends KitContract>(
    session: ExtensionSession,
    kit: TContract,
    provider: KitProvider<TContract>,
  ): KitProviderHandle<TContract> {
    defineKitContract(kit)
    if (session.phase !== 'setting-up') {
      throw new Error(`Extension \`${session.extension.id}\` can provide Kits only during setup.`)
    }

    const declaration = session.manifest.kits?.provides?.find(candidate => candidate.id === kit.id)
    if (!declaration) {
      throw new Error(`Extension \`${session.extension.id}\` cannot provide undeclared Kit \`${kit.id}\`.`)
    }

    if (declaration.version !== kit.version) {
      throw new Error(
        `Extension \`${session.extension.id}\` declares Kit \`${kit.id}\` at version \`${declaration.version}\`, but provides \`${kit.version}\`.`,
      )
    }

    const allowedExposePolicies = kit.allowedExposePolicies ?? [kit.defaultExposePolicy ?? 'local-only']
    if (!allowedExposePolicies.includes(declaration.exposure)) {
      throw new Error(
        `Extension \`${session.extension.id}\` cannot expose Kit \`${kit.id}\` as \`${declaration.exposure}\`.`,
      )
    }

    if (this.kitApis.has(kit.id) || this.pendingExtensionKitApis.has(kit.id) || this.kits.has(kit.id)) {
      throw new Error(`Kit API \`${kit.id}\` already has an active Provider.`)
    }

    const providerMethods = captureKitProviderMethods(kit, provider)

    const registration: RegisteredKitApi = {
      kind: 'extension-hosted',
      kit,
      clientRevokers: new Set(),
      providerMethods,
      eventSubscribers: new Map(),
      ownerSessionId: session.id,
      ownerExtensionId: session.extension.id,
    }
    this.pendingExtensionKitApis.set(kit.id, registration)

    const disposable = session.subscriptions.add({
      dispose: async () => {
        const isPending = this.pendingExtensionKitApis.get(kit.id) === registration
        const isActive = this.kitApis.get(kit.id) === registration
        if (!isPending && !isActive) {
          return
        }

        if (isPending) {
          this.pendingExtensionKitApis.delete(kit.id)
        }
        if (isActive) {
          this.kitApis.delete(kit.id)
          this.kits.remove(kit.id)
        }
        try {
          await disposeKitClients(registration.clientRevokers)
        }
        finally {
          registration.eventSubscribers.clear()
          if (isActive) {
            this.notifyKitApiWatchers(kit.id)
          }
        }
      },
    })

    return {
      dispose: disposable.dispose,
      emit: (event, payload) => {
        this.emitKitEvent(registration, event, payload)
      },
    }
  }

  private async publishExtensionKits(session: ExtensionSession) {
    const registrations = [...this.pendingExtensionKitApis.values()]
      .filter(registration => registration.ownerSessionId === session.id)

    for (const registration of registrations) {
      this.pendingExtensionKitApis.delete(registration.kit.id)
      this.kits.register({
        kitId: registration.kit.id,
        version: registration.kit.version,
        runtimes: session.manifest.engines.runtimes,
        capabilities: [],
      })
      this.kitApis.set(registration.kit.id, registration)
      this.notifyKitApiWatchers(registration.kit.id)
    }
  }

  private assertDeclaredKitsProvided(session: ExtensionSession) {
    const providedKitIds = new Set(
      [...this.pendingExtensionKitApis.values()]
        .filter(registration => registration.ownerSessionId === session.id)
        .map(registration => registration.kit.id),
    )

    for (const declaration of session.manifest.kits?.provides ?? []) {
      if (!providedKitIds.has(declaration.id)) {
        throw new Error(
          `Extension \`${session.extension.id}\` did not provide declared Kit \`${declaration.id}\`.`,
        )
      }
    }
  }

  private async cleanupExtensionSessionModules(session: ExtensionSession) {
    for (const module of [...session.modules.values()].reverse()) {
      await module.dispose()
    }
    session.modules.clear()
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

  private notifyKitApiWatchers(kitId: string) {
    const watchers = this.kitApiWatchers.get(kitId)
    if (!watchers?.size) {
      return
    }

    for (const watcher of watchers) {
      void this.runKitApiWatcher(watcher)
    }
  }

  private async runKitApiWatcher(watcher: () => Promise<void>) {
    try {
      await watcher()
    }
    catch {
      // A Consumer owns its callback. Its failure must not interrupt Provider
      // publication, teardown, or notifications for other Consumers.
    }
  }

  private isKitRegistrationReady(registration: RegisteredKitApi) {
    if (!registration.ownerSessionId) {
      return true
    }
    return this.extensionSessionService.get(registration.ownerSessionId)?.phase === 'ready'
  }

  private isKitRegistrationCurrent(kitId: string, registration: RegisteredKitApi) {
    return this.kitApis.get(kitId) === registration && this.isKitRegistrationReady(registration)
  }

  private createKitCallContext(
    session: ExtensionSession,
    subscriptions: DisposableStore,
    moduleId?: string,
  ): KitCallContext {
    return {
      consumerExtensionId: session.extension.id,
      consumerSessionId: session.id,
      consumerModuleId: moduleId,
      subscriptions,
    }
  }

  private createHostKitClientRuntime(
    session: ExtensionSession,
    subscriptions: DisposableStore,
    moduleId?: string,
  ) {
    return {
      extensionId: session.extension.id,
      sessionId: session.id,
      moduleId,
      subscriptions,
    }
  }

  private subscribeKitEvent(
    registration: RegisteredKitApi,
    eventName: string,
    session: ExtensionSession,
    subscriptions: DisposableStore,
    listener: (payload: KitValue) => void | Promise<void>,
  ) {
    if (typeof listener !== 'function') {
      throw new TypeError(`Kit event \`${registration.kit.id}.${eventName}\` listener must be a function.`)
    }
    if (!isKitContract(registration.kit) || !Object.hasOwn(registration.kit.events, eventName)) {
      throw new Error(`Kit \`${registration.kit.id}\` does not declare event \`${eventName}\`.`)
    }
    if (!this.isKitRegistrationCurrent(registration.kit.id, registration)) {
      throw new Error(`Kit \`${registration.kit.id}\` Provider is not available.`)
    }

    const subscribers = registration.eventSubscribers.get(eventName) ?? new Set()
    const subscriber: RegisteredKitEventSubscriber = {
      consumerSessionId: session.id,
      disposed: false,
      deliveryQueue: Promise.resolve(),
      listener,
    }
    subscribers.add(subscriber)
    registration.eventSubscribers.set(eventName, subscribers)

    const subscription = {
      dispose: () => {
        if (subscriber.disposed) {
          return
        }

        subscriber.disposed = true
        subscribers.delete(subscriber)
        if (subscribers.size === 0) {
          registration.eventSubscribers.delete(eventName)
        }
      },
    }
    subscriptions.add(subscription)
    return subscription
  }

  private emitKitEvent(
    registration: RegisteredKitApi,
    eventName: string,
    payload: unknown,
  ) {
    if (!isKitContract(registration.kit) || !Object.hasOwn(registration.kit.events, eventName)) {
      throw new Error(`Kit \`${registration.kit.id}\` does not declare event \`${eventName}\`.`)
    }
    if (!this.isKitRegistrationCurrent(registration.kit.id, registration)) {
      throw new Error(`Kit \`${registration.kit.id}\` Provider is not available.`)
    }

    const eventPayload = cloneKitValue(payload, `Kit event \`${registration.kit.id}.${eventName}\` payload`)
    for (const subscriber of registration.eventSubscribers.get(eventName) ?? []) {
      const delivery = subscriber.deliveryQueue.then(async () => {
        if (subscriber.disposed || !this.isKitRegistrationCurrent(registration.kit.id, registration)) {
          return
        }

        await subscriber.listener(cloneHostDataValue(eventPayload))
      })
      subscriber.deliveryQueue = delivery.catch(() => {})
    }
  }

  private createExtensionKitClient<TContract extends KitContract>(
    contract: TContract,
    registration: RegisteredKitApi,
    session: ExtensionSession,
    subscriptions: DisposableStore,
    moduleId?: string,
  ): KitContractClient<TContract> {
    const client = Object.create(null) as Record<string, unknown>
    const callContext = this.createKitCallContext(session, subscriptions, moduleId)

    for (const methodName of Object.keys(contract.methods)) {
      client[methodName] = async (input?: unknown) => {
        if (!this.isKitRegistrationCurrent(contract.id, registration)) {
          throw new Error(`Kit \`${contract.id}\` Provider is not available.`)
        }

        const handler = registration.providerMethods?.get(methodName)
        if (!handler) {
          throw new Error(`Kit \`${contract.id}\` Provider does not implement method \`${methodName}\`.`)
        }

        const providerInput = input === undefined
          ? undefined
          : cloneKitValue(input, `Kit method \`${contract.id}.${methodName}\` input`)
        let output: unknown
        try {
          output = await handler(providerInput, callContext)
        }
        catch (error) {
          throw new Error(
            `Kit method \`${contract.id}.${methodName}\` failed: ${errorMessageFromValue(error)}`,
          )
        }

        if (!this.isKitRegistrationCurrent(contract.id, registration)) {
          throw new Error(`Kit \`${contract.id}\` Provider stopped before method \`${methodName}\` completed.`)
        }

        return cloneKitValue(output, `Kit method \`${contract.id}.${methodName}\` output`)
      }
    }

    for (const eventName of Object.keys(contract.events)) {
      client[eventName] = {
        subscribe: (listener: (payload: KitValue) => void | Promise<void>) => {
          return this.subscribeKitEvent(registration, eventName, session, subscriptions, listener)
        },
      }
    }

    return client as KitContractClient<TContract>
  }

  private async resolveKitApi<TKit extends ConsumableKit>(
    session: ExtensionSession,
    kit: TKit,
    subscriptions: DisposableStore,
    moduleId?: string,
  ): Promise<ResolvedKitApiResult<TKit>> {
    if (isKitContract(kit)) {
      defineKitContract(kit)
    }

    const registered = this.kitApis.get(kit.id)
    if (!registered) {
      return kitUseFailure(kit, 'missing-kit')
    }

    if (registered.kit.version !== kit.version) {
      return kitUseFailure(kit, 'incompatible-version')
    }

    const requestedKind: RegisteredKitKind = isKitContract(kit) ? 'extension-hosted' : 'host-provided'
    if (registered.kind !== requestedKind) {
      return kitUseFailure(kit, 'incompatible-version')
    }

    if (!this.isKitRegistrationCurrent(kit.id, registered)) {
      return kitUseFailure(kit, 'missing-kit')
    }

    if (registered.ownerSessionId) {
      const declaration = session.manifest.kits?.uses?.find(candidate => candidate.id === kit.id)
      if (!declaration) {
        return kitUseFailure(kit, 'permission-denied')
      }

      if (declaration.version !== registered.kit.version) {
        return kitUseFailure(kit, 'incompatible-version')
      }
    }

    const grant = moduleId
      ? session.modules.get(moduleId)?.permissions
      : session.permissions.granted

    if (!grant || !this.permissions.grantAllows(grant, 'apis', 'invoke', kit.id)) {
      return kitUseFailure(kit, 'permission-denied')
    }

    if (registered.kind === 'host-provided') {
      if (isKitContract(registered.kit)) {
        return kitUseFailure(kit, 'incompatible-version')
      }

      const client = registered.kit.createClient(
        this.createHostKitClientRuntime(session, subscriptions, moduleId),
      ) as KitClientOf<TKit>
      return { ok: true, client, registration: registered }
    }

    if (
      !isKitContract(kit)
      || !isKitContract(registered.kit)
      || !registered.providerMethods
      || !hasSameKitContractSurface(kit, registered.kit)
    ) {
      return kitUseFailure(kit, 'incompatible-version')
    }

    const clientSubscriptions = new DisposableStore()
    const client = this.createExtensionKitClient(
      kit,
      registered,
      session,
      clientSubscriptions,
      moduleId,
    ) as KitClientOf<TKit>
    const revoke = createTrackedClientRevoker(registered.clientRevokers, async () => {
      await clientSubscriptions.dispose()
    })
    registered.clientRevokers.add(revoke)
    subscriptions.add({ dispose: revoke })

    if (!this.isKitRegistrationCurrent(kit.id, registered)) {
      await revoke()
      return kitUseFailure(kit, 'missing-kit')
    }

    return {
      ok: true,
      client,
      registration: registered,
      release: revoke,
    }
  }

  private async recheckKitResult<TKit extends ConsumableKit>(
    kit: TKit,
    result: ResolvedKitApiResult<TKit>,
  ): Promise<ResolvedKitApiResult<TKit>> {
    if (!result.ok || this.isKitRegistrationCurrent(kit.id, result.registration)) {
      return result
    }

    await result.release?.()
    return kitUseFailure(kit, 'missing-kit')
  }

  private createKitConsumer(session: ExtensionSession, subscriptions: DisposableStore, moduleId?: string): ExtensionKitConsumer {
    return {
      use: async <TKit extends ConsumableKit>(kit: TKit) => {
        const result = await this.recheckKitResult(
          kit,
          await this.resolveKitApi(session, kit, subscriptions, moduleId),
        )
        if (result.ok) {
          return result.client
        }

        throw result.error
      },
      tryUse: async <TKit extends ConsumableKit>(kit: TKit) => {
        const result = await this.recheckKitResult(
          kit,
          await this.resolveKitApi(session, kit, subscriptions, moduleId),
        )
        return result.ok ? { ok: true, client: result.client } : result
      },
      watch: <TKit extends ConsumableKit>(kit: TKit, callback: (availability: KitAvailability<TKit>) => void | Promise<void>) => {
        const watchers = this.kitApiWatchers.get(kit.id) ?? new Set()
        let disposed = false
        let latestDeliveryId = 0
        let deliveryQueue = Promise.resolve()
        const watcher = async () => {
          if (disposed) {
            return
          }

          const deliveryId = ++latestDeliveryId
          const delivery = deliveryQueue.then(async () => {
            if (disposed || deliveryId !== latestDeliveryId) {
              return
            }

            const result = await this.recheckKitResult(
              kit,
              await this.resolveKitApi(session, kit, subscriptions, moduleId),
            )
            const availability: KitAvailability<TKit> = result.ok
              ? { available: true, kit, client: result.client }
              : {
                  available: false,
                  kit,
                  reason: result.reason,
                  error: result.error,
                }
            await callback(availability)
          })
          deliveryQueue = delivery.catch(() => {})
          await delivery
        }
        watchers.add(watcher)
        this.kitApiWatchers.set(kit.id, watchers)
        void this.runKitApiWatcher(watcher)
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

  private createExtensionKitRegistry(session: ExtensionSession): ExtensionKitRegistry {
    return {
      ...this.createKitConsumer(session, session.subscriptions),
      provide: <TContract extends KitContract>(contract: TContract, provider: KitProvider<TContract>) => {
        return this.provideExtensionKit(session, contract, provider)
      },
    }
  }

  private createModuleKitRegistry(session: ExtensionSession, subscriptions: DisposableStore, moduleId: string): ExtensionModuleContext['kits'] {
    return this.createKitConsumer(session, subscriptions, moduleId)
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
      unregisterKit: kitId => this.unregisterKit(kitId),
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

  private async cleanupExtensionSession(session: ExtensionSession) {
    session.phase = 'stopped'

    const errors: unknown[] = []
    try {
      for (const module of this.modules.listByOwner(session.id)) {
        this.modules.withdraw(session.id, session.extension.id, module.moduleId)
        this.modules.unbind(session.id, session.extension.id, module.moduleId)
      }
      await this.cleanupExtensionSessionModules(session)
    }
    catch (error) {
      errors.push(error)
    }
    try {
      await session.subscriptions.dispose()
    }
    catch (error) {
      errors.push(error)
    }
    this.extensionSessionService.remove(session.id)

    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, `Extension session ${session.id} had multiple cleanup failures.`)
    }
  }

  private getModuleOrThrow(moduleId: string) {
    const module = this.modules.get(moduleId)
    if (!module) {
      throw new Error(`Module \`${moduleId}\` was not found.`)
    }

    return module
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

  listSessions() {
    return this.extensionSessionService.list()
  }

  getSession(sessionId: string) {
    return this.extensionSessionService.get(sessionId)
  }

  registerKit(kit: KitDescriptor) {
    if (this.pendingExtensionKitApis.has(kit.kitId)) {
      throw new Error(`Kit \`${kit.kitId}\` already has a pending Extension Provider.`)
    }
    return this.kits.register(kit)
  }

  unregisterKit(kitId: string) {
    return this.kits.remove(kitId)
  }

  getKit(kitId: string) {
    const kit = this.kits.get(kitId)
    if (!kit) {
      return undefined
    }

    return cloneKitDescriptor(kit)
  }

  listKits(runtime?: PluginRuntime) {
    const kits = runtime
      ? this.kits.listByRuntime(runtime)
      : this.kits.list()

    return kits.map(kit => cloneKitDescriptor(kit))
  }

  getKitCapabilities(kitId: string): KitCapabilityDescriptor[] {
    const capabilities = this.kits.get(kitId)?.capabilities
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
    this.assertProvidedKitSlotsAvailable(manifest)
    this.assertRequiredKitsAvailable(manifest)
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

  async stop(sessionId: string): Promise<ExtensionSession | undefined> {
    const extensionSession = this.extensionSessionService.get(sessionId)
    if (!extensionSession) {
      return undefined
    }

    await this.cleanupExtensionSession(extensionSession)
    return extensionSession
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
}
