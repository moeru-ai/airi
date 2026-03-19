import type { ActorRefFrom } from 'xstate'

import type { createApis } from '../plugin/apis/client'
import type { Plugin } from '../plugin/shared'
import type {
  ManifestV1,
  ModuleCompatibilityRequest,
  ModuleConfigEnvelope,
  ModuleIdentity,
  ModulePermissionDeclaration,
  ModulePermissionGrant,
  PluginHostOptions,
  PluginLoadOptions,
  PluginRuntime,
  PluginSessionPhase,
  PluginStartOptions,
} from './shared/types'
import type { PluginTransport } from './transports'

import { cwd } from 'node:process'

import { defineInvokeHandler } from '@moeru/eventa'
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

import { createApis as createBoundApis } from '../plugin/apis/client'
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
  PermissionService,
  PluginSessionService,
  ResourceService,
} from './runtimes/shared'

/**
 * Plugin Host lifecycle overview (transport-aware):
 *
 * - The host loads a plugin entrypoint (local or remote).
 * - The host resolves a per-plugin transport (in-memory, worker, WebSocket, electron).
 * - The host creates an Eventa context bound to that transport.
 * - The host binds SDK APIs to the context and passes them into plugin.init.
 *
 * This design allows multiple plugins in one host without shared global channels.
 * Each plugin instance has its own context and transport, so local and remote
 * plugins share the same API surface while remaining isolated.
 */
