import type {
  ExtensionIdentity as ProtocolExtensionIdentity,
  ModulePermissionDeclaration as ProtocolModulePermissionDeclaration,
  ModulePermissionGrant as ProtocolModulePermissionGrant,
} from '@proj-airi/plugin-protocol/types'

import type { KitDescriptor } from './kits'

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
 * Lists the supported extension runtimes recognized by the host.
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
 * Describes one supported extension runtime.
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
 * - A Valibot schema for one extension runtime literal
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
 * Re-exports the protocol extension identity model used by the host.
 *
 * Use when:
 * - Typing package/session-level extension authorization callbacks
 *
 * Expects:
 * - Values originate from extension manifests and host session identity generation
 *
 * Returns:
 * - The protocol-defined extension identity type
 */
export type ExtensionIdentity = ProtocolExtensionIdentity

/**
 * Re-exports the protocol permission declaration model used by manifests and runtime permission flow.
 *
 * Use when:
 * - Typing requested permissions in extension manifests and host sessions
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
 * Describes a version-1 extension manifest consumed by `ExtensionHost`.
 *
 * Extension manifests are the install/session-level package description. Module
 * registration happens later during `defineExtension({ setup })`.
 */
export interface ExtensionManifestV1 {
  /** Manifest schema version expected by the current host implementation. */
  apiVersion: 'v1'
  /** Manifest kind discriminator used to identify AIRI extension manifests. */
  kind: 'manifest.extension.airi.moeru.ai'
  /** Stable extension id used for identity generation and display. */
  id: string
  /** Package/session permission ceiling that module permissions are capped by. */
  permissions: ModulePermissionDeclaration
  /** Runtime-specific extension entrypoints that the host can resolve and import. */
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

const permissionDeclarationSchema = object({
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
})

const manifestEntrypointsSchema = object({
  default: optional(string()),
  electron: optional(string()),
  node: optional(string()),
  web: optional(string()),
})

/**
 * Validates a version-1 extension manifest.
 *
 * Use when:
 * - Parsing `extension.airi.json` before loading an extension into the host
 *
 * Expects:
 * - Inputs use `id`, not legacy plugin `name`
 * - `permissions` describes the extension-level install/session ceiling
 *
 * Returns:
 * - A Valibot schema for the AIRI extension manifest format
 */
export const extensionManifestV1Schema = object({
  apiVersion: literal('v1'),
  kind: literal('manifest.extension.airi.moeru.ai'),
  id: string(),
  permissions: permissionDeclarationSchema,
  entrypoints: manifestEntrypointsSchema,
})

/**
 * Configures how the host resolves and loads an extension entrypoint.
 *
 * Use when:
 * - Calling loader helpers directly
 *
 * Expects:
 * - Omitted fields fall back to host defaults
 *
 * Returns:
 * - Runtime and working-directory overrides for one load operation
 */
export interface ExtensionLoadOptions {
  /** Working directory used to resolve relative manifest entrypoints. */
  cwd?: string
  /** Runtime used when selecting a manifest entrypoint. */
  runtime?: PluginRuntime
}

/**
 * Configures one `ExtensionHost` instance.
 *
 * Use when:
 * - Constructing a host with specific runtime, permission, or contribution behavior
 *
 * Expects:
 * - Omitted fields fall back to the host defaults documented below
 *
 * Returns:
 * - The host bootstrap options consumed by {@link import('../core').ExtensionHost}
 */
export interface ExtensionHostOptions {
  /** Runtime used when callers do not override it per load/start call. @default 'electron' */
  runtime?: PluginRuntime
  /** Callback that decides the granted permission set for one extension session. */
  permissionResolver?: (payload: {
    identity: ExtensionIdentity
    manifest: ExtensionManifestV1
    requested: ModulePermissionDeclaration
    persisted?: ModulePermissionGrant
  }) => ModulePermissionGrant | Promise<ModulePermissionGrant>
  /** Installable host features that can register kits, resources, and capabilities. @default [] */
  contributions?: ExtensionHostContribution[]
}

/**
 * Describes one permission gate that a contribution-owned session API can enforce.
 *
 * Use when:
 * - A contribution method must check host-granted API, resource, or capability access
 *
 * Expects:
 * - The permission key/action pair matches the manifest permission contract
 *
 * Returns:
 * - The permission request consumed by `ExtensionHost.assertPermission(...)`
 */
export interface ExtensionHostPermissionRequest {
  area: 'apis' | 'resources' | 'capabilities' | 'processors' | 'pipelines'
  action: string
  key: string
  reason?: string
}

/**
 * Provides the host-owned registration surface that contributions can use during installation.
 *
 * Use when:
 * - Installing a host feature into `ExtensionHost`
 * - Registering kits, resources, or capabilities
 *
 * Expects:
 * - Installation happens during `ExtensionHost` construction
 *
 * Returns:
 * - Registration helpers that keep `ExtensionHost` generic while allowing host-specific features
 */
export interface ExtensionHostInstallContext {
  registerKit: (kit: KitDescriptor) => KitDescriptor
  unregisterKit: (kitId: string) => KitDescriptor | undefined
  setResourceResolver: <T>(key: string, resolver: () => Promise<T> | T) => void
  setResourceValue: <T>(key: string, value: T) => void
  announceCapability: (key: string, metadata?: Record<string, unknown>) => void
  markCapabilityReady: (key: string, metadata?: Record<string, unknown>) => void
  markCapabilityDegraded: (key: string, metadata?: Record<string, unknown>) => void
  withdrawCapability: (key: string, metadata?: Record<string, unknown>) => void
}

/**
 * Installs one generic host feature into `ExtensionHost`.
 *
 * Use when:
 * - The host should register kits, resources, capabilities, or runtime-specific behavior
 *
 * Expects:
 * - Installation is idempotent for one host instance
 * - Contributions keep domain-specific behavior out of the low-level host core
 *
 * Returns:
 * - No value; the contribution mutates the provided install context
 */
export interface ExtensionHostContribution {
  install: (context: ExtensionHostInstallContext) => void
}

/**
 * Configures one `ExtensionHost.start(...)` call.
 *
 * Use when:
 * - Starting a session with runtime or working-directory overrides
 *
 * Expects:
 * - Omitted fields fall back to host defaults or method-local defaults
 *
 * Returns:
 * - Per-start overrides for initialization behavior
 */
export interface ExtensionStartOptions {
  /** Working directory used to resolve relative manifest entrypoints. */
  cwd?: string
  /** Runtime override used for this specific start operation. */
  runtime?: PluginRuntime
}
