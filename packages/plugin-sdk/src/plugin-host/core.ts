import type { ActorRefFrom } from 'xstate'

import type {
  Extension,
  ExtensionKitRegistry,
  ExtensionModuleContext,
  ExtensionSetupContext,
  RegisterExtensionModuleInput,
} from '../extension/shared'
import type { KitAvailability, KitRef, KitUseResult } from '../kit'
import type { createApis } from '../plugin/apis/client'
import type { AnnounceBindingInput, UpdateBindingInput } from '../plugin/apis/client/bindings'
import type { RegisterToolInput, RegisterToolsetPromptInput } from '../plugin/apis/client/tools'
import type { Plugin } from '../plugin/shared'
import type { BindingRecord, KitCapabilityDescriptor, KitDescriptor } from './shared'
import type {
  ExtensionHostContribution,
  ExtensionHostInstallContext,
  ExtensionHostLifecycleEvent,
  ExtensionHostLifecycleHook,
  ExtensionHostOptions,
  ExtensionHostPermissionRequest,
  ExtensionHostSessionContext,
  ExtensionLoadOptions,
  ExtensionManifestV1,
  ExtensionStartOptions,
  HostDataRecord,
  HostDataValue,
  ModuleCompatibilityRequest,
  ModuleConfigEnvelope,
  ModuleIdentity,
  ModulePermissionDeclaration,
  ModulePermissionGrant,
  PluginRuntime,
  PluginSessionApiFactory,
  PluginSessionPhase,
} from './shared/types'
import type { PluginTransport } from './transports'

import { cwd } from 'node:process'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import {
  errorPermission,
  moduleAnnounce,
  moduleAuthenticate,
  moduleAuthenticated,
  moduleCompatibilityRequest,
  moduleCompatibilityResult,
  moduleConfigurationConfigured,
  moduleConfigurationNeeded,
  modulePermissionsCurrent,
  modulePermissionsDeclare,
  modulePermissionsDenied,
  modulePermissionsGranted,
  modulePermissionsRequest,
  modulePrepared,
  moduleStatus,
  registryModulesSync,
} from '@proj-airi/plugin-protocol/types'
import { createActor, createMachine } from 'xstate'

import { DisposableStore } from '../extension/disposable'
import { kitUseFailure } from '../kit'
import { createApis as createBoundApis } from '../plugin/apis/client'
import {
  getKitBindingResourceKey,
  pluginBindingApiActivateEventName,
  pluginBindingApiAnnounceEventName,
  pluginBindingApiListEventName,
  pluginBindingApiUpdateEventName,
  pluginBindingApiWithdrawEventName,
  pluginBindingRegistryResourceKey,
} from '../plugin/apis/client/bindings'
import {
  pluginKitApiGetCapabilitiesEventName,
  pluginKitApiListEventName,
  pluginKitRegistryResourceKey,
} from '../plugin/apis/client/kits'
import {
  pluginToolApiRegisterEventName,
  pluginToolRegistryResourceKey,

} from '../plugin/apis/client/tools'
import {
  protocolCapabilitySnapshot,
  protocolCapabilitySnapshotEventName,
  protocolCapabilityWait,
  protocolCapabilityWaitEventName,
} from '../plugin/apis/protocol'
import {
  protocolListProvidersEventName,
  protocolProviders,
} from '../plugin/apis/protocol/resources/providers'
import { createPluginContext } from './runtimes/node'
import { FileSystemLoader } from './runtimes/node/loaders'
import {
  DependencyService,
  ExtensionSessionService,
  KitApiBindingRegistryService,
  KitRegistryService,
  PermissionService,
  ResourceService,
  ToolRegistryService,
} from './runtimes/shared'

/**
 * Extension host lifecycle overview.
 *
 * The host owns transport setup, manifest validation, session lifecycle,
 * extension-level permission grants, and module cleanup. Extension code uses
 * `setup(ctx)` as the common authoring entrypoint and requests host-installed
 * kits through `ctx.kits`. Explicit modules are optional lifecycle and
 * attribution scopes that can narrow kit usage through `module.kits`.
 *
 * Permission checks are intentionally two-layered: the extension grant is the
 * package/session ceiling. Extension-scoped kit usage is checked against that
 * ceiling directly; module-scoped kit usage is checked against the module grant
 * derived from `extension grant intersection module request`.
 */

type PluginLifecycleEvent
  = | { type: 'SESSION_LOADED' }
    | { type: 'START_AUTHENTICATION' }
    | { type: 'AUTHENTICATED' }
    | { type: 'ANNOUNCED' }
    | { type: 'START_PREPARING' }
    | { type: 'WAITING_DEPENDENCIES' }
    | { type: 'PREPARED' }
    | { type: 'CONFIGURATION_NEEDED' }
    | { type: 'CONFIGURED' }
    | { type: 'READY' }
    | { type: 'SESSION_FAILED' }
    | { type: 'REANNOUNCE' }
    | { type: 'STOP' }

const pluginLifecycleMachine = createMachine({
  id: 'plugin-lifecycle',
  initial: 'loading',
  states: {
    'loading': {
      on: {
        SESSION_LOADED: 'loaded',
        SESSION_FAILED: 'failed',
      },
    },
    'loaded': {
      on: {
        START_AUTHENTICATION: 'authenticating',
        STOP: 'stopped',
        SESSION_FAILED: 'failed',
      },
    },
    'authenticating': {
      on: {
        AUTHENTICATED: 'authenticated',
        SESSION_FAILED: 'failed',
      },
    },
    'authenticated': {
      on: {
        ANNOUNCED: 'announced',
        SESSION_FAILED: 'failed',
      },
    },
    'announced': {
      on: {
        START_PREPARING: 'preparing',
        CONFIGURATION_NEEDED: 'configuration-needed',
        STOP: 'stopped',
        SESSION_FAILED: 'failed',
      },
    },
    'preparing': {
      on: {
        WAITING_DEPENDENCIES: 'waiting-deps',
        PREPARED: 'prepared',
        SESSION_FAILED: 'failed',
      },
    },
    'waiting-deps': {
      on: {
        PREPARED: 'prepared',
        SESSION_FAILED: 'failed',
      },
    },
    'prepared': {
      on: {
        CONFIGURATION_NEEDED: 'configuration-needed',
        CONFIGURED: 'configured',
        SESSION_FAILED: 'failed',
      },
    },
    'configuration-needed': {
      on: {
        CONFIGURED: 'configured',
        SESSION_FAILED: 'failed',
      },
    },
    'configured': {
      on: {
        READY: 'ready',
        SESSION_FAILED: 'failed',
      },
    },
    'ready': {
      on: {
        REANNOUNCE: 'announced',
        CONFIGURATION_NEEDED: 'configuration-needed',
        STOP: 'stopped',
        SESSION_FAILED: 'failed',
      },
    },
    'failed': {
      on: {
        STOP: 'stopped',
      },
    },
    'stopped': {
      type: 'final',
    },
  },
})

