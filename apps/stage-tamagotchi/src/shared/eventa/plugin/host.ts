import type { PluginCapabilityState } from './capabilities'

import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Full plugin host inspection snapshot.
 *
 * Use when:
 * - Renderer devtools need registry, session, kit, and module state together
 *
 * Expects:
 * - All arrays are snapshots captured at `refreshedAt`
 *
 * Returns:
 * - N/A
 */
export interface PluginHostDebugSnapshot {
  capabilities: PluginCapabilityState[]
  kits: PluginHostKitSummary[]
  modules: PluginHostModuleSummary[]
  refreshedAt: number
  registry: PluginRegistrySnapshot
  sessions: PluginHostSessionSummary[]
}

/**
 * Capability summary exposed by one registered kit.
 *
 * Use when:
 * - Renderer tooling needs to show what actions a kit supports
 *
 * Expects:
 * - `actions` contains unique action identifiers
 *
 * Returns:
 * - N/A
 */
export interface PluginHostKitCapabilitySummary {
  actions: string[]
  key: string
}

/**
 * Registered kit summary exposed by the plugin host.
 *
 * Use when:
 * - Inspecting kit registration state from renderer tooling
 *
 * Expects:
 * - `capabilities` matches the installed kit descriptor state
 *
 * Returns:
 * - N/A
 */
export interface PluginHostKitSummary {
  capabilities: PluginHostKitCapabilitySummary[]
  kitId: string
  runtimes: Array<'electron' | 'node' | 'web'>
  version: string
}

/**
 * Registered plugin module binding summary.
 *
 * Use when:
 * - Inspecting plugin modules and deriving renderer-side extension UI state
 *
 * Expects:
 * - `config` is JSON-compatible and structured-clone-safe
 *
 * Returns:
 * - N/A
 */
export interface PluginHostModuleSummary {
  config: Record<string, unknown>
  kitId: string
  kitModuleType: string
  moduleId: string
  ownerExtensionId: string
  ownerSessionId: string
  revision: number
  runtime: 'electron' | 'node' | 'web'
  state: 'active' | 'announced' | 'degraded' | 'withdrawn'
  updatedAt: number
}

/**
 * Active plugin session summary.
 *
 * Use when:
 * - Inspecting the live plugin host runtime state
 *
 * Expects:
 * - `id` stays stable for the lifetime of one started plugin session
 *
 * Returns:
 * - N/A
 */
export interface PluginHostSessionSummary {
  extensionId: string
  id: string
  moduleId: string
  phase: string
  runtime: 'electron' | 'node' | 'web'
}

/**
 * Renderer-facing plugin manifest summary.
 *
 * Use when:
 * - Listing discovered plugins in devtools or settings surfaces
 *
 * Expects:
 * - `path` points to the manifest file on disk
 *
 * Returns:
 * - N/A
 */
export interface PluginManifestSummary {
  autoReload: boolean
  enabled: boolean
  entrypoints: Record<string, string | undefined>
  extensionId: string
  isNew: boolean
  loaded: boolean
  path: string
}

/**
 * Plugin-driven widget payload forwarded into the extension UI host.
 *
 * Use when:
 * - A plugin module mounts its widget UI inside the renderer
 *
 * Expects:
 * - `moduleId` matches a registered plugin module binding
 * - Records remain structured-clone-safe for Eventa transport
 *
 * Returns:
 * - N/A
 */
export interface PluginModuleWidgetPayload {
  componentProps?: Record<string, any>
  moduleId: string
  payload?: Record<string, any>
  title?: string
  widgetComponent?: string
  windowSize?: PluginModuleWidgetWindowSize
}

/**
 * Snapshot of the current plugin manifest registry.
 *
 * Use when:
 * - Renderer code needs the latest enabled and loaded plugin list
 *
 * Expects:
 * - `plugins` is a stable snapshot derived from the current registry state
 *
 * Returns:
 * - N/A
 */
export interface PluginRegistrySnapshot {
  plugins: PluginManifestSummary[]
  root: string
}

/**
 * Window sizing metadata forwarded through plugin widget payloads.
 *
 * Use when:
 * - A plugin module wants the host to size an extension UI widget window
 *
 * Expects:
 * - Dimensions are pixel values understood by the Electron window layer
 *
 * Returns:
 * - N/A
 */
interface PluginModuleWidgetWindowSize {
  height: number
  maxHeight?: number
  maxWidth?: number
  minHeight?: number
  minWidth?: number
  width: number
}

export const electronPluginList = defineInvokeEventa<PluginRegistrySnapshot>('eventa:invoke:electron:plugins:list')
export const electronPluginSetEnabled = defineInvokeEventa<PluginRegistrySnapshot, { enabled: boolean, extensionId: string, path?: string }>('eventa:invoke:electron:plugins:set-enabled')
export const electronPluginSetAutoReload = defineInvokeEventa<PluginRegistrySnapshot, { enabled: boolean, extensionId: string }>('eventa:invoke:electron:plugins:set-auto-reload')
export const electronPluginLoadEnabled = defineInvokeEventa<PluginRegistrySnapshot>('eventa:invoke:electron:plugins:load-enabled')
export const electronPluginLoad = defineInvokeEventa<PluginRegistrySnapshot, { extensionId: string }>('eventa:invoke:electron:plugins:load')
export const electronPluginUnload = defineInvokeEventa<PluginRegistrySnapshot, { extensionId: string }>('eventa:invoke:electron:plugins:unload')
export const electronPluginInspect = defineInvokeEventa<PluginHostDebugSnapshot>('eventa:invoke:electron:plugins:inspect')
