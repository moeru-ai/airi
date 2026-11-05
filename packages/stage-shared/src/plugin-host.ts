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
 * The plan remains valid while its management renderer owns it. The renderer
 * sends only `planId` when the user confirms the import.
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

/** One service of the plugin host graph. Values come from injeca `graph().services()`. */
export interface PluginHostGraphServiceSummary {
  key: string
  kind: 'service' | 'invocation'
  /** The owner record of the container, for example `{ kind: 'plugin', pluginId, sessionId }`. */
  owner: Record<string, unknown>
  phase: string
  /** The effective status of a running service. */
  status?: 'ready' | 'degraded' | 'unavailable'
  instanceId?: string
  exported: boolean
  /** The owner record of the consumer container of a per-consumer instance. */
  consumer?: Record<string, unknown>
}

/** One record of the plugin host observe stream. */
export interface PluginHostGraphEvent {
  type: string
  key: string
  owner: Record<string, unknown>
  from?: string
  to?: string
  decision?: string
  hook?: string
  reason?: string
  /** Millisecond timestamp from the host process. */
  at: number
}

/** A read-only view of the plugin host graph. */
export interface PluginHostGraphSummary {
  services: PluginHostGraphServiceSummary[]
  /** Why each session that is not ready waits, one sentence for each blocker. */
  explanations: Array<{ sessionId: string, extensionId: string, lines: string[] }>
  /** The last records of the observe stream, oldest first. */
  events: PluginHostGraphEvent[]
}

/** Registry and runtime state captured together for Plugin Host tooling. */
export interface PluginHostDebugSnapshot {
  registry: PluginRegistrySnapshot
  sessions: PluginHostSessionSummary[]
  kits: PluginHostKitSummary[]
  modules: PluginHostModuleSummary[]
  capabilities: PluginCapabilityState[]
  /** The injeca graph of the plugin host. */
  graph?: PluginHostGraphSummary
  /** Millisecond timestamp when this complete snapshot was captured. */
  refreshedAt: number
}