const lifecycleTransitionEvents: Record<PluginSessionPhase, Partial<Record<PluginSessionPhase, PluginLifecycleEvent['type']>>> = {
  'loading': { loaded: 'SESSION_LOADED', failed: 'SESSION_FAILED' },
  'loaded': { authenticating: 'START_AUTHENTICATION', stopped: 'STOP', failed: 'SESSION_FAILED' },
  'authenticating': { authenticated: 'AUTHENTICATED', failed: 'SESSION_FAILED' },
  'authenticated': { announced: 'ANNOUNCED', failed: 'SESSION_FAILED' },
  'announced': { 'preparing': 'START_PREPARING', 'configuration-needed': 'CONFIGURATION_NEEDED', 'failed': 'SESSION_FAILED', 'stopped': 'STOP' },
  'preparing': { 'waiting-deps': 'WAITING_DEPENDENCIES', 'prepared': 'PREPARED', 'failed': 'SESSION_FAILED' },
  'waiting-deps': { prepared: 'PREPARED', failed: 'SESSION_FAILED' },
  'prepared': { 'configuration-needed': 'CONFIGURATION_NEEDED', 'configured': 'CONFIGURED', 'failed': 'SESSION_FAILED' },
  'configuration-needed': { configured: 'CONFIGURED', failed: 'SESSION_FAILED' },
  'configured': { ready: 'READY', failed: 'SESSION_FAILED' },
  'ready': { 'announced': 'REANNOUNCE', 'configuration-needed': 'CONFIGURATION_NEEDED', 'failed': 'SESSION_FAILED', 'stopped': 'STOP' },
  'failed': { stopped: 'STOP' },
  'stopped': {},
}

function assertTransition(session: ExtensionHostSession, to: PluginSessionPhase) {
  const eventType = lifecycleTransitionEvents[session.phase][to]
  if (!eventType) {
    throw new Error(`Invalid plugin lifecycle transition: ${session.phase} -> ${to} for module ${session.identity.id}`)
  }

  const event: PluginLifecycleEvent = { type: eventType }
  const snapshot = session.lifecycle.getSnapshot()
  if (!snapshot.can(event)) {
    throw new Error(`Invalid plugin lifecycle transition: ${session.phase} -> ${to} for module ${session.identity.id}`)
  }

  session.lifecycle.send(event)
  session.phase = session.lifecycle.getSnapshot().value as PluginSessionPhase
}

function markFailedTransition(session: ExtensionHostSession) {
  const event: PluginLifecycleEvent = { type: 'SESSION_FAILED' }
  const snapshot = session.lifecycle.getSnapshot()
  if (snapshot.can(event)) {
    session.lifecycle.send(event)
    session.phase = session.lifecycle.getSnapshot().value as PluginSessionPhase
    return
  }

  if (session.phase !== 'failed') {
    session.phase = 'failed'
  }
}

// TODO: Maybe support more complex version formats.
function normalizeVersionList(versions: string[]) {
  return [...new Set(versions.map(version => version.trim()).filter(Boolean))]
}

function resolveSupportedVersions(preferredVersion: string, supportedVersions?: string[]) {
  return normalizeVersionList([preferredVersion, ...(supportedVersions ?? [])])
}

function resolveNegotiatedVersion(preferredVersion: string, hostSupportedVersions: string[], peerSupportedVersions?: string[]) {
  const normalizedPreferredVersion = preferredVersion.trim()
  const normalizedHostSupportedVersions = normalizeVersionList(hostSupportedVersions)
  const normalizedPeerSupportedVersions = peerSupportedVersions && peerSupportedVersions.length > 0
    ? normalizeVersionList(peerSupportedVersions)
    : undefined

  if (!normalizedPeerSupportedVersions?.length) {
    if (normalizedHostSupportedVersions.includes(normalizedPreferredVersion)) {
      return {
        acceptedVersion: normalizedPreferredVersion,
        exact: true,
      }
    }

    return {
      exact: false,
      reason: `Host does not support preferred version "${normalizedPreferredVersion}".`,
    }
  }

  if (normalizedPeerSupportedVersions.includes(normalizedPreferredVersion)
    && normalizedHostSupportedVersions.includes(normalizedPreferredVersion)) {
    return {
      acceptedVersion: normalizedPreferredVersion,
      exact: true,
    }
  }

  for (const version of normalizedHostSupportedVersions) {
    if (normalizedPeerSupportedVersions.includes(version)) {
      return {
        acceptedVersion: version,
        exact: false,
      }
    }
  }

  return {
    exact: false,
    reason: `No overlapping supported versions. host=[${normalizedHostSupportedVersions.join(', ')}]; peer=[${normalizedPeerSupportedVersions.join(', ')}].`,
  }
}

function filterDeniedPermissions(requested: ModulePermissionDeclaration, granted: ModulePermissionGrant): ModulePermissionDeclaration {
  const denied: ModulePermissionDeclaration = {}
  const deniedApis = filterDeniedPermissionScopes(requested.apis, granted.apis)
  const deniedResources = filterDeniedPermissionScopes(requested.resources, granted.resources)
  const deniedCapabilities = filterDeniedPermissionScopes(requested.capabilities, granted.capabilities)
  const deniedProcessors = filterDeniedPermissionScopes(requested.processors, granted.processors)
  const deniedPipelines = filterDeniedPermissionScopes(requested.pipelines, granted.pipelines)

  if (deniedApis.length > 0) {
    denied.apis = deniedApis
  }

  if (deniedResources.length > 0) {
    denied.resources = deniedResources
  }

  if (deniedCapabilities.length > 0) {
    denied.capabilities = deniedCapabilities
  }

  if (deniedProcessors.length > 0) {
    denied.processors = deniedProcessors
  }

  if (deniedPipelines.length > 0) {
    denied.pipelines = deniedPipelines
  }

  return denied
}

function matchPermissionKey(pattern: string, target: string) {
  if (pattern === '*') {
    return true
  }

  if (pattern.endsWith('*')) {
    return target.startsWith(pattern.slice(0, -1))
  }

  return pattern === target
}

function getPermissionIntersectionKey(left: string, right: string) {
  if (matchPermissionKey(left, right)) {
    return right
  }

  if (matchPermissionKey(right, left)) {
    return left
  }

  return undefined
}

function filterDeniedPermissionScopes<
  T extends {
    key: string
    actions: string[]
  },
