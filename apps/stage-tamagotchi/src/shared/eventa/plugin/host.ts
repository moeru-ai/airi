import type { PluginCapabilityState } from './capabilities'

import { defineInvokeEventa } from '@moeru/eventa'

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
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
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
  moduleId: string
  title?: string
  widgetComponent?: string
  componentProps?: Record<string, any>
  payload?: Record<string, any>
  windowSize?: PluginModuleWidgetWindowSize
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
  name: string
  entrypoints: Record<string, string | undefined>
  path: string
  enabled: boolean
  autoReload: boolean
  loaded: boolean
  isNew: boolean
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
  root: string
  plugins: PluginManifestSummary[]
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
  id: string
  manifestName: string
  phase: string
  runtime: 'electron' | 'node' | 'web'
  moduleId: string
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
  key: string
  actions: string[]
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
  kitId: string
  version: string
  capabilities: PluginHostKitCapabilitySummary[]
  runtimes: Array<'electron' | 'node' | 'web'>
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
  moduleId: string
  ownerSessionId: string
  ownerPluginId: string
  kitId: string
  kitModuleType: string
  state: 'announced' | 'active' | 'degraded' | 'withdrawn'
  runtime: 'electron' | 'node' | 'web'
  revision: number
  updatedAt: number
  config: Record<string, unknown>
}

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
  registry: PluginRegistrySnapshot
  sessions: PluginHostSessionSummary[]
  kits: PluginHostKitSummary[]
  modules: PluginHostModuleSummary[]
  capabilities: PluginCapabilityState[]
  refreshedAt: number
}

export const electronPluginList = defineInvokeEventa<PluginRegistrySnapshot>('eventa:invoke:electron:plugins:list')
export const electronPluginSetEnabled = defineInvokeEventa<PluginRegistrySnapshot, { name: string, enabled: boolean, path?: string }>('eventa:invoke:electron:plugins:set-enabled')
export const electronPluginSetAutoReload = defineInvokeEventa<PluginRegistrySnapshot, { name: string, enabled: boolean }>('eventa:invoke:electron:plugins:set-auto-reload')
export const electronPluginLoadEnabled = defineInvokeEventa<PluginRegistrySnapshot>('eventa:invoke:electron:plugins:load-enabled')
export const electronPluginLoad = defineInvokeEventa<PluginRegistrySnapshot, { name: string }>('eventa:invoke:electron:plugins:load')
export const electronPluginUnload = defineInvokeEventa<PluginRegistrySnapshot, { name: string }>('eventa:invoke:electron:plugins:unload')
export const electronPluginInspect = defineInvokeEventa<PluginHostDebugSnapshot>('eventa:invoke:electron:plugins:inspect')