/**
 * One plugin could contribute multiple modules.
 *
 * For plugin itself, there are two ways to implement it, either local plugin, or remote plugin.
 * Since we have @moeru/eventa as underlying event transmission, we can drive everything in event.
 *
 * It's ok that local plugin doesn't implement the remote protocol to handle the remote plugin
 * RPC if doesn't wish for. Purely local UI manipulation or local resource registration is normal.
 *
 * In another word, we could implement the plugin in same eventa definition, while switching
 * between two different transport.
 *
 * For local plugin, local context for in-memory transport will be used.
 * For remote plugin, server-runtime for WebSocket based transport will be used.
 *
 *
 * The procedure looks like this (regardless to the underlying transport since we will implement
 * in both):
 *
 * 0.  Channel Gateway sits on top of all channels
 * 1.  Connect to control plane channel (from plugin-sdk, or any language implementation will impl)
 * 2.  Authenticate with module:authenticate
 * 3.  Negotiate protocol/api compatibility before lifecycle work starts:
 *     1. Plugin sends module:compatibility:request with:
 *        - plugin protocol version
 *        - plugin sdk api version
 *        - optional supported ranges for backward/forward compatibility
 *     2. Plugin Host replies module:compatibility:result with:
 *        - accepted version tuple (protocol + api)
 *        - compatibility mode (exact, downgraded, rejected)
 *        - deterministic reason if rejected
 *     3. If rejected, host MUST stop initialization for that plugin and emit module:status
 *        with incompatible-version details for Configurator visibility.
 * 4.  Plugin Host will send registry:modules:sync, this ensures the auto plugin / dependency discovery
 * 5.  Module will now announce itself to the entire system through module:announce
 * 6.  Module will now sync to Plugin Host that module now preparing, declaring its:
 *    1. Dependencies to other plugins / modules
 *    2. Initial Configuration (doesn't relate to capabilities)
 *       Note that for capabilities requires Database configuration, and perhaps Memory manipulation,
 *       plugin should orchestrate itself to contribute many capabilities / features, and the needed
 *       configurations and credentials should be requested and configured for each capabilities
 *       instead.
 * 7.  During this phase, if module failed to find the needed dependency, module:status will be emitted
 *     to allow the Plugin Host to surface errors or notice up to Configurator layer, to display the
 *     needed warning and status.
 *
 *     It's ok for module to stay online / connected to channels. In this phase, module:announce
 *     could happen multiple times. Module is ok to listen to the sync events and decide whether to enter
 *     the next phases if needed.
 * 8.  During this phase, if plugin successfully configured itself and calculated / computed the possible
 *     contributing capabilities / features, it will emit module:prepared.
 * 9.  During this phase, if module requires more configuration to fill and enable in order to go next
 *     phase, it's ok, it will emit module:configuration:needed.
 * 10. Module should now emit module:prepared.
 * 11. Module should now emit module:configuration:needed, for telling the shape to Configurator.
 *     In between, for user side / Configurator side:
 *       - module:configuration:validate:request (static check, zod/valibot or programmatic checks)
 *       - module:configuration:validate:status (with parent event id)
 *       - module:configuration:validate:response
 *       - module:configuration:plan:request (actually dry-run, ensures anything during runtime works)
 *       - module:configuration:plan:status (with parent event id)
 *       - module:configuration:plan:response
 *       - module:configuration:commit
 *       - module:configuration:commit:status (with parent event id)
 * 12. Module previously configured will get validate, plan, and commit automatically, if failed, status
 *     will surface to the Configurator side for further noticing to user.
 * 13. Module should now emit module:configuration:configured.
 * 14. Module should now be able to calculate / compute possible capabilities / features to be able to
 *     contribute to the system / Plugin Host, once calculated, module:contribute:capability:offer will
 *     be emitted in (length of) capabilities times.
 *
 *     This means for 1 module that offers 5 capabilities, 5 * module:contribute:capability:offer will
 *     be emitted.
 * 15. Next, module will now enter the capability / feature fill-in phase, during this phase, it's ok
 *     to say that the plugin is running but nothing gets contributed if none of them were configured.
 *
 *     For any capabilities without further configuration and fill-in from Configurator and User side,
 *     it can be automatically activated now (which is next phase for module:contribute:capability:*
 *     events), module:contribute:capability:configuration:configured,
 *     module:contribute:capability:activated will be emitted.
 *
 *     If further configuration and actions needed, module:contribute:capability:configuration:needed
 *     will be emitted.
 *
 *     To configure the capabilities in sequence and correct order,
 *       - module:contribute:capability:configuration:validate:request (static check, zod/valibot or programmatic checks)
 *       - module:contribute:capability:configuration:validate:status (with parent event id)
 *       - module:contribute:capability:configuration:validate:response
 *       - module:contribute:capability:configuration:plan:request (actually dry-run, ensures anything during runtime works)
 *       - module:contribute:capability:configuration:plan:status (with parent event id)
 *       - module:contribute:capability:configuration:plan:response
 *       - module:contribute:capability:configuration:commit
 *       - module:contribute:capability:configuration:commit:status (with parent event id)
 *    similar to module:configuration are accepted.
 *
 * 16. No matter what happens, the module:status should emit with ready status now.
 * 17. Any time the module need to re-calculate / re-compute, or wish to be re-configured, it's ok to
 *     emit module:status:change with needed phase to update, if need to rollback to announced phase,
 *     Plugin Host should treat the Module to be un-prepared status, the needed procedure will be called.
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

function assertTransition(session: PluginHostSession, to: PluginSessionPhase) {
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

function markFailedTransition(session: PluginHostSession) {
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
  const areas: Array<keyof ModulePermissionDeclaration> = ['apis', 'resources', 'capabilities', 'processors', 'pipelines']

  for (const area of areas) {
    const requestedSpecs = requested[area] ?? []
    const grantedSpecs = granted[area] ?? []
    const missing = requestedSpecs.filter(spec =>
      !grantedSpecs.some(grantedSpec =>
        grantedSpec.key === spec.key
        && spec.actions.every(action => grantedSpec.actions.includes(action as never)),
      ),
    )
    if (missing.length > 0) {
      denied[area] = missing as never
    }
  }

  return denied
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

export interface PluginHostSession {
  manifest: ManifestV1
  plugin: Plugin
  id: string
  index: number
  cwd: string
  identity: ModuleIdentity
  phase: PluginSessionPhase
  lifecycle: ActorRefFrom<typeof pluginLifecycleMachine>
  transport: PluginTransport
  runtime: PluginRuntime
  channels: {
    host: ReturnType<typeof createPluginContext>
  }
  apis: ReturnType<typeof createApis>
  permissions: {
    requested: ModulePermissionDeclaration
    granted: ModulePermissionGrant
    revision: number
  }
}

/**
 * In-memory Plugin Host MVP.
 *
 * Procedure placement:
 * - `load(...)` covers step 0 and step 1 preparation:
 *   - create channel gateway/context
 *   - prepare per-plugin isolated runtime resources
 *   - load plugin module from manifest entrypoint
 * - `init(...)` covers protocol/lifecycle step 2 onwards:
 *   - authentication
 *   - compatibility negotiation
 *   - registry sync + announce/prepare/configure/ready flow
 *
 * The design intentionally keeps `load` and `init` separate so callers can:
 * - inspect/patch session state before booting,
 * - batch-load many plugins first, then initialize deterministically.
 */
