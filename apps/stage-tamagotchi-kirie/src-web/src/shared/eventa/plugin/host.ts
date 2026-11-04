import type {
  ExtensionDirectoryImportPrepareResult,
  PluginHostDebugSnapshot,
  PluginRegistrySnapshot,
} from '@proj-airi/stage-shared/plugin-host'

import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Window sizing metadata forwarded through plugin widget payloads.
 *
 * Use when:
 * - A plugin module wants the host to size an extension UI widget window
 *
 * Expects:
 * - Dimensions are pixel values understood by the host window layer
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

export const airiPluginList = defineInvokeEventa<PluginRegistrySnapshot>('eventa:invoke:airi:plugins:list')
export const airiPluginSetEnabled = defineInvokeEventa<PluginRegistrySnapshot, { extensionId: string, enabled: boolean, path?: string }>('eventa:invoke:airi:plugins:set-enabled')
export const airiPluginSetAutoReload = defineInvokeEventa<PluginRegistrySnapshot, { extensionId: string, enabled: boolean }>('eventa:invoke:airi:plugins:set-auto-reload')
export const airiPluginLoadEnabled = defineInvokeEventa<PluginRegistrySnapshot>('eventa:invoke:airi:plugins:load-enabled')
export const airiPluginLoad = defineInvokeEventa<PluginRegistrySnapshot, { extensionId: string }>('eventa:invoke:airi:plugins:load')
export const airiPluginUnload = defineInvokeEventa<PluginRegistrySnapshot, { extensionId: string }>('eventa:invoke:airi:plugins:unload')
export const airiPluginInspect = defineInvokeEventa<PluginHostDebugSnapshot>('eventa:invoke:airi:plugins:inspect')
export const airiPluginPrepareDirectoryImport = defineInvokeEventa<ExtensionDirectoryImportPrepareResult>('eventa:invoke:airi:plugins:import-directory:prepare')
export const airiPluginCommitDirectoryImport = defineInvokeEventa<PluginRegistrySnapshot, { planId: string }>('eventa:invoke:airi:plugins:import-directory:commit')
export const airiPluginCancelDirectoryImport = defineInvokeEventa<void, { planId: string }>('eventa:invoke:airi:plugins:import-directory:cancel')
