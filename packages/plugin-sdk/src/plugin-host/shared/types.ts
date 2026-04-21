import type {
  ProtocolEvents,
  ModuleConfigEnvelope as ProtocolModuleConfigEnvelope,
  ModuleIdentity as ProtocolModuleIdentity,
  ModulePermissionDeclaration as ProtocolModulePermissionDeclaration,
  ModulePermissionGrant as ProtocolModulePermissionGrant,
  ModulePhase as ProtocolModulePhase,
  PluginIdentity as ProtocolPluginIdentity,
} from '@proj-airi/plugin-protocol/types'

import type { PluginTransport } from '../transports'

import { isPlainObject } from 'es-toolkit'
import {
  array,
  boolean,
  check,
  finite,
  lazy,
  literal,
  minValue,
  number,
  object,
  optional,
  picklist,
  pipe,
  record,
  safeInteger,
  string,
  union,
} from 'valibot'

/**
 * Lists the supported plugin runtimes recognized by the host.
 *
 * Use when:
 * - Validating manifest entrypoints or host runtime configuration
 * - Narrowing `PluginRuntime` to the canonical literals
 *
 * Expects:
 * - Runtime-specific code branches use one of these exact values
 *
 * Returns:
 * - The canonical runtime literals used throughout plugin-sdk
 */
export const pluginRuntimeValues = ['electron', 'node', 'web'] as const
/**
 * Describes one supported plugin runtime.
 *
 * Use when:
 * - Typing host runtime configuration and manifest runtime selection
 *
 * Expects:
 * - Values come from {@link pluginRuntimeValues}
 *
 * Returns:
 * - The union of valid runtime literals
 */
export type PluginRuntime = typeof pluginRuntimeValues[number]
/**
 * Validates one runtime literal from {@link pluginRuntimeValues}.
 *
 * Use when:
 * - Parsing runtime values from host options or descriptors
 *
 * Expects:
 * - Inputs are runtime strings such as `electron`, `node`, or `web`
 *
 * Returns:
 * - A Valibot schema for one plugin runtime literal
 */
export const pluginRuntimeSchema = picklist(pluginRuntimeValues)

/**
 * Describes a JSON-like array accepted by plugin-host shared data schemas.
 *
 * Use when:
 * - Typing serializable arrays inside binding config, resource payloads, or tool schemas
 *
 * Expects:
 * - Every element is a {@link HostDataValue}
 *
 * Returns:
 * - A recursive array interface for host-safe data
 */
export interface HostDataArray extends Array<HostDataValue> {}

/**
 * Describes a JSON-like object accepted by plugin-host shared data schemas.
 *
 * Use when:
 * - Typing serializable records inside binding config, resource payloads, or tool schemas
 *
 * Expects:
 * - Every property value is a {@link HostDataValue}
 *
 * Returns:
 * - A recursive record interface for host-safe data
 */
export interface HostDataRecord {
  [key: string]: HostDataValue
}

/**
 * Describes the recursive JSON-like value model accepted by the host.
 *
 * Use when:
 * - Typing payloads that must stay serializable across plugin boundaries
 *
 * Expects:
 * - Values are limited to primitives, arrays, or plain-object records
 *
 * Returns:
 * - The recursive union used across shared host data structures
 */
export type HostDataValue
  = | null
    | string
    | number
    | boolean
    | HostDataArray
    | HostDataRecord

/**
 * Creates the recursive Valibot schema used for one {@link HostDataValue}.
 *
 * Use when:
 * - You need a fresh recursive schema instance for nested host data validation
 *
 * Expects:
 * - Values are plain JSON-like data and not class instances
 *
 * Returns:
 * - A Valibot schema covering the full `HostDataValue` recursion
 */
export function createHostDataValueSchema() {
  return union([
    literal(null),
    string(),
    boolean(),
    pipe(number(), finite()),
    array(lazy(createHostDataValueSchema)),
    pipe(record(string(), lazy(createHostDataValueSchema)), check(isPlainObject)),
  ])
}

/**
 * Validates one recursive host-safe value.
 *
 * Use when:
 * - Parsing individual payload values shared across the host boundary
 *
 * Expects:
 * - Inputs conform to the {@link HostDataValue} model
 *
 * Returns:
 * - A Valibot schema instance for one host-safe value
 */
export const hostDataValueSchema = createHostDataValueSchema()

/**
 * Validates one plain-object host-safe record.
 *
 * Use when:
 * - Parsing config objects, metadata records, and JSON-schema-like payloads
 *
 * Expects:
 * - Inputs are plain objects with {@link HostDataValue} values
 *
 * Returns:
 * - A Valibot schema for one host-safe record
 */
export const hostDataRecordSchema = pipe(record(string(), lazy(createHostDataValueSchema)), check(isPlainObject))

/**
 * Validates one non-negative safe integer used for timestamps and revisions.
 *
 * Use when:
 * - Parsing revision counters and host-generated timestamps
 *
 * Expects:
 * - Inputs are safe integers greater than or equal to zero
 *
 * Returns:
 * - A Valibot schema for non-negative safe integers
 */
