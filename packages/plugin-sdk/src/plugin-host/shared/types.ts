import type {
  ExtensionIdentity as ProtocolExtensionIdentity,
  ModulePermissionDeclaration as ProtocolModulePermissionDeclaration,
  ModulePermissionGrant as ProtocolModulePermissionGrant,
} from '@proj-airi/plugin-protocol/types'
import type { GenericSchema } from 'valibot'

import type { KitDescriptor } from './kits'

import semver from 'semver'

import { isPlainObject } from 'es-toolkit'
import {
  array,
  boolean,
  check,
  finite,
  lazy,
  literal,
  minLength,
  minValue,
  null_,
  number,
  optional,
  picklist,
  pipe,
  record,
  regex,
  safeInteger,
  strictObject,
  string,
  trim,
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
  = | boolean
    | HostDataArray
    | HostDataRecord
    | null
    | number
    | string

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
export function createHostDataValueSchema(): GenericSchema<HostDataValue> {
  return union([
    null_(),
    string(),
    boolean(),
    pipe(number(), finite()),
    array(lazy(createHostDataValueSchema)),
    pipe(record(string(), lazy(createHostDataValueSchema)), check<HostDataRecord>(isPlainObject)),
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
export const hostDataRecordSchema = pipe(
  record(string(), lazy(createHostDataValueSchema)),
  check<HostDataRecord>(isPlainObject),
)

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
 * Declares one Kit that an Extension provides.
 *
 * The Host uses this declaration for conflict detection before it loads code.
 */
export interface ExtensionProvidedKitDeclaration {
  /** Stable Kit contract identifier. */
  id: string
  /** Exact version that the Provider implements. */
  version: string
  /** Transport boundary that the Provider permits. */
  exposure: 'local-only' | 'remote-observable' | 'remote-callable'
}

/**
 * Declares one Kit that an Extension consumes.
 *
 * Required declarations participate in activation planning. Optional declarations
 * let an Extension start before a Provider is available.
 */
export interface ExtensionUsedKitDeclaration {
  /** Stable Kit contract identifier. */
  id: string
  /** Version range accepted by the Consumer. */
  version: string
  /** Whether the Extension can start without this Kit. @default false */
  optional?: boolean
}

/** Describes the Kit contracts that an Extension provides or consumes. */
export interface ExtensionKitManifest {
  provides?: ExtensionProvidedKitDeclaration[]
  uses?: ExtensionUsedKitDeclaration[]
}

/**
 * Describes a version-2 Extension manifest consumed by `ExtensionHost`.
 *
 * The manifest is the package contract for discovery, import, compatibility,
 * permissions, and activation planning. Runtime registration happens later.
 */
export interface ExtensionManifestV2 {
  /** Manifest schema version expected by the current Host. */
  manifestVersion: 2
  /** Manifest kind discriminator used to identify AIRI Extension manifests. */
  kind: 'manifest.extension.airi.moeru.ai'
  /** Stable Extension identifier used for installation and session identity. */
  id: string
  /** Extension package version. */
  version: string
  /** AIRI compatibility range and supported runtimes. */
  engines: {
    airi: string
    runtimes: PluginRuntime[]
  }
  /** Runtime-specific Extension entrypoints that the Host can resolve and import. */
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
  /** Package and session permission ceiling that Module permissions cannot exceed. */
  permissions: ModulePermissionDeclaration
  /** Kit contracts used to build the static activation plan. */
  kits?: ExtensionKitManifest
}

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

const localizableSchema = union([
  string(),
  strictObject({
    fallback: optional(string()),
    key: string(),
    params: optional(record(string(), union([string(), number(), boolean()]))),
  }),
])

const permissionSpecFields = {
  key: pipe(string(), trim(), minLength(1)),
  label: optional(localizableSchema),
  reason: optional(localizableSchema),
  required: optional(boolean()),
  metadata: optional(hostDataRecordSchema),
}

const permissionDeclarationSchema = strictObject({
  apis: optional(array(strictObject({
    ...permissionSpecFields,
    actions: pipe(array(picklist(['invoke', 'emit'])), minLength(1)),
  }))),
  capabilities: optional(array(strictObject({
    ...permissionSpecFields,
    actions: pipe(array(picklist(['wait', 'snapshot'])), minLength(1)),
  }))),
  pipelines: optional(array(strictObject({
    ...permissionSpecFields,
    actions: pipe(array(picklist(['hook', 'process', 'emit', 'manage'])), minLength(1)),
  }))),
  processors: optional(array(strictObject({
    ...permissionSpecFields,
    actions: pipe(array(picklist(['register', 'execute', 'manage'])), minLength(1)),
  }))),
  resources: optional(array(strictObject({
    ...permissionSpecFields,
    actions: pipe(array(picklist(['read', 'write', 'subscribe'])), minLength(1)),
  }))),
})

const manifestEntrypointSchema = pipe(string(), trim(), minLength(1))
const exactSemanticVersionSchema = pipe(
  string(),
  trim(),
  minLength(1),
  check(version => semver.valid(version) === version, 'Use an exact semantic version such as 1.0.0.'),
)
const semanticVersionRangeSchema = pipe(
  string(),
  trim(),
  minLength(1),
  check(version => semver.validRange(version) !== null, 'Use a valid semantic version range.'),
)
const extensionIdSchema = pipe(
  string(),
  trim(),
  minLength(1),
  regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, 'Use a file-safe lowercase Extension id.'),
)
const manifestEntrypointsSchema = pipe(
  strictObject({
    default: optional(manifestEntrypointSchema),
    electron: optional(manifestEntrypointSchema),
    node: optional(manifestEntrypointSchema),
    web: optional(manifestEntrypointSchema),
  }),
  check(
    entrypoints => Object.values(entrypoints).some(Boolean),
    'Define at least one Extension entrypoint.',
  ),
)

const providedKitDeclarationSchema = strictObject({
  id: pipe(string(), trim(), minLength(1)),
  version: exactSemanticVersionSchema,
  exposure: picklist(['local-only', 'remote-observable', 'remote-callable']),
})

const usedKitDeclarationSchema = strictObject({
  id: pipe(string(), trim(), minLength(1)),
  version: exactSemanticVersionSchema,
  optional: optional(boolean()),
})

const extensionKitManifestSchema = strictObject({
  provides: optional(array(providedKitDeclarationSchema)),
  uses: optional(array(usedKitDeclarationSchema)),
})

/**
 * Validates and normalizes a version-2 Extension manifest.
 *
 * Unknown fields fail validation. The schema also requires an entrypoint for
 * every declared runtime unless the manifest defines a default entrypoint.
 */
export const extensionManifestV2Schema = pipe(
  strictObject({
    manifestVersion: literal(2),
    kind: literal('manifest.extension.airi.moeru.ai'),
    id: extensionIdSchema,
    version: pipe(string(), trim(), minLength(1)),
    engines: strictObject({
      airi: semanticVersionRangeSchema,
      runtimes: pipe(
        array(pluginRuntimeSchema),
        minLength(1),
        check(runtimes => new Set(runtimes).size === runtimes.length, 'Declare each Extension runtime once.'),
      ),
    }),
    entrypoints: manifestEntrypointsSchema,
    permissions: permissionDeclarationSchema,
    kits: optional(extensionKitManifestSchema),
  }),
  check(
    manifest => manifest.engines.runtimes.every(runtime => manifest.entrypoints[runtime] || manifest.entrypoints.default),
    'Define an entrypoint for every declared runtime.',
  ),
)

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
  announceCapability: (key: string, metadata?: Record<string, unknown>) => void
  markCapabilityDegraded: (key: string, metadata?: Record<string, unknown>) => void
  markCapabilityReady: (key: string, metadata?: Record<string, unknown>) => void
  registerKit: (kit: KitDescriptor) => KitDescriptor
  setResourceResolver: <T>(key: string, resolver: () => Promise<T> | T) => void
  setResourceValue: <T>(key: string, value: T) => void
  unregisterKit: (kitId: string) => KitDescriptor | undefined
  withdrawCapability: (key: string, metadata?: Record<string, unknown>) => void
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
  /** Running AIRI version used to enforce `engines.airi` before setup. */
  airiVersion?: string
  /** Installable host features that can register kits, resources, and capabilities. @default [] */
  contributions?: ExtensionHostContribution[]
  /** Callback that decides the granted permission set for one extension session. */
  permissionResolver?: (payload: {
    identity: ExtensionIdentity
    manifest: ExtensionManifestV2
    persisted?: ModulePermissionGrant
    requested: ModulePermissionDeclaration
  }) => ModulePermissionGrant | Promise<ModulePermissionGrant>
  /** Runtime used when callers do not override it per load/start call. @default 'electron' */
  runtime?: PluginRuntime
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
  action: string
  area: 'apis' | 'capabilities' | 'pipelines' | 'processors' | 'resources'
  key: string
  reason?: string
}

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
