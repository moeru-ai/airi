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

import {
  array,
  boolean,
  literal,
  number,
  object,
  optional,
  picklist,
  record,
  string,
  union,
} from 'valibot'

export type PluginRuntime = 'electron' | 'node' | 'web'

export type ModulePhase = ProtocolModulePhase

export type PluginSessionPhase
  = | 'loading'
    | 'loaded'
    | 'authenticating'
    | 'authenticated'
    | 'waiting-deps'
    | ModulePhase
    | 'stopped'

export type PluginIdentity = ProtocolPluginIdentity

export type ModuleIdentity = ProtocolModuleIdentity

export type ModuleConfigEnvelope<C = Record<string, unknown>> = ProtocolModuleConfigEnvelope<C>

export type ModuleCompatibilityRequest = ProtocolEvents['module:compatibility:request']

export type ModuleCompatibilityResult = ProtocolEvents['module:compatibility:result']

export type ModulePermissionDeclaration = ProtocolModulePermissionDeclaration

export type ModulePermissionGrant = ProtocolModulePermissionGrant

export interface ManifestV1 {
  apiVersion: 'v1'
  kind: 'manifest.plugin.airi.moeru.ai'
  name: string
  permissions: ModulePermissionDeclaration
  entrypoints: {
    default?: string
    electron?: string
    node?: string
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

export interface PluginLoadOptions {
  cwd?: string
  runtime?: PluginRuntime
}

export interface PluginHostOptions {
  runtime?: PluginRuntime
  transport?: PluginTransport
  protocolVersion?: string
  apiVersion?: string
  supportedProtocolVersions?: string[]
  supportedApiVersions?: string[]
  permissionResolver?: (payload: {
    identity: ModuleIdentity
    manifest: ManifestV1
    requested: ModulePermissionDeclaration
    persisted?: ModulePermissionGrant
  }) => ModulePermissionGrant | Promise<ModulePermissionGrant>
}

export interface PluginStartOptions {
  cwd?: string
  runtime?: PluginRuntime
  requireConfiguration?: boolean
  compatibility?: Omit<ModuleCompatibilityRequest, 'protocolVersion' | 'apiVersion'>
  requiredCapabilities?: string[]
  capabilityWaitTimeoutMs?: number
}