export const nonNegativeIntegerSchema = pipe(number(), safeInteger(), minValue(0))

/**
 * Re-exports the protocol module phase literals used by the host.
 *
 * Use when:
 * - Typing module lifecycle phases shared with `@proj-airi/plugin-protocol`
 *
 * Expects:
 * - Values follow the protocol package lifecycle model
 *
 * Returns:
 * - The protocol-defined module phase union
 */
export type ModulePhase = ProtocolModulePhase

/**
 * Describes all phases a plugin session can occupy inside `PluginHost`.
 *
 * Use when:
 * - Typing `PluginHostSession.phase`
 * - Checking host lifecycle transitions
 *
 * Expects:
 * - Protocol phases are extended with host-only bootstrap and shutdown phases
 *
 * Returns:
 * - The full plugin-session lifecycle union
 */
export type PluginSessionPhase
  = | 'loading'
    | 'loaded'
    | 'authenticating'
    | 'authenticated'
    | 'waiting-deps'
    | ModulePhase
    | 'stopped'

/**
 * Re-exports the protocol plugin identity model used by the host.
 *
 * Use when:
 * - Typing per-plugin identity values stored on sessions and events
 *
 * Expects:
 * - Values originate from the protocol identity generator or host session service
 *
 * Returns:
 * - The protocol-defined plugin identity type
 */
export type PluginIdentity = ProtocolPluginIdentity

/**
 * Re-exports the protocol module identity model used by the host.
 *
 * Use when:
 * - Typing plugin session identities and protocol event payloads
 *
 * Expects:
 * - Values originate from the protocol identity generator or host session service
 *
 * Returns:
 * - The protocol-defined module identity type
 */
export type ModuleIdentity = ProtocolModuleIdentity

/**
 * Re-exports the protocol configuration envelope used for plugin configuration state.
 *
 * Use when:
 * - Typing configuration payloads stored or emitted by the host
 *
 * Expects:
 * - `C` describes the full configuration object carried in the envelope
 *
 * Returns:
 * - The protocol-defined configuration envelope type
 */
export type ModuleConfigEnvelope<C = Record<string, unknown>> = ProtocolModuleConfigEnvelope<C>

/**
 * Re-exports the protocol compatibility request payload type.
 *
 * Use when:
 * - Typing compatibility negotiation messages in the host
 *
 * Expects:
 * - Values conform to the protocol event payload
 *
 * Returns:
 * - The protocol-defined compatibility request type
 */
export type ModuleCompatibilityRequest = ProtocolEvents['module:compatibility:request']

/**
 * Re-exports the protocol compatibility result payload type.
 *
 * Use when:
 * - Typing compatibility negotiation responses in the host
 *
 * Expects:
 * - Values conform to the protocol event payload
 *
 * Returns:
 * - The protocol-defined compatibility result type
 */
export type ModuleCompatibilityResult = ProtocolEvents['module:compatibility:result']

/**
 * Re-exports the protocol permission declaration model used by manifests and runtime permission flow.
 *
 * Use when:
 * - Typing requested permissions in plugin manifests and host sessions
 *
 * Expects:
 * - Values conform to the protocol permission declaration model
 *
 * Returns:
 * - The protocol-defined permission declaration type
 */
export type ModulePermissionDeclaration = ProtocolModulePermissionDeclaration

/**
 * Re-exports the protocol permission grant model used by host policy resolution.
 *
 * Use when:
 * - Typing granted or persisted permissions in the host
 *
 * Expects:
 * - Values conform to the protocol permission grant model
 *
 * Returns:
 * - The protocol-defined permission grant type
 */
export type ModulePermissionGrant = ProtocolModulePermissionGrant

/**
 * Describes a version-1 plugin manifest consumed by `PluginHost`.
 *
 * Use when:
 * - Loading a plugin from disk or another runtime
 * - Typing manifest values in tests and host options
 *
 * Expects:
 * - `kind` and `apiVersion` match the current manifest format
 *
 * Returns:
 * - The structured plugin manifest contract understood by the host
 */
export interface ManifestV1 {
  /** Manifest schema version expected by the current host implementation. */
  apiVersion: 'v1'
  /** Manifest kind discriminator used to identify AIRI plugin manifests. */
  kind: 'manifest.plugin.airi.moeru.ai'
  /** Stable plugin name used for identity generation and display. */
  name: string
  /** Requested permissions that the host will evaluate and grant. */
  permissions: ModulePermissionDeclaration
  /** Runtime-specific module entrypoints that the host can resolve and import. */
  entrypoints: {
    /** Fallback entrypoint used when no runtime-specific path is provided. */
    default?: string
    /** Electron-specific entrypoint path. */
    electron?: string
    /** Node-specific entrypoint path. */
    node?: string
    /** Web-specific entrypoint path. */
    web?: string
  }
}