>(requested: T[] | undefined, granted: T[] | undefined): T[] {
  if (!requested?.length) {
    return []
  }

  return requested.flatMap((requestedSpec) => {
    const grantedActions = new Set<string>()
    let hasUnRepresentableOverlap = false

    for (const grantedSpec of granted ?? []) {
      const intersectionKey = getPermissionIntersectionKey(requestedSpec.key, grantedSpec.key)
      if (!intersectionKey) {
        continue
      }

      if (intersectionKey !== requestedSpec.key) {
        // A narrower grant overlaps only part of the requested scope, such as:
        // - requested `plugin.resource.*`
        // - granted   `plugin.resource.settings`
        //
        // The current declaration shape cannot express "everything except the granted subset",
        // so reporting the whole requested scope as denied would contradict the granted/current
        // snapshots. In that case we omit the denied entry rather than over-reporting it.
        hasUnRepresentableOverlap = true
        continue
      }

      for (const action of grantedSpec.actions) {
        if (requestedSpec.actions.includes(action)) {
          grantedActions.add(action)
        }
      }
    }

    const deniedActions = requestedSpec.actions.filter(action => !grantedActions.has(action))
    if (deniedActions.length === 0 || hasUnRepresentableOverlap) {
      return []
    }

    return [{
      ...requestedSpec,
      actions: deniedActions,
    }]
  })
}

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
 * Describes the host-owned state tracked for one extension session.
 *
 * Use when:
 * - Reading session snapshots from `ExtensionHost`
 * - Passing session state through host tests or orchestration code
 *
 * Expects:
 * - `id` and `identity` stay stable for the lifetime of the session
 *
 * Returns:
 * - The full session snapshot including transport, phase, bound APIs, and granted permissions
 */
export interface ExtensionHostSession {
  /** Manifest used to load the plugin. */
  manifest: ExtensionManifestV1
  /** Loaded plugin hooks for the active session. */
  plugin: Plugin
  /** Unique host-generated session id. */
  id: string
  /** Monotonic index assigned when the session was created. */
  index: number
  /** Working directory used to resolve relative entrypoints. */
  cwd: string
  /** Protocol identity emitted on plugin lifecycle events. */
  identity: ModuleIdentity
  /** Current host lifecycle phase for the session. */
  phase: PluginSessionPhase
  /** XState actor that drives the session lifecycle transitions. */
  lifecycle: ActorRefFrom<typeof pluginLifecycleMachine>
  /** Transport used by the session Eventa context. */
  transport: PluginTransport
  /** Runtime used to load and run the plugin. */
  runtime: PluginRuntime
  /** Host-owned Eventa channels injected into the plugin context. */
  channels: {
    /** Control-plane Eventa context used for lifecycle and RPC traffic. */
    host: ReturnType<typeof createPluginContext>
  }
  /** Bound plugin SDK APIs exposed to plugin code. */
  apis: ExtensionHostSessionApis
  /** Requested and granted permissions for the session. */
  permissions: {
    /** Permissions requested by the manifest and runtime declarations. */
    requested: ModulePermissionDeclaration
    /** Permissions actually granted by the host. */
    granted: ModulePermissionGrant
    /** Permission snapshot revision number. */
    revision: number
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
  manifest: ExtensionManifestV1
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
  toolIds: Set<string>
  toolsetPromptIds: Set<string>
}

const builtInSessionApiNamespaces = new Set(['providers', 'kits', 'bindings', 'tools'])

type ExtensionHostSessionApis = ReturnType<typeof createApis> & Record<string, unknown>

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

/**
 * Orchestrates plugin loading, session lifecycle, bindings, tools, resources, and permissions.
 *
 * Use when:
 * - Running plugins inside the in-memory host implementation
 * - Tests or applications need one place to load, initialize, start, stop, and query extension sessions
 *
 * Expects:
 * - Extensions are loaded from manifest entrypoints through {@link FileSystemLoader}
 * - Each session gets its own Eventa context, permission scope, and lifecycle actor
 *
 * Returns:
 * - A host instance that exposes session management plus access to kits, bindings, tools, and capabilities
 *
 * Call stack:
 *
 * caller
 *   -> {@link ExtensionHost.load}
 *     -> {@link FileSystemLoader.resolveEntrypointFor}
 *     -> {@link FileSystemLoader.loadExtensionFor}
 *   -> {@link ExtensionHost.init}
 *     -> permission resolution + protocol negotiation
 *     -> binding of {@link createApis} into plugin context
 *   -> {@link ExtensionHost.start}
 *     -> {@link ExtensionHost.load}
 *     -> {@link ExtensionHost.init}
 */
export class ExtensionHost {
  private readonly loader: FileSystemLoader
  private readonly sessionService = new ExtensionSessionService<ExtensionHostSession>()
  private readonly extensionSessionService = new ExtensionSessionService<ExtensionSession>()
  private readonly runtime: PluginRuntime
  private readonly transport: PluginTransport
  private readonly protocolVersion: string
  private readonly apiVersion: string
  private readonly supportedProtocolVersions: string[]
  private readonly supportedApiVersions: string[]
  private readonly dependencies = new DependencyService()
  private readonly kits = new KitRegistryService()
  private readonly kitApis = new Map<string, KitRef<unknown>>()
  private readonly kitApiWatchers = new Map<string, Set<() => Promise<void>>>()
  private readonly modules = new KitApiBindingRegistryService()
  private readonly tools = new ToolRegistryService()
  private readonly extensionModuleResources = new Map<string, ExtensionModuleResourceTracker>()
  private readonly permissions = new PermissionService()
  private readonly permissionResolver?: ExtensionHostOptions['permissionResolver']
  private readonly persistedPermissionGrants = new Map<string, ModulePermissionGrant>()
  private readonly resources = new ResourceService()
  private readonly sessionApiFactories = new Map<string, PluginSessionApiFactory>()
  private readonly lifecycleHooks: Record<ExtensionHostLifecycleEvent, ExtensionHostLifecycleHook[]> = {
    'session-loaded': [],
    'session-ready': [],
    'session-stopped': [],
  }

  private readonly installContext: ExtensionHostInstallContext

  constructor(options: ExtensionHostOptions = {}) {
    this.loader = new FileSystemLoader()
    this.runtime = options.runtime ?? 'electron'
    this.transport = options.transport ?? { kind: 'in-memory' }
    this.protocolVersion = options.protocolVersion ?? 'v1'
    this.apiVersion = options.apiVersion ?? 'v1'
    this.supportedProtocolVersions = resolveSupportedVersions(this.protocolVersion, options.supportedProtocolVersions)
    this.supportedApiVersions = resolveSupportedVersions(this.apiVersion, options.supportedApiVersions)
    this.permissionResolver = options.permissionResolver
    this.resources.setValue(protocolListProvidersEventName, [] as Array<{ name: string }>)
    this.markCapabilityReady(protocolListProvidersEventName, { source: 'plugin-host' })
    this.installContext = this.createInstallContext()

    for (const contribution of options.contributions ?? []) {
      this.installContribution(contribution)
    }
  }

