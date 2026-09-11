/** A discovered Extension and its persisted and runtime state. */
export interface PluginManifestSummary {
  extensionId: string
  entrypoints: Record<string, string | undefined>
  /** Absolute manifest path owned by the host. */
  path: string
  enabled: boolean
  autoReload: boolean
  loaded: boolean
  isNew: boolean
}

/** A point-in-time view of every manifest known to one Plugin Host. */
export interface PluginRegistrySnapshot {
  root: string
  plugins: PluginManifestSummary[]
}

/** One permission shown before an Extension folder is imported. */
export interface ExtensionDirectoryImportPermissionSummary {
  area: 'apis' | 'capabilities' | 'pipelines' | 'processors' | 'resources'
  key: string
  actions: string[]
  required: boolean
}

/** One Kit contract shown before an Extension folder is imported. */
export interface ExtensionDirectoryImportKitSummary {
  direction: 'provides' | 'uses'
  id: string
  version: string
  /** Whether a missing consumed Kit may be ignored. @default false */
  optional?: boolean
  /** How consumers may access a provided Kit. */
  exposure?: 'local-only' | 'remote-observable' | 'remote-callable'
}

/**
 * Immutable package facts returned before an Extension folder is imported.
 *
 * The plan expires after a short time. The renderer sends only `planId` when
 * the user confirms the import.
 */
export interface ExtensionDirectoryImportPlan {
  planId: string
  sourcePath: string
  extensionId: string
  version: string
  runtimes: Array<'electron' | 'node' | 'web'>
  entrypoints: Record<string, string | undefined>
  permissions: ExtensionDirectoryImportPermissionSummary[]
  kits: ExtensionDirectoryImportKitSummary[]
  fileCount: number
  totalBytes: number
  fingerprint: string
  createdAt: number
}

/** Result of opening the native Extension folder picker. */
export type ExtensionDirectoryImportPrepareResult
  = | { status: 'cancelled' }
    | { status: 'ready', plan: ExtensionDirectoryImportPlan }

/** A capability lifecycle snapshot stored by the Plugin Host. */
export interface PluginCapabilityState {
  key: string
  state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
  metadata?: Record<string, unknown>
  /** Millisecond timestamp from the host process. */
  updatedAt: number
}

/** One active Extension session owned by the Plugin Host. */
export interface PluginHostSessionSummary {
  /** Stable for the lifetime of one started Extension session. */
  id: string
  extensionId: string
  phase: string
  runtime: 'electron' | 'node' | 'web'
  moduleId: string
}

/** One capability exposed by a registered Kit. */
export interface PluginHostKitCapabilitySummary {
  key: string
  actions: string[]
}

/** One Kit registered in the Plugin Host. */
export interface PluginHostKitSummary {
  kitId: string
  version: string
  capabilities: PluginHostKitCapabilitySummary[]
  runtimes: Array<'electron' | 'node' | 'web'>
}

/** One Extension module binding registered in the Plugin Host. */
export interface PluginHostModuleSummary {
  moduleId: string
  ownerSessionId: string
  ownerExtensionId: string
  kitId: string
  kitModuleType: string
  state: 'announced' | 'active' | 'degraded' | 'withdrawn'
  runtime: 'electron' | 'node' | 'web'
  revision: number
  updatedAt: number
  /** JSON-compatible configuration captured from the binding. */
  config: Record<string, unknown>
}

/** Registry and runtime state captured together for Plugin Host tooling. */
export interface PluginHostDebugSnapshot {
  registry: PluginRegistrySnapshot
  sessions: PluginHostSessionSummary[]
  kits: PluginHostKitSummary[]
  modules: PluginHostModuleSummary[]
  capabilities: PluginCapabilityState[]
  /** Millisecond timestamp when this complete snapshot was captured. */
  refreshedAt: number
}
