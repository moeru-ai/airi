import type {
  ExtensionDirectoryImportPrepareResult,
  PluginHostDebugSnapshot,
  PluginRegistrySnapshot,
} from '@proj-airi/stage-shared/plugin-host'

import { defineInvokeEventa } from '@moeru/eventa'

export type {
  ExtensionDirectoryImportKitSummary,
  ExtensionDirectoryImportPermissionSummary,
  ExtensionDirectoryImportPlan,
  ExtensionDirectoryImportPrepareResult,
  PluginCapabilityState,
  PluginHostDebugSnapshot,
  PluginHostKitCapabilitySummary,
  PluginHostKitSummary,
  PluginHostModuleSummary,
  PluginHostSessionSummary,
  PluginManifestSummary,
  PluginRegistrySnapshot,
} from '@proj-airi/stage-shared/plugin-host'

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

export const electronPluginList = defineInvokeEventa<PluginRegistrySnapshot>('eventa:invoke:electron:plugins:list')
export const electronPluginSetEnabled = defineInvokeEventa<PluginRegistrySnapshot, { extensionId: string, enabled: boolean, path?: string }>('eventa:invoke:electron:plugins:set-enabled')
export const electronPluginSetAutoReload = defineInvokeEventa<PluginRegistrySnapshot, { extensionId: string, enabled: boolean }>('eventa:invoke:electron:plugins:set-auto-reload')
export const electronPluginLoadEnabled = defineInvokeEventa<PluginRegistrySnapshot>('eventa:invoke:electron:plugins:load-enabled')
export const electronPluginLoad = defineInvokeEventa<PluginRegistrySnapshot, { extensionId: string }>('eventa:invoke:electron:plugins:load')
export const electronPluginUnload = defineInvokeEventa<PluginRegistrySnapshot, { extensionId: string }>('eventa:invoke:electron:plugins:unload')
export const electronPluginInspect = defineInvokeEventa<PluginHostDebugSnapshot>('eventa:invoke:electron:plugins:inspect')
export const electronPluginPrepareDirectoryImport = defineInvokeEventa<ExtensionDirectoryImportPrepareResult>('eventa:invoke:electron:plugins:import-directory:prepare')
export const electronPluginCommitDirectoryImport = defineInvokeEventa<PluginRegistrySnapshot, { planId: string }>('eventa:invoke:electron:plugins:import-directory:commit')
export const electronPluginCancelDirectoryImport = defineInvokeEventa<void, { planId: string }>('eventa:invoke:electron:plugins:import-directory:cancel')