  async startExtension(
    extension: Extension,
    options: { manifest: ExtensionManifestV1, cwd?: string, runtime?: PluginRuntime },
  ) {
    if (extension.id !== options.manifest.id) {
      throw new Error(`Extension entrypoint id \`${extension.id}\` must match manifest id \`${options.manifest.id}\`.`)
    }

    const sessionIdentity = this.extensionSessionService.nextSessionIdentity(extension.id)
    const extensionIdentity = {
      id: extension.id,
      version: extension.version,
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
      runtime: options.runtime,
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
            input.permissions ?? {},
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
      session.phase = 'ready'
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
    this.kitApis.set(kit.id, kit as KitRef<unknown>)
    void this.notifyKitApiWatchers(kit.id)
    return kit
  }

  unregisterKitApi(kitId: string) {
    const deleted = this.kitApis.delete(kitId)
    void this.notifyKitApiWatchers(kitId)
    return deleted
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
        toolIds: new Set(),
        toolsetPromptIds: new Set(),
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

    for (const toolId of resources.toolIds) {
      this.tools.unregister(session.extension.id, toolId)
    }

    for (const toolsetPromptId of resources.toolsetPromptIds) {
      this.tools.unregisterToolsetPrompt(session.extension.id, toolsetPromptId)
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
      ok: true,
      client: registered.createClient({
        extensionId: session.extension.id,
        sessionId: session.id,
        moduleId,
      }),
    }
  }

  private createKitRegistry(session: ExtensionSession, subscriptions: DisposableStore, moduleId?: string): ExtensionKitRegistry {
    return {
      use: async <TClient>(kit: KitRef<TClient>) => {
        const result = this.resolveKitApi(session, kit, moduleId)
        if (result.ok) {
          return result.client
        }
        const failure = result as Extract<KitUseResult<TClient>, { ok: false }>
        throw failure.error
      },
      tryUse: async <TClient>(kit: KitRef<TClient>) => {
        return this.resolveKitApi(session, kit, moduleId)
      },
      watch: <TClient>(kit: KitRef<TClient>, callback: (availability: KitAvailability<TClient>) => void | Promise<void>) => {
        const watchers = this.kitApiWatchers.get(kit.id) ?? new Set()
        let disposed = false
        const watcher = async () => {
          if (disposed) {
            return
          }

          const result = this.resolveKitApi(session, kit, moduleId)
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

  private createExtensionKitRegistry(session: ExtensionSession): ExtensionKitRegistry {
    return this.createKitRegistry(session, session.subscriptions)
  }

  private createModuleKitRegistry(session: ExtensionSession, subscriptions: DisposableStore, moduleId: string): ExtensionModuleContext['kits'] {
    return this.createKitRegistry(session, subscriptions, moduleId)
  }

  private getPermissionScopeKey(session: ExtensionHostSession) {
    return session.id
  }

  private assertPermission(
    session: ExtensionHostSession,
    input: ExtensionHostPermissionRequest,
  ) {
    const allowed = this.permissions.isAllowed(this.getPermissionScopeKey(session), input.area, input.action, input.key)
    if (allowed) {
      return
    }

    const error = new PermissionDeniedError({
      area: input.area,
      action: input.action,
      key: input.key,
    })

    session.channels.host.emit(errorPermission, {
      identity: session.identity,
      error: {
        area: input.area,
        action: input.action,
        key: input.key,
        reason: input.reason ?? 'Permission not granted for requested operation.',
        recoverable: true,
      },
    })

    throw error
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

  private getSessionOrThrow(sessionId: string) {
    const session = this.sessionService.get(sessionId)
    if (!session) {
      throw new Error(`Unknown extension session: ${sessionId}`)
    }

    return session
  }

  private getExtensionSessionOrThrow(sessionId: string) {
    const session = this.extensionSessionService.get(sessionId)
    if (!session) {
      throw new Error(`Unknown extension session: ${sessionId}`)
    }

    return session
  }

  private createSessionContext(session: ExtensionHostSession): ExtensionHostSessionContext {
    return {
      sessionId: session.id,
      ownerPluginId: session.identity.plugin.id,
      runtime: session.runtime,
    }
  }

  private createInstallContext(): ExtensionHostInstallContext {
    return {
      registerSessionApi: (namespace, factory) => {
        if (builtInSessionApiNamespaces.has(namespace)) {
          throw new Error(`Session API namespace \`${namespace}\` is reserved by ExtensionHost.`)
        }

        const currentFactory = this.sessionApiFactories.get(namespace)
        if (currentFactory && currentFactory !== factory) {
          throw new Error(`Duplicate session API namespace registration for \`${namespace}\`.`)
        }

        this.sessionApiFactories.set(namespace, factory)
      },
      registerLifecycleHook: (event, hook) => {
        this.lifecycleHooks[event].push(hook)
      },
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

  private createSessionApis(
    session: ExtensionHostSession,
    hostChannel: ReturnType<typeof createPluginContext>,
  ): ExtensionHostSessionApis {
    const baseApis = createBoundApis(hostChannel, {
      kits: {
        list: () => {
          this.assertPermission(session, {
            area: 'apis',
            action: 'invoke',
            key: pluginKitApiListEventName,
          })
          this.assertPermission(session, {
            area: 'resources',
            action: 'read',
            key: pluginKitRegistryResourceKey,
          })

          return this.listKits(session.runtime)
        },
        getCapabilities: (kitId) => {
          this.assertPermission(session, {
            area: 'apis',
            action: 'invoke',
            key: pluginKitApiGetCapabilitiesEventName,
          })
          this.assertPermission(session, {
            area: 'resources',
            action: 'read',
            key: pluginKitRegistryResourceKey,
          })
          this.assertKitAvailableForSession(session, kitId)

          return this.getKitCapabilities(kitId)
        },
      },
      bindings: {
        list: () => {
          this.assertPermission(session, {
            area: 'apis',
            action: 'invoke',
            key: pluginBindingApiListEventName,
          })
          this.assertPermission(session, {
            area: 'resources',
            action: 'read',
            key: pluginBindingRegistryResourceKey,
          })

          return this.listBindings({ ownerSessionId: session.id })
        },
        announce: input => this.announceBinding(session.id, input),
        activate: input => this.activateBinding(session.id, input.moduleId),
        update: input => this.updateBinding(session.id, input.moduleId, input),
        withdraw: input => this.withdrawBinding(session.id, input.moduleId),
      },
      tools: {
        register: input => this.registerTool(session.id, input),
        registerToolsetPrompt: input => this.registerToolsetPrompt(session.id, input),
      },
    })

    const contributionApis = Object.fromEntries(
      [...this.sessionApiFactories.entries()].map(([namespace, factory]) => [
        namespace,
        factory({
          host: this.installContext,
          session: this.createSessionContext(session),
          assertPermission: input => this.assertPermission(session, input),
        }),
      ]),
    )

    return {
      ...baseApis,
      ...contributionApis,
    }
  }

  private runLifecycleHooks(event: ExtensionHostLifecycleEvent, session: ExtensionHostSession) {
    for (const hook of this.lifecycleHooks[event]) {
      hook({
        host: this.installContext,
        session: this.createSessionContext(session),
        manifest: session.manifest,
      })
    }
  }

  private cleanupSession(session: ExtensionHostSession) {
    let lifecycleHookError: unknown

    if (session.phase !== 'stopped') {
      const canStop = session.lifecycle.getSnapshot().can({ type: 'STOP' })
      if (canStop) {
        assertTransition(session, 'stopped')
      }
      else {
        session.phase = 'stopped'
      }
    }

    for (const module of this.modules.listByOwner(session.id)) {
      this.modules.withdraw(session.id, session.identity.plugin.id, module.moduleId)
      this.modules.unbind(session.id, session.identity.plugin.id, module.moduleId)
    }

    try {
      this.runLifecycleHooks('session-stopped', session)
    }
    catch (error) {
      lifecycleHookError = error
    }

    session.lifecycle.stop()
    this.sessionService.remove(session.id)

    return lifecycleHookError
  }

  private async cleanupExtensionSession(session: ExtensionSession) {
    session.phase = 'stopped'

    for (const module of this.modules.listByOwner(session.id)) {
      this.modules.withdraw(session.id, session.extension.id, module.moduleId)
      this.modules.unbind(session.id, session.extension.id, module.moduleId)
    }
    this.tools.unregisterOwner(session.id)

    await this.cleanupExtensionSessionModules(session)
    await session.subscriptions.dispose()
    this.extensionSessionService.remove(session.id)
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

  private assertKitAvailableForSession(session: ExtensionHostSession, kitId: string) {
    return this.assertKitAvailableForRuntime(kitId, session.runtime)
  }

  listSessions() {
    return this.extensionSessionService.list()
  }

  getSession(sessionId: string) {
    return this.extensionSessionService.get(sessionId)
  }

  registerKit(kit: KitDescriptor) {
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

  async listAvailableToolDescriptors() {
    return await this.tools.listAvailableDescriptors()
  }

  async listSerializedXsaiTools() {
    return await this.tools.listSerializedXsaiTools()
  }

  async invokeTool(ownerPluginId: string, toolId: string, input: unknown) {
    return await this.tools.invoke(ownerPluginId, toolId, input)
  }

  announceBinding<C extends HostDataRecord = HostDataRecord>(
    sessionId: string,
    input: BoundAnnounceBindingInput<C>,
  ): BindingRecord<C> {
    const session = this.getSessionOrThrow(sessionId)
    const kit = this.assertKitAvailableForSession(session, input.kitId)

    this.assertPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginBindingApiAnnounceEventName,
    })
    this.assertPermission(session, {
      area: 'resources',
      action: 'write',
      key: getKitBindingResourceKey(kit.kitId),
      reason: `Module announce requires write access to kit \`${kit.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.bind({
      ...input,
      ownerSessionId: session.id,
      ownerPluginId: session.identity.plugin.id,
      runtime: session.runtime,
    }) as BindingRecord<C>)
  }

  activateBinding(sessionId: string, moduleId: string) {
    const session = this.getSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)

    this.assertPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginBindingApiActivateEventName,
    })
    this.assertPermission(session, {
      area: 'resources',
      action: 'write',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module activation requires write access to kit \`${module.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.activate(session.id, session.identity.plugin.id, moduleId))
  }

  updateBinding<C extends HostDataRecord = HostDataRecord>(
    sessionId: string,
    moduleId: string,
    patch: UpdateBindingInput<C> | Omit<UpdateBindingInput<C>, 'moduleId'>,
  ) {
    const session = this.getSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)

    this.assertPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginBindingApiUpdateEventName,
    })
    this.assertPermission(session, {
      area: 'resources',
      action: 'write',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module update requires write access to kit \`${module.kitId}\`.`,
    })

    const normalizedPatch = 'moduleId' in patch ? omitModuleId(patch) : patch
    return cloneBindingRecord(this.modules.update(session.id, session.identity.plugin.id, moduleId, normalizedPatch))
  }

  degradeBinding(sessionId: string, moduleId: string) {
    const session = this.getSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)
    this.assertPermission(session, {
      area: 'resources',
      action: 'write',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module degradation requires write access to kit \`${module.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.degrade(session.id, session.identity.plugin.id, moduleId))
  }

  withdrawBinding(sessionId: string, moduleId: string) {
    const session = this.getSessionOrThrow(sessionId)
    const module = this.getModuleOrThrow(moduleId)

    this.assertPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginBindingApiWithdrawEventName,
    })
    this.assertPermission(session, {
      area: 'resources',
      action: 'write',
      key: getKitBindingResourceKey(module.kitId),
      reason: `Module withdrawal requires write access to kit \`${module.kitId}\`.`,
    })

    return cloneBindingRecord(this.modules.withdraw(session.id, session.identity.plugin.id, moduleId))
  }

  registerTool(sessionId: string, input: RegisterToolInput) {
    const session = this.getSessionOrThrow(sessionId)

    this.assertPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginToolApiRegisterEventName,
    })
    this.assertPermission(session, {
      area: 'resources',
      action: 'write',
      key: pluginToolRegistryResourceKey,
    })

    this.tools.register({
      ownerSessionId: session.id,
      ownerPluginId: session.identity.plugin.id,
      tool: {
        ...input.tool,
        activation: {
          keywords: [...input.tool.activation.keywords],
          patterns: [...input.tool.activation.patterns],
        },
        parameters: cloneHostDataRecord(input.tool.parameters),
      },
      availability: async () => {
        if (!this.getSession(session.id)) {
          return false
        }

        return await input.availability?.() ?? true
      },
      execute: async (toolInput) => {
        if (!this.getSession(session.id)) {
          throw new Error(`Plugin tool not found: ${session.identity.plugin.id}:${input.tool.id}`)
        }

        return await input.execute(toolInput)
      },
    })
  }

  registerToolsetPrompt(sessionId: string, input: RegisterToolsetPromptInput) {
    const session = this.getSessionOrThrow(sessionId)

    this.assertPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginToolApiRegisterEventName,
    })
    this.assertPermission(session, {
      area: 'resources',
      action: 'write',
      key: pluginToolRegistryResourceKey,
    })

    this.tools.registerToolsetPrompt({
      ownerSessionId: session.id,
      ownerPluginId: session.identity.plugin.id,
      toolset: structuredClone(input),
      availability: () => Boolean(this.getSession(session.id)),
    })
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
      ownerPluginId: session.extension.id,
      runtime: this.runtime,
    }) as BindingRecord<C>)

    if (permissionModuleId) {
      this.getOrCreateExtensionModuleResourceTracker(session.id, permissionModuleId).bindingIds.add(binding.moduleId)
    }

    return binding
  }

