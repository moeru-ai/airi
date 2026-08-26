import type { ExtensionHost, ExtensionManifestV1 } from '@proj-airi/plugin-sdk/plugin-host'

import type {
  WidgetsAddPayload,
  WidgetSnapshot,
  WidgetsUpdatePayload,
} from '../../../../shared/eventa'

/**
 * Stable manifest id used as the runtime identity for one extension.
 */
export type ExtensionId = string

/**
 * Runtime-facing extension host service bundle returned by setup.
 *
 * Use when:
 * - Bootstrapping extension infrastructure during Electron startup
 * - Accessing loaded manifests after host initialization
 *
 * Expects:
 * - `host` is an initialized Electron runtime extension host
 * - `manifests` reflect the latest loaded manifest snapshot at setup time
 *
 * Returns:
 * - A stable object containing host instance and manifest list
 */
export interface ExtensionHostService {
  host: ExtensionHost
  manifests: ExtensionManifestV1[]
}

/**
 * Describes the widget manager surface required by extension-driven gamelet APIs.
 *
 * Use when:
 * - `setupExtensionHost(...)` needs to open, update, or close extension-ui widgets
 *
 * Expects:
 * - Widget ids remain stable and may be reused for the same module id
 *
 * Returns:
 * - The minimal widget-manager contract consumed by the extension host service
 */
export interface ExtensionHostGameletWidgetsManager {
  openWindow: (params?: { id?: string }) => Promise<void>
  pushWidget: (payload: WidgetsAddPayload) => Promise<string>
  updateWidget: (payload: WidgetsUpdatePayload) => Promise<void>
  removeWidget: (id: string) => Promise<void>
  getWidgetSnapshot: (id: string) => WidgetSnapshot | undefined
  requestWidgetIframe: <TResponse extends Record<string, unknown> = Record<string, unknown>>(
    id: string,
    payload: Record<string, unknown>,
    options?: { timeoutMs?: number },
  ) => Promise<TResponse>
}

/**
 * Configures the runtime dependencies required by `setupExtensionHost(...)`.
 *
 * Use when:
 * - Wiring the extension host during Electron startup
 * - Providing test doubles for extension-driven gamelet orchestration
 *
 * Expects:
 * - `widgetsManager` is already initialized and ready to manage overlay widgets
 *
 * Returns:
 * - N/A
 */
export interface SetupExtensionHostOptions {
  widgetsManager: ExtensionHostGameletWidgetsManager
}

/**
 * Binding announcement payload used by extension-side runtime registration.
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
export interface ExtensionHostBindingAnnounceInput {
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
export interface ExtensionHostBindingListOptions {
  ownerSessionId?: string
  kitId?: string
}

/**
 * Persisted extension configuration snapshot.
 *
 * Use when:
 * - Reading/writing enabled and auto-reload extension state
 * - Keeping known extension manifest path metadata
 *
 * Expects:
 * - Arrays contain extension manifest ids
 * - `known` maps extension manifest ids to canonical manifest paths
 *
 * Returns:
 * - N/A
 */
export interface ExtensionConfig {
  enabled: ExtensionId[]
  autoReload: ExtensionId[]
  known: Record<ExtensionId, { path: string }>
}

/**
 * Internal manifest record with resolved location and package version.
 *
 * Use when:
 * - Loading extension manifests from disk
 * - Resolving runtime entrypoints and extension asset metadata
 *
 * Expects:
 * - `manifest` is schema-validated
 * - `path` points to `extension.airi.json`
 * - `rootDir` is the extension root directory
 * - `version` is discovered from package metadata or fallback
 *
 * Returns:
 * - N/A
 */
export interface ManifestEntry {
  manifest: ExtensionManifestV1
  path: string
  rootDir: string
  version: string
}
