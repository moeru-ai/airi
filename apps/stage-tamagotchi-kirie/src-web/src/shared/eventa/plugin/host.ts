import type { PluginHostDebugSnapshot } from '@proj-airi/stage-shared/plugin-host'

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
  componentProps?: Record<string, unknown>
  payload?: Record<string, unknown>
  windowSize?: PluginModuleWidgetWindowSize
}

export const airiPluginInspect = defineInvokeEventa<PluginHostDebugSnapshot>('eventa:invoke:airi:plugins:inspect')