  registerExtensionTool(
    sessionId: string,
    input: RegisterToolInput,
    permissionModuleId?: string,
  ) {
    const session = this.getExtensionSessionOrThrow(sessionId)

    this.assertExtensionPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginToolApiRegisterEventName,
    }, permissionModuleId)
    this.assertExtensionPermission(session, {
      area: 'resources',
      action: 'write',
      key: pluginToolRegistryResourceKey,
    }, permissionModuleId)

    this.tools.register({
      ownerSessionId: session.id,
      ownerPluginId: session.extension.id,
      tool: {
        ...input.tool,
        activation: {
          keywords: [...input.tool.activation.keywords],
          patterns: [...input.tool.activation.patterns],
        },
        parameters: cloneHostDataRecord(input.tool.parameters),
      },
      availability: async () => {
        if (!this.extensionSessionService.get(session.id)) {
          return false
        }

        return await input.availability?.() ?? true
      },
      execute: async (toolInput) => {
        if (!this.extensionSessionService.get(session.id)) {
          throw new Error(`Extension tool not found: ${session.extension.id}:${input.tool.id}`)
        }

        return await input.execute(toolInput)
      },
    })

    if (permissionModuleId) {
      this.getOrCreateExtensionModuleResourceTracker(session.id, permissionModuleId).toolIds.add(input.tool.id)
    }
  }

  registerExtensionToolsetPrompt(
    sessionId: string,
    input: RegisterToolsetPromptInput,
    permissionModuleId?: string,
  ) {
    const session = this.getExtensionSessionOrThrow(sessionId)

    this.assertExtensionPermission(session, {
      area: 'apis',
      action: 'invoke',
      key: pluginToolApiRegisterEventName,
    }, permissionModuleId)
    this.assertExtensionPermission(session, {
      area: 'resources',
      action: 'write',
      key: pluginToolRegistryResourceKey,
    }, permissionModuleId)

    this.tools.registerToolsetPrompt({
      ownerSessionId: session.id,
      ownerPluginId: session.extension.id,
      toolset: structuredClone(input),
      availability: () => Boolean(this.extensionSessionService.get(session.id)),
    })

    if (permissionModuleId) {
      this.getOrCreateExtensionModuleResourceTracker(session.id, permissionModuleId).toolsetPromptIds.add(input.id)
    }
  }

  async load(manifest: ExtensionManifestV1, options: ExtensionLoadOptions = {}): Promise<ExtensionHostSession> {
    // Step 0 (channel gateway preparation): resolve runtime and transport for this plugin.
    const runtime = options.runtime ?? this.runtime
    const sessionCwd = options.cwd ?? cwd() // Explicitly assign the default CWD.
    const transport = this.transport

    // TODO: implement other transports and runtime bindings.
    // alpha scope guard:
    // we intentionally fail fast for non in-memory transports while iterating on lifecycle design.
    if (transport.kind !== 'in-memory') {
      throw new Error(`Only in-memory transport is currently supported by ExtensionHost alpha. Got: ${transport.kind}`)
    }

    // Build per-session identity.
    const sessionIdentity = this.sessionService.nextSessionIdentity(manifest.id)
    const sessionIndex = sessionIdentity.index
    const id = sessionIdentity.sessionId
    const identity = sessionIdentity.moduleIdentity

    // Step 1 (connect/control-plane prep): create an isolated Eventa context per plugin.
    // All invokes/events for this plugin go through this context to prevent cross-talk.
    const hostChannel = createPluginContext(transport)
    const lifecycle = createActor(pluginLifecycleMachine)
    lifecycle.start()

    const permissionSnapshot = this.permissions.initialize(
      id,
      manifest.permissions,
      {
        persisted: this.permissionResolver ? undefined : this.persistedPermissionGrants.get(identity.plugin.id),
      },
    )

    const session: ExtensionHostSession = {
      manifest,
      plugin: {},
      id,
      index: sessionIndex,
      cwd: sessionCwd,
      identity,
      phase: lifecycle.getSnapshot().value as PluginSessionPhase,
      lifecycle,
      transport,
      runtime,
      channels: {
        host: hostChannel,
      },
      apis: {} as ExtensionHostSessionApis,
      permissions: {
        requested: permissionSnapshot.requested,
        granted: permissionSnapshot.granted,
        revision: permissionSnapshot.revision,
      },
    }
    session.apis = this.createSessionApis(session, hostChannel)

    defineInvokeHandler(hostChannel, protocolCapabilityWait, async (payload) => {
      this.assertPermission(session, {
        area: 'apis',
        action: 'invoke',
        key: protocolCapabilityWaitEventName,
      })
      this.assertPermission(session, {
        area: 'capabilities',
        action: 'wait',
        key: payload.key,
      })
      return await this.waitForCapability(payload.key, payload?.timeoutMs)
    })
    defineInvokeHandler(hostChannel, protocolCapabilitySnapshot, async () => {
      this.assertPermission(session, {
        area: 'apis',
        action: 'invoke',
        key: protocolCapabilitySnapshotEventName,
      })
      this.assertPermission(session, {
        area: 'capabilities',
        action: 'snapshot',
        key: '*',
      })
      return this.listCapabilities()
    })
    defineInvokeHandler(hostChannel, protocolProviders.listProviders, async () => {
      this.assertPermission(session, {
        area: 'apis',
        action: 'invoke',
        key: protocolListProvidersEventName,
      })
      this.assertPermission(session, {
        area: 'resources',
        action: 'read',
        key: protocolListProvidersEventName,
      })
      return await this.resources.get<Array<{ name: string }>>(protocolListProvidersEventName, []) ?? []
    })

    // Register session before loading so failure paths still have observable state.
    this.sessionService.register(session)

    try {
      throw new Error('ExtensionHost.load() no longer supports legacy plugin entrypoints. Use ExtensionHost.start() with a defineExtension(...) entrypoint.')

      // Assert lifecycle progression (`loading` -> `loaded`) to keep transition rules explicit.
      // This prevents accidental phase drift if the method evolves later.
      assertTransition(session, 'loaded')
      this.runLifecycleHooks('session-loaded', session)
      return session
    }
    catch (error) {
      // Load failure is terminal for this session (`loading` -> `failed`).
      // Emit status so Configurator/observers can show deterministic diagnostics.
      markFailedTransition(session)
      session.channels.host.emit(moduleStatus, {
        identity: session.identity,
        phase: 'failed',
        reason: errorMessageFrom(error) ?? 'Failed to load plugin.',
      })

      throw error
    }
  }

  async init(sessionId: string, options: ExtensionStartOptions = {}): Promise<ExtensionHostSession> {
    // `init` starts at procedure step 2 (authenticate) and drives lifecycle to ready.
    const session = this.sessionService.get(sessionId)
    if (!session) {
      throw new Error(`Unable to initialize extension session: ${sessionId}`)
    }

    // Safety gate: initialization can only begin from a successfully loaded plugin.
    if (session.phase !== 'loaded') {
      throw new Error(`Session ${sessionId} cannot initialize from phase ${session.phase}. Expected loaded.`)
    }

    try {
      let preparedEmitted = false

      // Step 2: authenticate module against host control plane.
      assertTransition(session, 'authenticating')
      session.channels.host.emit(moduleAuthenticate, {
        token: `${session.id}:${session.identity.id}`,
      })

      // Mark local lifecycle after authentication handshake.
      assertTransition(session, 'authenticated')
      session.channels.host.emit(moduleAuthenticated, { authenticated: true })

      // Step 3: protocol/api compatibility negotiation.
      const compatibilityRequest: ModuleCompatibilityRequest = {
        protocolVersion: this.protocolVersion,
        apiVersion: this.apiVersion,
        supportedProtocolVersions: options.compatibility?.supportedProtocolVersions,
        supportedApiVersions: options.compatibility?.supportedApiVersions,
      }

      session.channels.host.emit(moduleCompatibilityRequest, compatibilityRequest)
      const protocolNegotiation = resolveNegotiatedVersion(
        compatibilityRequest.protocolVersion,
        this.supportedProtocolVersions,
        compatibilityRequest.supportedProtocolVersions,
      )
      const apiNegotiation = resolveNegotiatedVersion(
        compatibilityRequest.apiVersion,
        this.supportedApiVersions,
        compatibilityRequest.supportedApiVersions,
      )

      const rejectionReasons = [
        ...protocolNegotiation.acceptedVersion ? [] : [`protocol: ${protocolNegotiation.reason}`],
        ...apiNegotiation.acceptedVersion ? [] : [`api: ${apiNegotiation.reason}`],
      ]

      if (rejectionReasons.length > 0) {
        const reason = `Negotiation rejected: ${rejectionReasons.join('; ')}`
        session.channels.host.emit(moduleCompatibilityResult, {
          protocolVersion: compatibilityRequest.protocolVersion,
          apiVersion: compatibilityRequest.apiVersion,
          mode: 'rejected',
          reason,
        })
        throw new Error(reason)
      }

      session.channels.host.emit(moduleCompatibilityResult, {
        protocolVersion: protocolNegotiation.acceptedVersion!,
        apiVersion: apiNegotiation.acceptedVersion!,
        mode: protocolNegotiation.exact && apiNegotiation.exact ? 'exact' : 'downgraded',
      })

      // Step 4: broadcast currently known modules for dependency discovery/bootstrap.
      session.channels.host.emit(registryModulesSync, {
        modules: this.sessionService.list()
          .filter(item => item.phase !== 'stopped')
          .map(item => ({
            name: item.manifest.id,
            index: item.index,
            identity: item.identity,
          })),
      })

      session.channels.host.emit(modulePermissionsDeclare, {
        identity: session.identity,
        requested: session.permissions.requested,
        source: 'manifest',
      })

      const resolvedGrant = await this.permissionResolver?.({
        identity: session.identity,
        manifest: session.manifest,
        requested: session.permissions.requested,
        persisted: this.persistedPermissionGrants.get(session.identity.plugin.id),
      }) ?? session.permissions.requested

      const grantedSnapshot = this.permissions.initialize(this.getPermissionScopeKey(session), session.permissions.requested, {
        grant: resolvedGrant,
        persisted: this.permissionResolver ? undefined : this.persistedPermissionGrants.get(session.identity.plugin.id),
      })
      session.permissions = {
        requested: grantedSnapshot.requested,
        granted: grantedSnapshot.granted,
        revision: grantedSnapshot.revision,
      }
      this.persistedPermissionGrants.set(session.identity.plugin.id, grantedSnapshot.granted)

      const deniedPermissions = filterDeniedPermissions(grantedSnapshot.requested, grantedSnapshot.granted)
      session.channels.host.emit(modulePermissionsGranted, {
        identity: session.identity,
        granted: grantedSnapshot.granted,
        revision: grantedSnapshot.revision,
      })
      if (Object.values(deniedPermissions).some(value => Array.isArray(value) && value.length > 0)) {
        session.channels.host.emit(modulePermissionsDenied, {
          identity: session.identity,
          denied: deniedPermissions,
          reason: 'One or more requested permissions were not granted by host policy.',
          revision: grantedSnapshot.revision,
        })
      }
      session.channels.host.emit(modulePermissionsCurrent, {
        identity: session.identity,
        requested: grantedSnapshot.requested,
        granted: grantedSnapshot.granted,
        revision: grantedSnapshot.revision,
      })

      // Step 5: module announcement to the shared control plane.
      assertTransition(session, 'announced')
      session.channels.host.emit(moduleAnnounce, {
        name: session.manifest.id,
        identity: session.identity,
        possibleEvents: [],
        permissions: session.permissions.requested,
      })
      session.channels.host.emit(moduleStatus, {
        identity: session.identity,
        phase: 'announced',
      })

      // Step 6/7: preparing phase (dependency/config preparation may happen inside plugin init).
      assertTransition(session, 'preparing')
      session.channels.host.emit(moduleStatus, {
        identity: session.identity,
        phase: 'preparing',
      })

      // Optional dependency gate before extension-owned initialization.
      if (options.requiredCapabilities?.length) {
        const capabilityTimeoutMs = options.capabilityWaitTimeoutMs ?? 15000
        const unresolvedCapabilities = options.requiredCapabilities.filter(key => !this.isCapabilityReady(key))
        assertTransition(session, 'waiting-deps')
        session.channels.host.emit(moduleStatus, {
          identity: session.identity,
          phase: 'preparing',
          reason: `Waiting for capabilities: ${options.requiredCapabilities.join(', ')}`,
          details: {
            // For richer observability
            lifecyclePhase: 'waiting-deps',
            requiredCapabilities: options.requiredCapabilities,
            unresolvedCapabilities,
            timeoutMs: capabilityTimeoutMs,
          },
        })

        await this.waitForCapabilities(options.requiredCapabilities, capabilityTimeoutMs)
        assertTransition(session, 'prepared')
        session.channels.host.emit(modulePrepared, {
          identity: session.identity,
        })
        session.channels.host.emit(moduleStatus, {
          identity: session.identity,
          phase: 'prepared',
        })
        preparedEmitted = true
      }

      // Run extension-owned init hook. Returning `false` explicitly aborts startup.
      const initResult = await session.plugin.init?.({
        channels: session.channels,
        apis: session.apis,
      })

      if (initResult === false) {
        throw new Error(`Plugin initialization aborted by plugin: ${session.manifest.id}`)
      }

      // Step 8/10: module prepared.
      if (!preparedEmitted) {
        assertTransition(session, 'prepared')
        session.channels.host.emit(modulePrepared, {
          identity: session.identity,
        })
        session.channels.host.emit(moduleStatus, {
          identity: session.identity,
          phase: 'prepared',
        })
      }

      // Step 9/11: allow host to stop at explicit "configuration-needed".
      if (options.requireConfiguration) {
        assertTransition(session, 'configuration-needed')
        session.channels.host.emit(moduleConfigurationNeeded, {
          identity: session.identity,
          reason: 'Host requested configuration before activation.',
        })
        session.channels.host.emit(moduleStatus, {
          identity: session.identity,
          phase: 'configuration-needed',
        })

        return session
      }

      // Step 12/13: apply default config path for alpha when no manual configuration is required.
      await this.applyConfiguration(session.id, {
        configId: `${session.identity.id}:default`,
        revision: 1,
        schemaVersion: 1,
        full: {},
      })

      // Step 14/15: plugin contributes modules/capabilities in setup hook.
      await session.plugin.setupModules?.({
        channels: session.channels,
        apis: session.apis,
      })

      // Step 16: mark ready after setup/contribution flow completes.
      assertTransition(session, 'ready')
      session.channels.host.emit(moduleStatus, {
        identity: session.identity,
        phase: 'ready',
      })
      this.runLifecycleHooks('session-ready', session)

      return session
    }
    catch (error) {
      // Any init failure is normalized into failed phase + status event for observability.
      markFailedTransition(session)

      session.channels.host.emit(moduleStatus, {
        identity: session.identity,
        phase: 'failed',
        reason: errorMessageFrom(error) ?? 'Extension host initialization failed.',
      })

      this.cleanupSession(session)

      throw error
    }
  }

  async start(manifest: ExtensionManifestV1, options: ExtensionStartOptions = {}): Promise<ExtensionSession> {
    const extension = await this.loader.loadExtensionFor(manifest, {
      cwd: options.cwd,
      runtime: options.runtime,
    })

    const session = await this.startExtension(extension, {
      manifest,
      cwd: options.cwd,
      runtime: options.runtime,
    })

    return session
  }

  async applyConfiguration(sessionId: string, config: ModuleConfigEnvelope) {
    // Configuration is allowed only after prepare, during configuration-needed, or while re-configuring.
    const session = this.sessionService.get(sessionId)
    if (!session) {
      throw new Error(`Unable to configure extension session: ${sessionId}`)
    }

    if (!['prepared', 'configuration-needed', 'configured'].includes(session.phase)) {
      throw new Error(`Session ${sessionId} cannot accept configuration during phase ${session.phase}.`)
    }

    // Move into configured once per cycle; repeated apply is allowed while already configured.
    if (session.phase !== 'configured') {
      assertTransition(session, 'configured')
    }

    // Emit configured payload + status so Configurator can sync active config state.
    session.channels.host.emit(moduleConfigurationConfigured, {
      identity: session.identity,
      config,
    })

    session.channels.host.emit(moduleStatus, {
      identity: session.identity,
      phase: 'configured',
    })

    return session
  }

  requestPermissions(sessionId: string, requested: ModulePermissionDeclaration, reason?: string) {
    const session = this.sessionService.get(sessionId)
    if (!session) {
      throw new Error(`Unable to request permissions for extension session: ${sessionId}`)
    }

    const snapshot = this.permissions.declare(this.getPermissionScopeKey(session), requested)
    session.permissions = {
      requested: snapshot.requested,
      granted: snapshot.granted,
      revision: snapshot.revision,
    }

    session.channels.host.emit(modulePermissionsDeclare, {
      identity: session.identity,
      requested: snapshot.requested,
      source: 'runtime',
    })
    session.channels.host.emit(modulePermissionsCurrent, {
      identity: session.identity,
      requested: snapshot.requested,
      granted: snapshot.granted,
      revision: snapshot.revision,
    })
    session.channels.host.emit(modulePermissionsRequest, {
      identity: session.identity,
      requested: snapshot.requested,
      reason,
    })
  }

  grantPermissions(
    sessionId: string,
    grant: ModulePermissionGrant,
  ): {
    requested: ModulePermissionDeclaration
    granted: ModulePermissionGrant
    revision: number
  } {
    const session = this.sessionService.get(sessionId)
    if (!session) {
      throw new Error(`Unable to grant permissions for extension session: ${sessionId}`)
    }

    const snapshot = this.permissions.grant(this.getPermissionScopeKey(session), grant)
    session.permissions = {
      requested: snapshot.requested,
      granted: snapshot.granted,
      revision: snapshot.revision,
    }
    this.persistedPermissionGrants.set(session.identity.plugin.id, snapshot.granted)

    session.channels.host.emit(modulePermissionsGranted, {
      identity: session.identity,
      granted: snapshot.granted,
      revision: snapshot.revision,
    })
    session.channels.host.emit(modulePermissionsCurrent, {
      identity: session.identity,
      requested: snapshot.requested,
      granted: snapshot.granted,
      revision: snapshot.revision,
    })

    return snapshot
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

  markConfigurationNeeded(sessionId: string, reason?: string) {
    // Explicit rollback/forward hook into "configuration-needed" phase.
    // Mirrors procedure step 17 where module may request reconfiguration.
    const session = this.sessionService.get(sessionId)
    if (!session) {
      throw new Error(`Unable to update extension session: ${sessionId}`)
    }

    if (!['prepared', 'configured', 'ready', 'announced'].includes(session.phase)) {
      throw new Error(`Session ${sessionId} cannot move to configuration-needed from ${session.phase}.`)
    }

    // Assert guarded transition to avoid illegal phase jumps.
    assertTransition(session, 'configuration-needed')
    session.channels.host.emit(moduleConfigurationNeeded, {
      identity: session.identity,
      reason,
    })
    session.channels.host.emit(moduleStatus, {
      identity: session.identity,
      phase: 'configuration-needed',
      reason,
    })

    return session
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
