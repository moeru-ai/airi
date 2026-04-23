import { describe, expect, it } from 'vitest'

import {
  electronPluginGetAssetBaseUrl,
  electronPluginInspect,
  electronPluginInvokeTool,
  electronPluginList,
  electronPluginListAgentTools,
  electronPluginListXsaiTools,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginSetAutoReload,
  electronPluginSetEnabled,
  electronPluginUnload,
  electronPluginUpdateCapability,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../index'
import {
  electronPluginGetAssetBaseUrl as electronPluginGetAssetBaseUrlFromAssets,
} from './assets'
import {
  electronPluginUpdateCapability as electronPluginUpdateCapabilityFromCapabilities,
  pluginProtocolListProvidersEventName as pluginProtocolListProvidersEventNameFromCapabilities,
  pluginProtocolListProviders as pluginProtocolListProvidersFromCapabilities,
} from './capabilities'
import {
  electronPluginInspect as electronPluginInspectFromHost,
  electronPluginList as electronPluginListFromHost,
  electronPluginLoadEnabled as electronPluginLoadEnabledFromHost,
  electronPluginLoad as electronPluginLoadFromHost,
  electronPluginSetAutoReload as electronPluginSetAutoReloadFromHost,
  electronPluginSetEnabled as electronPluginSetEnabledFromHost,
  electronPluginUnload as electronPluginUnloadFromHost,
} from './host'
import {
  electronPluginInvokeTool as electronPluginInvokeToolFromTools,
  electronPluginListAgentTools as electronPluginListAgentToolsFromTools,
  electronPluginListXsaiTools as electronPluginListXsaiToolsFromTools,
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
 *   expect(electronPluginList).toBe(electronPluginListFromHost)
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
   *   expect(electronPluginInspect).toBe(electronPluginInspectFromHost)
   * })
   */
  it('re-exports plugin host contracts through the compatibility barrel', () => {
    expect(electronPluginList).toBe(electronPluginListFromHost)
    expect(electronPluginSetEnabled).toBe(electronPluginSetEnabledFromHost)
    expect(electronPluginSetAutoReload).toBe(electronPluginSetAutoReloadFromHost)
    expect(electronPluginLoadEnabled).toBe(electronPluginLoadEnabledFromHost)
    expect(electronPluginLoad).toBe(electronPluginLoadFromHost)
    expect(electronPluginUnload).toBe(electronPluginUnloadFromHost)
    expect(electronPluginInspect).toBe(electronPluginInspectFromHost)
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
    expect(electronPluginUpdateCapability).toBe(electronPluginUpdateCapabilityFromCapabilities)
    expect(electronPluginListAgentTools).toBe(electronPluginListAgentToolsFromTools)
    expect(electronPluginListXsaiTools).toBe(electronPluginListXsaiToolsFromTools)
    expect(electronPluginInvokeTool).toBe(electronPluginInvokeToolFromTools)
    expect(electronPluginGetAssetBaseUrl).toBe(electronPluginGetAssetBaseUrlFromAssets)
  })
})
