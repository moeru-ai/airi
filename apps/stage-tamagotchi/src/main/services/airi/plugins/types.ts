import type { ManifestV1, PluginHost } from '@proj-airi/plugin-sdk/plugin-host'

import type {
  WidgetsAddPayload,
  WidgetSnapshot,
  WidgetsUpdatePayload,
} from '../../../../shared/eventa'

/**
 * Runtime-facing plugin host service bundle returned by setup.
 *
 * Use when:
 * - Bootstrapping plugin infrastructure during Electron startup
 * - Accessing loaded manifests after host initialization
 *
 * Expects:
 * - `host` is an initialized Electron runtime plugin host
 * - `manifests` reflect the latest loaded manifest snapshot at setup time
 *
 * Returns:
 * - A stable object containing host instance and manifest list
 */
export interface PluginHostService {
  host: PluginHost
  manifests: ManifestV1[]
}

/**
 * Describes the widget manager surface required by plugin-driven gamelet APIs.
 *
 * Use when:
 * - `setupPluginHost(...)` needs to open, update, or close extension-ui widgets
 *
 * Expects:
 * - Widget ids remain stable and may be reused for the same module id
 *
 * Returns:
 * - The minimal widget-manager contract consumed by the plugin host service
 */
export interface PluginHostGameletWidgetsManager {
  openWindow: (params?: { id?: string }) => Promise<void>
  pushWidget: (payload: WidgetsAddPayload) => Promise<string>
  updateWidget: (payload: WidgetsUpdatePayload) => Promise<void>
  removeWidget: (id: string) => Promise<void>
  getWidgetSnapshot: (id: string) => WidgetSnapshot | undefined
}

/**
 * Configures the runtime dependencies required by `setupPluginHost(...)`.
 *
 * Use when:
 * - Wiring the plugin host during Electron startup
 * - Providing test doubles for plugin-driven gamelet orchestration
 *
 * Expects:
 * - `widgetsManager` is already initialized and ready to manage overlay widgets
 *
 * Returns:
 * - N/A
 */
export interface SetupPluginHostOptions {
  widgetsManager: PluginHostGameletWidgetsManager
}

/**
 * Binding announcement payload used by plugin-side runtime registration.
 *
 * Use when:
 * - Announcing a new module for a registered kit
 * - Reusing existing module ownership with the same module identifier
 *
 * Expects:
 * - `moduleId` is unique per owner session/plugin pair
 * - `kitId` and `kitModuleType` map to a registered kit descriptor
 * - `config` is a JSON-compatible record
 *
 * Returns:
 * - N/A
 */
export interface PluginHostBindingAnnounceInput {
  moduleId: string
  kitId: string
  kitModuleType: string
  config: Record<string, unknown>
}

/**
 * Optional filters for listing announced bindings.
 *
 * Use when:
 * - Querying only modules from one session
 * - Querying modules belonging to one kit
 *
 * Expects:
 * - Any provided key is treated as a strict equality filter
 *
 * Returns:
 * - N/A
 */
export interface PluginHostBindingListOptions {
  ownerSessionId?: string
  kitId?: string
}

/**
 * Persisted plugin configuration snapshot.
 *
 * Use when:
 * - Reading/writing enabled and auto-reload plugin state
 * - Keeping known plugin manifest path metadata
 *
 * Expects:
 * - Arrays contain plugin manifest names
 * - `known` maps plugin names to canonical manifest paths
 *
 * Returns:
 * - N/A
 */
export interface PluginConfig {
  enabled: string[]
  autoReload: string[]
  known: Record<string, { path: string }>
}

/**
 * Internal manifest record with resolved location and package version.
 *
 * Use when:
 * - Loading plugin manifests from disk
 * - Resolving runtime entrypoints and extension asset metadata
 *
 * Expects:
 * - `manifest` is schema-validated
 * - `path` points to `plugin.airi.json`
 * - `rootDir` is the plugin root directory
 * - `version` is discovered from package metadata or fallback
 *
 * Returns:
 * - N/A
 */
export interface ManifestEntry {
  manifest: ManifestV1
  path: string
  rootDir: string
  version: string
}