const localizableSchema = union([
  string(),
  object({
    key: string(),
    fallback: optional(string()),
    params: optional(record(string(), union([string(), number(), boolean()]))),
  }),
])

/**
 * Validates a version-1 plugin manifest.
 *
 * Use when:
 * - Parsing plugin manifests before loading them into the host
 *
 * Expects:
 * - Inputs follow the `ManifestV1` shape including permission declarations and entrypoints
 *
 * Returns:
 * - A Valibot schema for the AIRI plugin manifest format
 */
export const manifestV1Schema = object({
  apiVersion: literal('v1'),
  kind: literal('manifest.plugin.airi.moeru.ai'),
  name: string(),
  permissions: object({
    apis: optional(array(object({
      key: string(),
      actions: array(picklist(['invoke', 'emit'])),
      reason: optional(localizableSchema),
      label: optional(localizableSchema),
      required: optional(boolean()),
    }))),
    resources: optional(array(object({
      key: string(),
      actions: array(picklist(['read', 'write', 'subscribe'])),
      reason: optional(localizableSchema),
      label: optional(localizableSchema),
      required: optional(boolean()),
    }))),
    capabilities: optional(array(object({
      key: string(),
      actions: array(picklist(['wait', 'snapshot'])),
      reason: optional(localizableSchema),
      label: optional(localizableSchema),
      required: optional(boolean()),
    }))),
    processors: optional(array(object({
      key: string(),
      actions: array(picklist(['register', 'execute', 'manage'])),
      reason: optional(localizableSchema),
      label: optional(localizableSchema),
      required: optional(boolean()),
    }))),
    pipelines: optional(array(object({
      key: string(),
      actions: array(picklist(['hook', 'process', 'emit', 'manage'])),
      reason: optional(localizableSchema),
      label: optional(localizableSchema),
      required: optional(boolean()),
    }))),
  }),
  entrypoints: object({
    default: optional(string()),
    electron: optional(string()),
    node: optional(string()),
    web: optional(string()),
  }),
})

/**
 * Configures how the host resolves and loads a plugin entrypoint.
 *
 * Use when:
 * - Calling `PluginHost.load(...)` or loader helpers directly
 *
 * Expects:
 * - Omitted fields fall back to host defaults
 *
 * Returns:
 * - Runtime and working-directory overrides for one load operation
 */
export interface PluginLoadOptions {
  /** Working directory used to resolve relative manifest entrypoints. */
  cwd?: string
  /** Runtime used when selecting a manifest entrypoint. */
  runtime?: PluginRuntime
}

/**
 * Configures one `PluginHost` instance.
 *
 * Use when:
 * - Constructing a host with specific runtime, transport, or permission behavior
 *
 * Expects:
 * - Omitted fields fall back to the host defaults documented below
 *
 * Returns:
 * - The host bootstrap options consumed by {@link import('../core').PluginHost}
 */
export interface PluginHostOptions {
  /** Runtime used when callers do not override it per load/start call. @default 'electron' */
  runtime?: PluginRuntime
  /** Transport used when callers do not override it per load/start call. @default { kind: 'in-memory' } */
  transport?: PluginTransport
  /** Protocol version advertised during compatibility negotiation. @default 'v1' */
  protocolVersion?: string
  /** Plugin SDK API version advertised during compatibility negotiation. @default 'v1' */
  apiVersion?: string
  /** Additional protocol versions the host is willing to negotiate. @default [] */
  supportedProtocolVersions?: string[]
  /** Additional API versions the host is willing to negotiate. @default [] */
  supportedApiVersions?: string[]
  /** Callback that decides the granted permission set for one plugin session. */
  permissionResolver?: (payload: {
    identity: ModuleIdentity
    manifest: ManifestV1
    requested: ModulePermissionDeclaration
    persisted?: ModulePermissionGrant
  }) => ModulePermissionGrant | Promise<ModulePermissionGrant>
}

/**
 * Configures one `PluginHost.start(...)` or `PluginHost.init(...)` call.
 *
 * Use when:
 * - Starting a session with runtime, compatibility, or capability-wait overrides
 *
 * Expects:
 * - Omitted fields fall back to host defaults or method-local defaults
 *
 * Returns:
 * - Per-start overrides for initialization behavior
 */
export interface PluginStartOptions {
  /** Working directory used to resolve relative manifest entrypoints. */
  cwd?: string
  /** Runtime override used for this specific start operation. */
  runtime?: PluginRuntime
  /** Whether initialization should stop in configuration-needed instead of auto-readying. */
  requireConfiguration?: boolean
  /** Compatibility ranges sent during protocol negotiation. */
  compatibility?: Omit<ModuleCompatibilityRequest, 'protocolVersion' | 'apiVersion'>
  /** Capability keys that must become ready before the session can proceed. */
  requiredCapabilities?: string[]
  /** Wait timeout applied to each required capability. @default 15000 */
  capabilityWaitTimeoutMs?: number
}