export class PluginHost {
  private readonly loader: FileSystemLoader
  private readonly sessionService = new PluginSessionService<PluginHostSession>()
  private readonly runtime: PluginRuntime
  private readonly transport: PluginTransport
  private readonly protocolVersion: string
  private readonly apiVersion: string
  private readonly supportedProtocolVersions: string[]
  private readonly supportedApiVersions: string[]
  private readonly dependencies = new DependencyService()
  private readonly permissions = new PermissionService()
  private readonly permissionResolver?: PluginHostOptions['permissionResolver']
  private readonly persistedPermissionGrants = new Map<string, ModulePermissionGrant>()
  private readonly resources = new ResourceService()

  constructor(options: PluginHostOptions = {}) {
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
  }

  private assertPermission(
    session: PluginHostSession,
    input: {
      area: 'apis' | 'resources' | 'capabilities' | 'processors' | 'pipelines'
      action: string
      key: string
      reason?: string
    },
  ) {
    const allowed = this.permissions.isAllowed(session.identity.plugin.id, input.area, input.action, input.key)
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

  listSessions() {
    return this.sessionService.list()
  }

  getSession(sessionId: string) {
    return this.sessionService.get(sessionId)
  }

  async load(manifest: ManifestV1, options: PluginLoadOptions = {}): Promise<PluginHostSession> {
    // Step 0 (channel gateway preparation): resolve runtime and transport for this plugin.
    const runtime = options.runtime ?? this.runtime
    const sessionCwd = options.cwd ?? cwd() // Explicitly assign the default CWD.
    const transport = this.transport

    // TODO: implement other transports and runtime bindings.
    // alpha scope guard:
    // we intentionally fail fast for non in-memory transports while iterating on lifecycle design.
    if (transport.kind !== 'in-memory') {
      throw new Error(`Only in-memory transport is currently supported by PluginHost alpha. Got: ${transport.kind}`)
    }

    // Build per-session identity.
    const sessionIdentity = this.sessionService.nextSessionIdentity(manifest.name)
    const sessionIndex = sessionIdentity.index
    const id = sessionIdentity.sessionId
    const identity = sessionIdentity.moduleIdentity

    // Step 1 (connect/control-plane prep): create an isolated Eventa context per plugin.
    // All invokes/events for this plugin go through this context to prevent cross-talk.
    const hostChannel = createPluginContext(transport)
    const lifecycle = createActor(pluginLifecycleMachine)
    lifecycle.start()

    const permissionSnapshot = this.permissions.initialize(identity.plugin.id, manifest.permissions, {
      persisted: this.persistedPermissionGrants.get(identity.plugin.id),
    })

    const session: PluginHostSession = {
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
      apis: createBoundApis(hostChannel),
      permissions: {
        requested: permissionSnapshot.requested,
        granted: permissionSnapshot.granted,
        revision: permissionSnapshot.revision,
      },
    }

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
      // Load plugin module from manifest-selected runtime entrypoint.
      // This is where malformed entrypoints or import errors surface.
      session.plugin = await this.loader.loadPluginFor(manifest, {
        cwd: sessionCwd,
        runtime,
      })

      // Assert lifecycle progression (`loading` -> `loaded`) to keep transition rules explicit.
      // This prevents accidental phase drift if the method evolves later.
      assertTransition(session, 'loaded')
      return session
    }
    catch (error) {
      // Load failure is terminal for this session (`loading` -> `failed`).
      // Emit status so Configurator/observers can show deterministic diagnostics.
      markFailedTransition(session)
      session.channels.host.emit(moduleStatus, {
        identity: session.identity,
        phase: 'failed',
        reason: error instanceof Error ? error.message : 'Failed to load plugin.',
      })

      throw error
    }
  }

