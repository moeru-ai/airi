import { describe, expect, it } from 'vitest'

import {
  airiPluginGetAssetBaseUrl,
  airiPluginInspect,
  airiPluginInvokeTool,
  airiPluginList,
  airiPluginListAgentTools,
  airiPluginListXsaiTools,
  airiPluginLoad,
  airiPluginLoadEnabled,
  airiPluginSetAutoReload,
  airiPluginSetEnabled,
  airiPluginUnload,
  airiPluginUpdateCapability,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../index'
import {
  airiPluginGetAssetBaseUrl as airiPluginGetAssetBaseUrlFromAssets,
} from './assets'
import {
  airiPluginUpdateCapability as airiPluginUpdateCapabilityFromCapabilities,
  pluginProtocolListProvidersEventName as pluginProtocolListProvidersEventNameFromCapabilities,
  pluginProtocolListProviders as pluginProtocolListProvidersFromCapabilities,
} from './capabilities'
import {
  airiPluginInspect as airiPluginInspectFromHost,
  airiPluginList as airiPluginListFromHost,
  airiPluginLoadEnabled as airiPluginLoadEnabledFromHost,
  airiPluginLoad as airiPluginLoadFromHost,
  airiPluginSetAutoReload as airiPluginSetAutoReloadFromHost,
  airiPluginSetEnabled as airiPluginSetEnabledFromHost,
  airiPluginUnload as airiPluginUnloadFromHost,
} from './host'
import {
  airiPluginInvokeTool as airiPluginInvokeToolFromTools,
  airiPluginListAgentTools as airiPluginListAgentToolsFromTools,
  airiPluginListXsaiTools as airiPluginListXsaiToolsFromTools,
} from './tools'

/**
 * Characterizes the Eventa domain split while keeping the barrel compatible.
 *
 * Use when:
 * - Refactoring plugin IPC contracts into focused shared modules
 * - Verifying existing `shared/eventa` imports still resolve to the same definitions
 *
 * Expects:
 * - Domain modules remain the source of truth for plugin IPC contracts
 * - The compatibility barrel re-exports those exact contract objects
 *
 * Returns:
 * - N/A
 *
 * @example
 * describe('plugin Eventa domain modules', () => {
 *   expect(airiPluginList).toBe(airiPluginListFromHost)
 * })
 */
describe('plugin Eventa domain modules', () => {
  /**
   * Keeps plugin host IPC definitions source-compatible across the split.
   *
   * Use when:
   * - Consumers still import plugin host IPC from `shared/eventa`
   *
   * Expects:
   * - The barrel to re-export the same Eventa definitions from `plugin/host.ts`
   *
   * Returns:
   * - N/A
   *
   * @example
   * it('re-exports plugin host contracts through the compatibility barrel', () => {
   *   expect(airiPluginInspect).toBe(airiPluginInspectFromHost)
   * })
   */
  it('re-exports plugin host contracts through the compatibility barrel', () => {
    expect(airiPluginList).toBe(airiPluginListFromHost)
    expect(airiPluginSetEnabled).toBe(airiPluginSetEnabledFromHost)
    expect(airiPluginSetAutoReload).toBe(airiPluginSetAutoReloadFromHost)
    expect(airiPluginLoadEnabled).toBe(airiPluginLoadEnabledFromHost)
    expect(airiPluginLoad).toBe(airiPluginLoadFromHost)
    expect(airiPluginUnload).toBe(airiPluginUnloadFromHost)
    expect(airiPluginInspect).toBe(airiPluginInspectFromHost)
  })

  /**
   * Keeps plugin capability, tool, and asset IPC grouped under focused modules.
   *
   * Use when:
   * - Verifying the split ownership for non-host plugin IPC contracts
   *
   * Expects:
   * - The barrel to re-export the same Eventa definitions from the focused modules
   *
   * Returns:
   * - N/A
   *
   * @example
   * it('re-exports plugin capability, tool, and asset contracts through the barrel', () => {
   *   expect(pluginProtocolListProviders).toBe(pluginProtocolListProvidersFromCapabilities)
   * })
   */
  it('re-exports plugin capability, tool, and asset contracts through the barrel', () => {
    expect(pluginProtocolListProvidersEventName).toBe(pluginProtocolListProvidersEventNameFromCapabilities)
    expect(pluginProtocolListProviders).toBe(pluginProtocolListProvidersFromCapabilities)
    expect(airiPluginUpdateCapability).toBe(airiPluginUpdateCapabilityFromCapabilities)
    expect(airiPluginListAgentTools).toBe(airiPluginListAgentToolsFromTools)
    expect(airiPluginListXsaiTools).toBe(airiPluginListXsaiToolsFromTools)
    expect(airiPluginInvokeTool).toBe(airiPluginInvokeToolFromTools)
    expect(airiPluginGetAssetBaseUrl).toBe(airiPluginGetAssetBaseUrlFromAssets)
  })
})