  async init(sessionId: string, options: PluginStartOptions = {}): Promise<PluginHostSession> {
    // `init` starts at procedure step 2 (authenticate) and drives lifecycle to ready.
    const session = this.sessionService.get(sessionId)
    if (!session) {
      throw new Error(`Unable to initialize plugin session: ${sessionId}`)
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
        modules: this.listSessions()
          .filter(item => item.phase !== 'stopped')
          .map(item => ({
            name: item.manifest.name,
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

      const grantedSnapshot = this.permissions.initialize(session.identity.plugin.id, session.permissions.requested, {
        grant: resolvedGrant,
        persisted: this.persistedPermissionGrants.get(session.identity.plugin.id),
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
        name: session.manifest.name,
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

      // Optional dependency gate before plugin-owned initialization.
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

      // Run plugin-owned init hook. Returning `false` explicitly aborts startup.
      const initResult = await session.plugin.init?.({
        channels: session.channels,
        apis: session.apis,
      })

      if (initResult === false) {
        throw new Error(`Plugin initialization aborted by plugin: ${session.manifest.name}`)
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

      return session
    }
    catch (error) {
      // Any init failure is normalized into failed phase + status event for observability.
      markFailedTransition(session)

      session.channels.host.emit(moduleStatus, {
        identity: session.identity,
        phase: 'failed',
        reason: error instanceof Error ? error.message : 'Plugin host initialization failed.',
      })

      throw error
    }
  }

  async start(manifest: ManifestV1, options: PluginStartOptions = {}) {
    // Convenience wrapper: "start" = load + init in sequence.
    // Keep this tiny so callers can still call `load`/`init` separately when needed.
    const session = await this.load(manifest, {
      cwd: options.cwd,
      runtime: options.runtime,
    })

    return this.init(session.id, options)
  }

  async applyConfiguration(sessionId: string, config: ModuleConfigEnvelope) {
    // Configuration is allowed only after prepare, during configuration-needed, or while re-configuring.
    const session = this.sessionService.get(sessionId)
    if (!session) {
      throw new Error(`Unable to configure plugin session: ${sessionId}`)
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
      throw new Error(`Unable to request permissions for plugin session: ${sessionId}`)
    }

    const snapshot = this.permissions.declare(session.identity.plugin.id, requested)
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
      throw new Error(`Unable to grant permissions for plugin session: ${sessionId}`)
    }

    const snapshot = this.permissions.grant(session.identity.plugin.id, grant)
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
      throw new Error(`Unable to update plugin session: ${sessionId}`)
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

  stop(sessionId: string) {
    // Stop removes session from active registry. Lifecycle first transitions to `stopped`.
    const session = this.sessionService.get(sessionId)
    if (!session) {
      return undefined
    }

    // Prefer guarded transition when allowed; otherwise force-close as a safety fallback.
    if (session.phase !== 'stopped') {
      const canStop = session.lifecycle.getSnapshot().can({ type: 'STOP' })
      if (canStop) {
        assertTransition(session, 'stopped')
      }
      else {
        session.phase = 'stopped'
      }
    }

    session.lifecycle.stop()
    this.sessionService.remove(session.id)
    return session
  }

  async reload(sessionId: string, options: PluginStartOptions = {}) {
    // Reload preserves manifest/runtime intent, then performs stop + fresh start.
    // This intentionally creates a new session identity for deterministic re-bootstrap.
    const previous = this.sessionService.get(sessionId)
    if (!previous) {
      throw new Error(`Unable to reload missing plugin session: ${sessionId}`)
    }

    const manifest = previous.manifest
    this.stop(sessionId)
    return this.start(manifest, {
      ...options,
      cwd: options.cwd ?? previous.cwd,
      runtime: options.runtime ?? previous.runtime,
    })
  }
}
